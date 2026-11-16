-- Смена процесса за столом без выхода, с подтверждением старшего
-- (`server/api/src/cabinet/deskSwitch.js`). Кирилл 15–16.11: упаковщик
-- перешёл на сортировку с тем же ТСД — выходить и сканировать бейдж заново
-- странно, но и переходить бесконтрольно нельзя. Сотрудник просит переход
-- на ТСД, старший разрешает у себя на рабочем месте, процесс меняет сервер.
--
-- Заявка — строка `desk_switch_requests`: кто, с какого стола, откуда и
-- куда, кто и когда решил. Разрешённую заявку стол сотрудника применяет
-- (`applied_at`), и тогда переход ложится строкой журнала операций стола
-- `station_switch` с подтвердившим. Последний такой переход человека за
-- смену у стола — его текущий процесс: операции другого процесса сервер
-- помечает `station` (`deskOps.js`). Снимок кабинета не меняется.

CREATE TABLE uklad.desk_switch_requests (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  desk_id uuid NOT NULL,
  -- Склад стола (id внутри снимка): старший видит заявки только своего склада.
  warehouse_ref text NOT NULL CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  staff_ref text NOT NULL CHECK (length(staff_ref) BETWEEN 1 AND 100),
  station text NOT NULL CHECK (length(station) BETWEEN 1 AND 20),
  from_station text CHECK (length(from_station) <= 20),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'applied')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by text CHECK (length(decided_by) <= 100),
  applied_at timestamptz
);
CREATE INDEX desk_switch_requests_open
  ON uklad.desk_switch_requests (org_id, warehouse_ref, status, requested_at);

ALTER TABLE uklad.desk_switch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_switch_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY desk_switch_requests_own ON uklad.desk_switch_requests
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
-- Заявки не удаляются: по ним видно, кто кого куда переводил.
GRANT SELECT, INSERT, UPDATE ON uklad.desk_switch_requests TO uklad_app;

ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count', 'sort_place',
                  'sort_close', 'inv_cell', 'station_switch'));

DROP FUNCTION auth.desk_journal(text, integer);

CREATE FUNCTION auth.desk_journal(p_device text, p_limit integer)
RETURNS TABLE (at timestamptz, staff_ref text, kind text, status text, refs jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT coalesce(o.happened_at, o.received_at), o.staff_ref, o.kind, o.status,
         jsonb_strip_nulls(jsonb_build_object(
           'productId', o.body->>'productId',
           'toteId', o.body->>'toteId',
           'boxId', o.body->>'boxId',
           'palletId', o.body->>'palletId',
           'orderId', o.body->>'orderId',
           'outboundCode', o.body->>'outboundCode',
           -- Сырой скан может нести служебные части (GS1, chr(29)) и быть
           -- длинным: журналу хватает первой части, не длиннее 64 знаков.
           'code', left(split_part(o.body->>'code', chr(29), 1), 64),
           'qty', o.body->'qty',
           'station', CASE WHEN o.kind = 'station_switch' THEN o.body->>'station' END,
           'approvedBy', CASE WHEN o.kind = 'station_switch' THEN o.body->>'approvedBy' END
         ))
  FROM uklad.desk_ops o
  JOIN auth.desk_sessions d ON d.id = o.desk_id AND d.org_id = o.org_id
  WHERE uklad.current_org() IS NOT NULL
    AND o.org_id = uklad.current_org()
    AND d.device_ref = p_device
  ORDER BY 1 DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

REVOKE EXECUTE ON FUNCTION auth.desk_journal(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.desk_journal(text, integer) TO uklad_app;
