-- Лимит складов тарифа и «заготовка» (ревью безопасности #218, 20.11).
--
-- В 051 `uklad.count_warehouses` не считала склады с пометкой `placeholder`.
-- Пометку присылает кабинет, а сервер по ней ничего не ограничивает: на
-- заготовке работают столы, сотрудники и строки работы. Собранным руками
-- запросом можно было пометить живые склады заготовками и завести новые
-- сверх тарифа.
--
-- Теперь бесплатна не больше одной заготовки, и только пустая: без плана
-- этажей, без строк работы склада и без людей с этим складом. Всё остальное с
-- пометкой считается обычным складом. У новой компании так и есть: одна
-- пустая заготовка, ноль складов.

CREATE OR REPLACE FUNCTION uklad.count_warehouses() RETURNS integer
LANGUAGE sql STABLE AS $$
  WITH live AS (
    SELECT w.ref, w.placeholder, w.card
    FROM uklad.warehouses w
    WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
  ), empty_placeholder AS (
    SELECT 1 FROM live l
    WHERE l.placeholder
      AND coalesce(jsonb_typeof(l.card->'floors') <> 'array'
                   OR jsonb_array_length(l.card->'floors') = 0, true)
      AND NOT EXISTS (SELECT 1 FROM uklad.cabinet_records r
                      WHERE r.org_id = uklad.current_org() AND r.warehouse_ref = l.ref
                        AND r.deleted_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM uklad.members m
                      WHERE m.org_id = uklad.current_org() AND m.warehouse_ref = l.ref
                        AND m.deleted_at IS NULL)
    LIMIT 1
  )
  SELECT ((SELECT count(*) FROM live) - (SELECT count(*) FROM empty_placeholder))::int
$$;

REVOKE EXECUTE ON FUNCTION uklad.count_warehouses() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uklad.count_warehouses() TO uklad_app;
