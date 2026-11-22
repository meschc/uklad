-- Подключения площадок у каждого склада свои (Кирилл 22.11, #246).
--
-- Подключение без склада (до миграции 050) работает, пока склад у компании
-- один: подкачка и стол берут его единственный склад. Появится второй склад —
-- такое подключение молча перестаёт заводить заказы. Поэтому у компании с
-- одним складом подключение без склада получает этот склад сейчас; новые
-- сервер привязывает сам при сохранении. У компании с несколькими складами
-- склад такому подключению выбирает владелец.

ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.connector_accounts NO FORCE ROW LEVEL SECURITY;
UPDATE uklad.connector_accounts a
SET params = coalesce(a.params, '{}'::jsonb) || jsonb_build_object('warehouseId', w.ref)
FROM (
  SELECT org_id, min(ref) AS ref FROM uklad.warehouses
  WHERE card IS NOT NULL AND deleted_at IS NULL AND NOT placeholder
  GROUP BY org_id HAVING count(*) = 1
) w
WHERE a.org_id = w.org_id AND a.deleted_at IS NULL
  AND NOT (coalesce(a.params, '{}'::jsonb) ? 'warehouseId');
ALTER TABLE uklad.connector_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
