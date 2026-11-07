-- Товары переезжают из снимка кабинета в таблицу (ADR 0010, шаг 1 переезда
-- на таблицы, решение 7.11: «таблицы сразу»).
--
-- Кабинет по-прежнему присылает товары в составе снимка, но сервер больше не
-- хранит их там: раскладывает по строкам `uklad.products` и при чтении
-- собирает обратно. Так у товара появляется своя строка — её можно сослать
-- из остатков и движений (следующие шаги), правка и удаление пишутся в
-- журнал, удалённое не пропадает, а уходит в корзину (`deleted_at`).
--
-- Карточка кабинета (`Product`) проходит туда и обратно без потерь:
-- известные поля — колонками, всё прочее (и поле не того типа) — в `extra`.
-- Идентификатор кабинета (`ref`) остаётся прежним: на него ссылаются тара,
-- заявки и размещения внутри снимка.

ALTER TABLE uklad.products
  -- Кабинет не требует ни длины, ни уникальности артикула: у каждого склада
  -- свой каталог, а импорт приносит что угодно. Строгая проверка здесь
  -- молча останавливала бы сохранение всего кабинета.
  DROP CONSTRAINT IF EXISTS products_sku_check,
  DROP CONSTRAINT IF EXISTS products_name_check,
  ADD COLUMN ref text,
  ADD COLUMN barcode text,
  ADD COLUMN category text,
  ADD COLUMN width_cm numeric,
  ADD COLUMN height_cm numeric,
  ADD COLUMN depth_cm numeric,
  ADD COLUMN weight_kg numeric,
  ADD COLUMN url text,
  ADD COLUMN image_url text,
  -- Партнёр-продавец и склад кабинета — пока ссылки внутри снимка. Когда
  -- партнёры станут компаниями, а склады строками, их заменят
  -- `seller_org_id` и `warehouse_id`.
  ADD COLUMN partner_ref text,
  ADD COLUMN warehouse_ref text,
  ADD COLUMN extra jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(extra) = 'object'),
  -- Порядок, в котором кабинет показывает товары.
  ADD COLUMN position integer NOT NULL DEFAULT 0,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

DROP INDEX IF EXISTS uklad.products_sku;
UPDATE uklad.products SET ref = id::text WHERE ref IS NULL;
-- Товар, заведённый не кабинетом (будущие маршруты, импорт с площадок),
-- получает свой ref сам.
ALTER TABLE uklad.products
  ALTER COLUMN ref SET NOT NULL,
  ALTER COLUMN ref SET DEFAULT uklad.uuid_v7()::text,
  ADD CHECK (length(ref) BETWEEN 1 AND 100),
  ADD CONSTRAINT products_ref UNIQUE (org_id, ref);
CREATE INDEX products_live ON uklad.products (org_id, position) WHERE deleted_at IS NULL;

-- Строка → карточка кабинета.
CREATE FUNCTION uklad.product_card(p uklad.products) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT p.extra || jsonb_strip_nulls(jsonb_build_object(
    'id', p.ref, 'sku', p.sku, 'name', p.name, 'barcode', p.barcode,
    'category', p.category, 'widthCm', p.width_cm, 'heightCm', p.height_cm,
    'depthCm', p.depth_cm, 'weightKg', p.weight_kg, 'url', p.url,
    'imageUrl', p.image_url, 'partnerId', p.partner_ref, 'warehouseId', p.warehouse_ref))
$$;

-- Товары компании для снимка — в порядке кабинета, без корзины.
CREATE FUNCTION uklad.load_products() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(uklad.product_card(p) ORDER BY p.position, p.created_at), '[]')
  FROM uklad.products p
  WHERE p.org_id = uklad.current_org() AND p.deleted_at IS NULL
$$;

