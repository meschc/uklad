-- Общий каталог компании с несколькими складами — по складам (Кирилл 22.11:
-- «Первому складу»). Миграция 059 отдала товары без склада единственному
-- складу компании, а у компании с несколькими складами оставила их общими до
-- решения владельца. Товар, который уже работает ровно на одном складе
-- (остаток в `uklad.stock` или живая запись работы в `cabinet_records`),
-- уходит этому складу: иначе стол того склада перестал бы узнавать его скан.
-- Остальные товары без склада забирает первый склад компании — по
-- `position`, потом по времени, как роли в 058. Копий нет. Затем склады, где
-- товаров без склада не осталось, получают свой каталог (`ownCatalog`).
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
    CREATE TEMP TABLE IF NOT EXISTS m061_seen (id uuid, ref text) ON COMMIT DROP;
    TRUNCATE m061_seen;
    INSERT INTO m061_seen
    SELECT DISTINCT p.id, w.ref FROM uklad.products p
    JOIN uklad.warehouses w ON w.org_id = p.org_id AND w.deleted_at IS NULL
      AND w.card IS NOT NULL AND NOT w.placeholder
    WHERE p.org_id = o.org_id AND p.warehouse_ref IS NULL
      AND (EXISTS (SELECT 1 FROM uklad.stock s
                   WHERE s.org_id = p.org_id AND s.product_id = p.id
                     AND s.warehouse_id = w.id AND s.qty > 0)
        OR EXISTS (SELECT 1 FROM uklad.cabinet_records r
                   WHERE r.org_id = p.org_id AND r.warehouse_ref = w.ref
                     AND r.deleted_at IS NULL
                     AND strpos(r.data::text, to_jsonb(p.ref)::text) > 0));
    -- Работает ровно на одном складе — тому складу.
    UPDATE uklad.products p SET warehouse_ref = one.ref
    FROM (SELECT id, min(ref) AS ref FROM m061_seen GROUP BY id
          HAVING count(*) = 1) one
    WHERE p.id = one.id AND p.org_id = o.org_id;
    -- Работает на нескольких складах — решает владелец, миграция называет.
    SELECT count(*) INTO busy FROM (SELECT id FROM m061_seen GROUP BY id
                                    HAVING count(*) > 1) x;
    IF busy > 0 THEN
      RAISE NOTICE 'Компания %: % товаров работают на нескольких складах, отданы первому %',
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
