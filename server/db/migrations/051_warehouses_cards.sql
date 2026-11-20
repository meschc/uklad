-- Склады переезжают из снимка кабинета в таблицу (ADR 0010, «Что уже ушло из
-- снимка»; план переноса 20.11: склады первыми — без них сервер не считает
-- лимит складов тарифа).
--
-- Кабинет по-прежнему присылает склады в составе кабинета (`warehouse` —
-- открытый, `otherWarehouses` — остальные), но сервер хранит их строками
-- `uklad.warehouses` и при чтении собирает обратно, тот же JSON. Таблица уже
-- была (миграция 003, под договоры и остатки), строк в ней кабинет не писал;
-- её строки без карточки (`card IS NULL`) кабинету не видны и не трогаются.
--
-- Карточка склада проходит туда и обратно без потерь: `card` — весь объект
-- кабинета без `id`, `ref` — id кабинета (на него ссылаются бейджи, участники,
-- строки работы склада). Название, тип, адрес и «заготовка» — ещё и
-- колонками: по ним сервер считает склады и ищет их, не разбирая JSON. План
-- этажей, сотрудники и партнёры пока лежат в карточке и уйдут своими шагами.
-- Порядок: `position` 0 — склад, открытый у руководителя.

ALTER TABLE uklad.warehouses
  -- Название кабинет не проверяет (у заготовки его может не быть): строгая
  -- проверка молча остановила бы запись всего кабинета.
  DROP CONSTRAINT IF EXISTS warehouses_name_check,
  ALTER COLUMN name DROP NOT NULL,
  ADD COLUMN ref text,
  ADD COLUMN kind text,
  ADD COLUMN address text,
  ADD COLUMN placeholder boolean NOT NULL DEFAULT false,
  ADD COLUMN card jsonb CHECK (card IS NULL OR jsonb_typeof(card) = 'object'),
  ADD COLUMN position integer NOT NULL DEFAULT 0,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE uklad.warehouses SET ref = id::text WHERE ref IS NULL;
ALTER TABLE uklad.warehouses
  ALTER COLUMN ref SET NOT NULL,
  ALTER COLUMN ref SET DEFAULT uklad.uuid_v7()::text,
  ADD CHECK (length(ref) BETWEEN 1 AND 100),
  ADD CONSTRAINT warehouses_ref UNIQUE (org_id, ref);
CREATE INDEX warehouses_cards ON uklad.warehouses (org_id, position)
  WHERE deleted_at IS NULL AND card IS NOT NULL;

-- Годен ли список карточек для таблицы: у каждой строковый id, id не
-- повторяются. Негодный список остаётся в документе как был (`warehouses.js`
-- решает так же): лучше вес снимка, чем пропавший склад.
CREATE FUNCTION uklad.warehouse_cards_ok(p_cards jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_typeof(p_cards) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_cards) c
      WHERE NOT coalesce(jsonb_typeof(c) = 'object' AND jsonb_typeof(c->'id') = 'string'
                         AND length(c->>'id') BETWEEN 1 AND 100, false))
    AND (SELECT count(DISTINCT c->>'id') = count(*) FROM jsonb_array_elements(p_cards) c)
$$;

-- Склады компании для кабинета — в порядке кабинета, без корзины.
CREATE FUNCTION uklad.load_warehouses() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(w.card || jsonb_build_object('id', w.ref)
                            ORDER BY w.position, w.created_at), '[]')
  FROM uklad.warehouses w
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
$$;