-- Список карточек из снимка → строки компании. Новое добавляется, изменённое
-- переписывается (и только оно: неизменная строка не трогается и в журнал не
-- попадает), пропавшее из списка уходит в корзину, вернувшееся — из неё.
-- Карточку без строкового id, артикула или названия кабинет и сам выбросит
-- при чтении (`isProduct`), поэтому здесь она пропускается.
CREATE FUNCTION uklad.save_products(p_cards jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  IF jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'products must be an array' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS cards (
    ref text, sku text, name text, barcode text, category text,
    width_cm numeric, height_cm numeric, depth_cm numeric, weight_kg numeric,
    url text, image_url text, partner_ref text, warehouse_ref text,
    extra jsonb, position integer) ON COMMIT DROP;
  TRUNCATE pg_temp.cards;

  INSERT INTO pg_temp.cards
  SELECT DISTINCT ON (c->>'id')
    c->>'id', c->>'sku', c->>'name',
    CASE WHEN jsonb_typeof(c->'barcode') = 'string' THEN c->>'barcode' END,
    CASE WHEN jsonb_typeof(c->'category') = 'string' THEN c->>'category' END,
    CASE WHEN jsonb_typeof(c->'widthCm') = 'number' THEN (c->>'widthCm')::numeric END,
    CASE WHEN jsonb_typeof(c->'heightCm') = 'number' THEN (c->>'heightCm')::numeric END,
    CASE WHEN jsonb_typeof(c->'depthCm') = 'number' THEN (c->>'depthCm')::numeric END,
    CASE WHEN jsonb_typeof(c->'weightKg') = 'number' THEN (c->>'weightKg')::numeric END,
    CASE WHEN jsonb_typeof(c->'url') = 'string' THEN c->>'url' END,
    CASE WHEN jsonb_typeof(c->'imageUrl') = 'string' THEN c->>'imageUrl' END,
    CASE WHEN jsonb_typeof(c->'partnerId') = 'string' THEN c->>'partnerId' END,
    CASE WHEN jsonb_typeof(c->'warehouseId') = 'string' THEN c->>'warehouseId' END,
    -- В `extra` — всё, что не легло в колонку: иначе поле не того типа
    -- молча пропало бы при следующем чтении.
    c - 'id' - 'sku' - 'name'
      - ARRAY(SELECT k FROM unnest(ARRAY['barcode', 'category', 'url', 'imageUrl',
                                         'partnerId', 'warehouseId']) k
              WHERE jsonb_typeof(c->k) = 'string')
      - ARRAY(SELECT k FROM unnest(ARRAY['widthCm', 'heightCm', 'depthCm', 'weightKg']) k
              WHERE jsonb_typeof(c->k) = 'number'),
    n::integer
  FROM jsonb_array_elements(p_cards) WITH ORDINALITY AS t(c, n)
  WHERE jsonb_typeof(c) = 'object'
    AND jsonb_typeof(c->'id') = 'string' AND length(c->>'id') BETWEEN 1 AND 100
    AND jsonb_typeof(c->'sku') = 'string' AND jsonb_typeof(c->'name') = 'string'
  ORDER BY c->>'id', n;

  INSERT INTO uklad.products AS p (org_id, ref, sku, name, barcode, category,
    width_cm, height_cm, depth_cm, weight_kg, url, image_url, partner_ref,
    warehouse_ref, extra, position)
  SELECT uklad.current_org(), ref, sku, name, barcode, category, width_cm,
    height_cm, depth_cm, weight_kg, url, image_url, partner_ref, warehouse_ref,
    extra, position
  FROM pg_temp.cards
  ON CONFLICT (org_id, ref) DO UPDATE SET
    sku = excluded.sku, name = excluded.name, barcode = excluded.barcode,
    category = excluded.category, width_cm = excluded.width_cm,
    height_cm = excluded.height_cm, depth_cm = excluded.depth_cm,
    weight_kg = excluded.weight_kg, url = excluded.url, image_url = excluded.image_url,
    partner_ref = excluded.partner_ref, warehouse_ref = excluded.warehouse_ref,
    extra = excluded.extra, position = excluded.position,
    deleted_at = NULL, updated_at = now()
  WHERE p.deleted_at IS NOT NULL
    OR (p.sku, p.name, p.barcode, p.category, p.width_cm, p.height_cm, p.depth_cm,
        p.weight_kg, p.url, p.image_url, p.partner_ref, p.warehouse_ref, p.extra,
        p.position)
       IS DISTINCT FROM
       (excluded.sku, excluded.name, excluded.barcode, excluded.category,
        excluded.width_cm, excluded.height_cm, excluded.depth_cm, excluded.weight_kg,
        excluded.url, excluded.image_url, excluded.partner_ref, excluded.warehouse_ref,
        excluded.extra, excluded.position);

  UPDATE uklad.products p SET deleted_at = now(), updated_at = now()
  WHERE p.org_id = uklad.current_org() AND p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM pg_temp.cards c WHERE c.ref = p.ref);
