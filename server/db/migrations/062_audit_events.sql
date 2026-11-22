-- Журнал действий руководителей (Кирилл 22.11, до запуска): «мне нужны все
-- действия, чтобы они писались как в логи для отправки в поддержку, так и в
-- журнал действий — удаление товаров, интеграции, персонал, все действия».
--
-- Операции столов уже лежат в `desk_ops`, движения товара — в `stock_moves`.
-- Здесь — всё остальное, что меняют люди в кабинете: роли, приглашения,
-- доступ, подключения площадок, удаление товаров. Одна строка — одно
-- действие. Только id и коды, без имён, почт и ключей: журнал уходит в отчёт
-- поддержке (удаление компании по 152-ФЗ должно будет обезличить или
-- удалить и эти строки: `org_id` без каскада). Пишется тем же запросом, что и само действие, поэтому
-- отменённое действие в журнал не попадает.
CREATE TABLE uklad.audit_events (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  at timestamptz NOT NULL DEFAULT now(),
  -- Склад, чьё это действие; NULL — компании целиком (видит только владелец).
  warehouse_ref text CHECK (length(warehouse_ref) BETWEEN 1 AND 200),
  -- Кто: участник команды из сессии; NULL — без входа в кабинет (стол,
  -- подкачка, сервер сам), тогда кто — по `source` и `staff_ref`.
  member_id uuid DEFAULT uklad.current_member(),
  source text NOT NULL DEFAULT 'cabinet'
    CHECK (source IN ('cabinet', 'desk', 'pull', 'system')),
  -- Сотрудник у стола (`warehouse.staff[].id`), если действие со стола.
  staff_ref text CHECK (length(staff_ref) BETWEEN 1 AND 100),
  -- Что: «предмет.действие», например `role.save`, `connector.delete`.
  action text NOT NULL CHECK (action ~ '^[a-z]{2,30}\.[a-z_]{2,30}$'),
  -- С чем: id роли, человека, подключения, товара.
  target text CHECK (length(target) BETWEEN 1 AND 200),
  -- Подробности — коды и id, не больше пары килобайт.
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object' AND length(details::text) <= 2000)
);
CREATE INDEX audit_events_place ON uklad.audit_events (org_id, warehouse_ref, at DESC);

ALTER TABLE uklad.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_read ON uklad.audit_events FOR SELECT
  USING (org_id = uklad.current_org());
CREATE POLICY audit_events_write ON uklad.audit_events FOR INSERT
  WITH CHECK (org_id = uklad.current_org()
              AND member_id IS NOT DISTINCT FROM uklad.current_member()
              -- Из кабинета — всегда с участником: «система» без лица только
              -- у серверного кода без сессии кабинета.
              AND (source <> 'cabinet' OR member_id IS NOT NULL));

-- Только читать и дописывать: журнал не правят и не чистят.
GRANT SELECT, INSERT ON uklad.audit_events TO uklad_app;