-- Список карточек кабинета (первая — открытый склад) → строки компании.
-- Изменённое переписывается (и только оно), пропавшее уходит в корзину,
-- вернувшееся — из неё. Негодный список не пишется вовсе.
CREATE FUNCTION uklad.save_warehouses(p_cards jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  IF NOT uklad.warehouse_cards_ok(p_cards) THEN
    RAISE EXCEPTION 'warehouses must be cards with unique ids'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO uklad.warehouses AS w (org_id, ref, name, kind, address, placeholder, card, position)
  SELECT uklad.current_org(), c->>'id',
    CASE WHEN jsonb_typeof(c->'name') = 'string' THEN left(c->>'name', 500) END,
    CASE WHEN jsonb_typeof(c->'kind') = 'string' THEN left(c->>'kind', 100) END,
    CASE WHEN jsonb_typeof(c->'address') = 'string' THEN left(c->>'address', 1000) END,
    coalesce(c->'placeholder' = 'true'::jsonb, false),
    c - 'id', (n - 1)::integer
  FROM jsonb_array_elements(p_cards) WITH ORDINALITY AS t(c, n)
  ON CONFLICT (org_id, ref) DO UPDATE SET
    name = excluded.name, kind = excluded.kind, address = excluded.address,
    placeholder = excluded.placeholder, card = excluded.card, position = excluded.position,
    deleted_at = NULL, updated_at = now()
  WHERE w.deleted_at IS NOT NULL
    OR (w.card, w.position) IS DISTINCT FROM (excluded.card, excluded.position);

  UPDATE uklad.warehouses w SET deleted_at = now(), updated_at = now()
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_cards) c WHERE c->>'id' = w.ref);
END $$;

-- Сколько у компании складов для лимита тарифа: живые, кроме заготовки.
CREATE FUNCTION uklad.count_warehouses() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int FROM uklad.warehouses w
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL
    AND w.card IS NOT NULL AND NOT w.placeholder
$$;

REVOKE EXECUTE ON FUNCTION uklad.warehouse_cards_ok(jsonb), uklad.load_warehouses(),
  uklad.save_warehouses(jsonb), uklad.count_warehouses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uklad.warehouse_cards_ok(jsonb), uklad.load_warehouses(),
  uklad.save_warehouses(jsonb), uklad.count_warehouses() TO uklad_app;

-- Удаление компании (миграция 009) стирает её снимок — вместе с ним уходят
-- и склады кабинета: в карточках телефоны и почты сотрудников. Строки без
-- карточки (договоры, остатки) не трогаются.
CREATE FUNCTION uklad.drop_cabinet_warehouses() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', OLD.org_id::text, true);
  DELETE FROM uklad.warehouses WHERE org_id = OLD.org_id AND card IS NOT NULL;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION uklad.drop_cabinet_warehouses() FROM PUBLIC;
CREATE TRIGGER cabinet_warehouses_drop AFTER DELETE ON uklad.cabinet_snapshots
  FOR EACH ROW EXECUTE FUNCTION uklad.drop_cabinet_warehouses();

-- Перенос: склады каждой компании — из снимка в строки, и из документа их
-- больше нет. Документ с негодным списком остаётся как был. Снимки закрыты
-- RLS даже от владельца таблиц (FORCE), поэтому на время переноса защита
-- снята, а компания для политик ставится той же настройкой, что ставит сервер.
ALTER TABLE uklad.cabinet_snapshots NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  s record;
  cards jsonb;
  left_as_is integer := 0;
BEGIN
  FOR s IN SELECT org_id, data FROM uklad.cabinet_snapshots
           WHERE jsonb_typeof(data->'warehouse') = 'object'
  LOOP
    cards := jsonb_build_array(s.data->'warehouse')
      || CASE WHEN jsonb_typeof(s.data->'otherWarehouses') = 'array'
              THEN s.data->'otherWarehouses' ELSE '[]'::jsonb END;
    IF NOT uklad.warehouse_cards_ok(cards) THEN
      left_as_is := left_as_is + 1;
      CONTINUE;
    END IF;
    PERFORM set_config('app.org_id', s.org_id::text, true);
    PERFORM uklad.save_warehouses(cards);
    UPDATE uklad.cabinet_snapshots SET data = data - 'warehouse' - 'otherWarehouses'
    WHERE org_id = s.org_id;
  END LOOP;
  PERFORM set_config('app.org_id', '', true);
  IF left_as_is > 0 THEN
    RAISE NOTICE 'Склады: % снимков с негодным списком складов остались как были', left_as_is;
  END IF;
END $$;
ALTER TABLE uklad.cabinet_snapshots FORCE ROW LEVEL SECURITY;