END $$;

-- Функции товаров вызывает только сервер (роль приложения), как и auth.*.
REVOKE EXECUTE ON FUNCTION uklad.product_card(uklad.products), uklad.load_products(),
  uklad.save_products(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uklad.product_card(uklad.products), uklad.load_products(),
  uklad.save_products(jsonb) TO uklad_app;

-- Карточки, которые перенос не возьмёт (нет строкового id, артикула или
-- названия), не пропадают молча: они копируются сюда как были, а число
-- пишется в вывод миграции. Кабинет такие и сам выбросил бы при чтении.
CREATE SCHEMA IF NOT EXISTS meta;
CREATE TABLE meta.products_013_backup (
  org_id uuid NOT NULL,
  card jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
);

-- Перенос: товары каждой компании — из снимка в строки. Снимки закрыты RLS
-- даже от владельца таблиц (FORCE), поэтому на время переноса защита снята,
-- а компания для политик `uklad.products` ставится той же настройкой, что
-- ставит сервер на запрос.
ALTER TABLE uklad.cabinet_snapshots NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  s record;
  skipped integer;
BEGIN
  INSERT INTO meta.products_013_backup (org_id, card)
  SELECT cs.org_id, c
  FROM uklad.cabinet_snapshots cs, jsonb_array_elements(cs.data->'products') c
  WHERE jsonb_typeof(cs.data->'products') = 'array'
    -- coalesce: у карточки без поля сравнение даёт NULL, а не «нет».
    AND NOT coalesce(jsonb_typeof(c) = 'object'
      AND jsonb_typeof(c->'id') = 'string' AND length(c->>'id') BETWEEN 1 AND 100
      AND jsonb_typeof(c->'sku') = 'string' AND jsonb_typeof(c->'name') = 'string', false);
  GET DIAGNOSTICS skipped = ROW_COUNT;
  IF skipped > 0 THEN
    RAISE NOTICE 'Товары: % карточек без id, артикула или названия сохранены в meta.products_013_backup', skipped;
  END IF;

  FOR s IN SELECT org_id, data->'products' AS cards FROM uklad.cabinet_snapshots
           WHERE jsonb_typeof(data->'products') = 'array'
  LOOP
    PERFORM set_config('app.org_id', s.org_id::text, true);
    PERFORM uklad.save_products(s.cards);
  END LOOP;
  PERFORM set_config('app.org_id', '', true);
  UPDATE uklad.cabinet_snapshots SET data = data - 'products' WHERE data ? 'products';
END $$;
ALTER TABLE uklad.cabinet_snapshots FORCE ROW LEVEL SECURITY;

-- Правка карточки — в журнал, как остатки: кто и что поменял, а удаление —
-- это запись с `deleted_at`, а не пропажа строки. Триггер ставится после
-- переноса намеренно: перенос — не правка, и журнал начинается с чистого
-- листа; что было до него, хранит резервная копия базы (pg_dump перед
-- миграцией, см. deploy/README).
CREATE TRIGGER products_log AFTER INSERT OR UPDATE ON uklad.products
  FOR EACH ROW EXECUTE FUNCTION uklad.log_stock_change();
