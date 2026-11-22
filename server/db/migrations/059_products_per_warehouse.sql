-- Товары у каждого склада свои (Кирилл 22.11: «для каждого склада всё своё»).
--
-- Карточка товара уже знает свой склад (`warehouse_ref`, 013): кабинет ставит
-- его товару, заведённому на складе со своим каталогом (`ownCatalog`), а
-- товар без склада — общий демо-каталог для складов без своего каталога.
-- Но запись `uklad.save_products(cards)` — весь каталог компании: пропавшее
-- из списка уходит в корзину. Руководитель склада Б получает только товары
-- своего склада, и такая запись унесла бы в корзину товары склада А.
--
-- Здесь — запись каталога одного склада: трогает только строки этого склада
-- (и общие, если у склада нет своего каталога), чужую карточку не переписывает
-- и чужой склад товару не ставит — отказ `products:foreign`. Позиции чужих
-- строк не двигаются, поэтому их правка не попадает в журнал.

CREATE FUNCTION uklad.save_products(p_cards jsonb, p_warehouse text, p_shared boolean)
RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  IF jsonb_typeof(p_cards) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'products must be an array' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_warehouse IS NULL OR length(p_warehouse) = 0 THEN
    RAISE EXCEPTION 'warehouse is required' USING ERRCODE = 'invalid_parameter_value';
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
    -- Товар без склада на складе со своим каталогом — товар этого склада.
    CASE WHEN jsonb_typeof(c->'warehouseId') = 'string' THEN c->>'warehouseId'
         WHEN NOT p_shared THEN p_warehouse END,
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

  -- Карточка чужого склада или с чужим складом — отказ целиком: молча
  -- пропущенная правка выглядела бы сохранённой. Строка в корзине — тоже:
  -- иначе карточку чужого склада можно было бы «вернуть» к себе.
  IF EXISTS (
    SELECT 1 FROM pg_temp.cards c
    WHERE c.warehouse_ref IS DISTINCT FROM p_warehouse
      AND NOT (p_shared AND c.warehouse_ref IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM pg_temp.cards c
    JOIN uklad.products p ON p.org_id = uklad.current_org() AND p.ref = c.ref
    WHERE p.warehouse_ref IS DISTINCT FROM p_warehouse
      AND NOT (p_shared AND p.warehouse_ref IS NULL)
  ) THEN
    RAISE EXCEPTION 'products:foreign' USING ERRCODE = 'insufficient_privilege';
  END IF;

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

  -- В корзину — только пропавшее со своего склада.
  UPDATE uklad.products p SET deleted_at = now(), updated_at = now()
  WHERE p.org_id = uklad.current_org() AND p.deleted_at IS NULL
    AND (p.warehouse_ref = p_warehouse OR (p_shared AND p.warehouse_ref IS NULL))
    AND NOT EXISTS (SELECT 1 FROM pg_temp.cards c WHERE c.ref = p.ref);
END $$;

REVOKE EXECUTE ON FUNCTION uklad.save_products(jsonb, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uklad.save_products(jsonb, text, boolean) TO uklad_app;
