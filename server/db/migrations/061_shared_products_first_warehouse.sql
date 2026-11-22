-- Общий каталог компании с несколькими складами — первому складу (Кирилл
-- 22.11, решение на карточке: «Первому складу»). Миграция 059 отдала товары
-- без склада единственному складу компании, а у компании с несколькими
-- складами оставила их общими до решения владельца. Решение: товары без
-- склада забирает первый склад компании — по `position`, потом по времени,
-- как роли в 058. Копий другим складам нет. Затем склады, где товаров без
-- склада не осталось, получают свой каталог (`ownCatalog`).
--
-- Товар, который уже работает на другом складе (остаток в `uklad.stock` или
-- запись работы склада в `cabinet_records`), после переноса тот склад не
-- увидит: стол не узнает скан. Миграция его не трогает молча, а называет:
-- NOTICE со счётом по компаниям — такие решаем вручную до выкладки.
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.products NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  o record;
  busy integer;
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
    SELECT count(*) INTO busy FROM uklad.products p
    WHERE p.org_id = o.org_id AND p.warehouse_ref IS NULL AND p.deleted_at IS NULL
      AND (EXISTS (SELECT 1 FROM uklad.stock s JOIN uklad.warehouses w
                     ON w.org_id = s.org_id AND w.id = s.warehouse_id
                   WHERE s.org_id = o.org_id AND s.product_id = p.id AND s.qty > 0
                     AND w.ref IS DISTINCT FROM o.ref)
        OR EXISTS (SELECT 1 FROM uklad.cabinet_records r
                   WHERE r.org_id = o.org_id AND r.warehouse_ref NOT IN ('', o.ref)
                     AND r.deleted_at IS NULL
                     AND strpos(r.data::text, to_jsonb(p.ref)::text) > 0));
    IF busy > 0 THEN
      RAISE NOTICE 'Компания %: % товаров работают не на первом складе %',
        o.org_id, busy, o.ref;
    END IF;
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
