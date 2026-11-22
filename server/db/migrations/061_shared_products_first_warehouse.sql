-- Общий каталог компании с несколькими складами — первому складу (Кирилл
-- 22.11, решение на карточке: «Первому складу»). Миграция 059 отдала товары
-- без склада единственному складу компании, а у компании с несколькими
-- складами оставила их общими до решения владельца. Решение: товары без
-- склада забирает первый склад компании — по `position`, потом по времени,
-- как роли в 058. Копий другим складам нет. Затем склады, где товаров без
-- склада не осталось, получают свой каталог (`ownCatalog`).
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.products NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  o record;
BEGIN
  FOR o IN
    SELECT DISTINCT ON (w.org_id) w.org_id, w.ref FROM uklad.warehouses w
    WHERE w.card IS NOT NULL AND w.deleted_at IS NULL AND NOT w.placeholder
      AND EXISTS (SELECT 1 FROM uklad.products p
                  WHERE p.org_id = w.org_id AND p.warehouse_ref IS NULL)
    ORDER BY w.org_id, w.position, w.created_at, w.ref
  LOOP
    -- Журнал правок карточек (`products_log`) пишет под компанией строки.
    PERFORM set_config('app.org_id', o.org_id::text, true);
    UPDATE uklad.products SET warehouse_ref = o.ref
    WHERE org_id = o.org_id AND warehouse_ref IS NULL;
  END LOOP;
  PERFORM set_config('app.org_id', '', true);

  UPDATE uklad.warehouses w SET card = w.card || '{"ownCatalog": true}'::jsonb
  WHERE w.card IS NOT NULL AND NOT (w.card ? 'ownCatalog')
    AND NOT EXISTS (SELECT 1 FROM uklad.products p
                    WHERE p.org_id = w.org_id AND p.warehouse_ref IS NULL
                      AND p.deleted_at IS NULL);
END $$;
ALTER TABLE uklad.products FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
