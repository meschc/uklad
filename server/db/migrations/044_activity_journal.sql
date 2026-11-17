-- Общий журнал действий склада (раздел «Журнал действий» в кабинете).
--
-- Кирилл 15.11: «всегда есть посекундная история действий… каждый пик
-- заносится в эту базу… складу нужно будет посмотреть конкретную секунду, в
-- будущем свяжем с камерами». Операции стола уже лежат строками
-- (`uklad.desk_ops`, миграция 015) со временем до миллисекунды, сотрудником,
-- устройством и отказами, но их было видно только по одному устройству,
-- 200 последних (`auth.desk_journal`, миграции 026, 029).
--
-- Эта миграция даёт им то, без чего общий журнал склада не собрать:
--
--   · `warehouse_ref` — на каком складе случилось. Своей колонки склада у
--     стола нет (`deskPlace.js`): склад узнаётся по устройству в снимке. Снимут
--     устройство со склада — без колонки пропала бы и вся его история. Новые
--     строки сервер пишет со складом сам; старые получают склад по нынешней
--     привязке устройства (одно устройство — один склад, иначе пусто).
--   · `step` — какой это скан: приёмка, размещение, сборка, упаковка,
--     этикетка, сортировка, отгрузка, инвентаризация, решение старшего, смена.
--     Ключ, по которому склад потом считает статистику, а журнал фильтрует.
--   · `counted` — «пик за единицу работы»: снятая, принятая, упакованная штука
--     или разложенная посылка. Этикетка, тара, итог («заявка собрана»),
--     отказ сервера и скан не того товара в журнале есть, но в счёт не идут.
--
-- `step` и `counted` вычисляются из вида и тела операции (GENERATED), а не
-- пишутся кодом: одно правило для старых и новых строк, сервер не может
-- записать «в счёт» то, что им не является. Правило поменяется — новой
-- миграцией, как и список видов операций.

ALTER TABLE uklad.desk_ops
  ADD COLUMN warehouse_ref text CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  ADD COLUMN step text GENERATED ALWAYS AS (
    CASE
      WHEN kind IN ('shift_mark', 'shift_undo', 'station_switch') THEN 'shift'
      WHEN kind = 'recv_place' THEN 'place'
      WHEN kind LIKE 'recv\_%' THEN 'receive'
      WHEN kind LIKE 'pick\_%' THEN 'pick'
      WHEN kind = 'pack_event' AND body->>'type' IN ('pack_label', 'pack_reprint') THEN 'label'
      WHEN kind LIKE 'pack\_%' THEN 'pack'
      WHEN kind LIKE 'sort\_%' THEN 'sort'
      WHEN kind = 'ship_run' THEN 'ship'
      WHEN kind LIKE 'inv\_%' THEN 'inventory'
      WHEN kind = 'dispute_resolve' THEN 'dispute'
      ELSE 'other'
    END
  ) STORED,
  ADD COLUMN counted boolean GENERATED ALWAYS AS (
    status = 'applied' AND (
      kind IN ('pick_unit', 'recv_unit', 'sort_place')
      OR (kind = 'pack_event' AND body->>'type' = 'pack_scan' AND NOT (body ? 'dispute'))
    )
  ) STORED;

-- Журнал склада читают от свежего к старому по времени события.
CREATE INDEX desk_ops_journal ON uklad.desk_ops
  (org_id, warehouse_ref, (coalesce(happened_at, received_at)) DESC);

-- Правки руководителя в кабинете (журнал движений, миграция 014) журнал
-- склада читает по времени: индекса по времени у движений не было.
CREATE INDEX stock_moves_by_member ON uklad.stock_moves (org_id, at DESC)
  WHERE member_id IS NOT NULL;

-- Склад старых строк — по нынешней привязке устройства в снимке компании:
-- у открытого склада устройства в корне, у остальных — в `warehouseData`.
-- Владелец миграции под FORCE RLS строк не видит — снимаем на время.
ALTER TABLE uklad.desk_ops NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.cabinet_snapshots NO FORCE ROW LEVEL SECURITY;
WITH bound AS (
  SELECT s.org_id, s.data->'warehouse'->>'id' AS wh, d.value->>'id' AS device
  FROM uklad.cabinet_snapshots s,
       jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'devices') = 'array'
                                 THEN s.data->'devices' ELSE '[]'::jsonb END) d
  WHERE jsonb_typeof(s.data->'warehouse') = 'object'
  UNION ALL
  SELECT s.org_id, w.key, d.value->>'id'
  FROM uklad.cabinet_snapshots s,
       jsonb_each(CASE WHEN jsonb_typeof(s.data->'warehouseData') = 'object'
                       THEN s.data->'warehouseData' ELSE '{}'::jsonb END) w,
       jsonb_array_elements(CASE WHEN jsonb_typeof(w.value->'devices') = 'array'
                                 THEN w.value->'devices' ELSE '[]'::jsonb END) d
), one AS (
  SELECT org_id, device, min(wh) AS wh FROM bound
  WHERE length(wh) BETWEEN 1 AND 100 AND device IS NOT NULL
  GROUP BY org_id, device HAVING count(DISTINCT wh) = 1
)
UPDATE uklad.desk_ops o SET warehouse_ref = one.wh
FROM auth.desk_sessions ds, one
WHERE ds.id = o.desk_id AND ds.org_id = o.org_id
  AND one.org_id = o.org_id AND one.device = ds.device_ref
  AND o.warehouse_ref IS NULL;
ALTER TABLE uklad.cabinet_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_ops FORCE ROW LEVEL SECURITY;

-- Журнал склада: операции столов этого склада, новые сверху, страница до
-- `p_before`. Пустой фильтр — без фильтра. Товар и тара ищутся в теле
-- операции (`productId`, `toteId`/`boxId`, состав `lines`). Устройство — имя
-- стола на момент открытия. Тело наружу — узкой выжимкой, как у журнала
-- устройства (029): состав упаковки и споры целиком журналу не нужны.
-- «Ошибки» — помеченное сервером, скан со спорным, ошибка и отказ упаковки.
CREATE FUNCTION auth.warehouse_journal(
  p_warehouse text, p_before timestamptz, p_since timestamptz, p_staff text,
  p_steps text[], p_product text, p_place text, p_errors boolean, p_limit integer)
RETURNS TABLE (
  id uuid, at timestamptz, received_at timestamptz, staff_ref text, device_ref text, device_name text,
  kind text, step text, counted boolean, status text, reason text, refs jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT o.id, coalesce(o.happened_at, o.received_at), o.received_at, o.staff_ref,
         d.device_ref, d.name, o.kind, o.step, o.counted, o.status, o.reason,
         jsonb_strip_nulls(jsonb_build_object(
           'type', o.body->>'type',
           'productId', o.body->>'productId',
           'toteId', o.body->>'toteId',
           'boxId', o.body->>'boxId',
           'palletId', o.body->>'palletId',
           'orderId', o.body->>'orderId',
           'outboundCode', o.body->>'outboundCode',
           'sortCode', o.body->>'sortCode',
           -- Код маркировки — без криптохвоста: до разделителя GS и не
           -- длиннее 64 символов. Хвост журналу не нужен, а наружу не уходит.
           'code', left(split_part(o.body->>'code', chr(29), 1), 64),
           'cell', o.body->'cell',
           'qty', o.body->'qty',
           'dispute', o.body->'dispute'->>'kind',
           'resolution', o.body->>'resolution',
           'pickId', o.body->>'pickId',
           -- Переход между процессами (миграция 042): куда и кто разрешил.
           'station', o.body->>'station',
           'approvedBy', o.body->>'approvedBy'
         ))
  FROM uklad.desk_ops o
  JOIN auth.desk_sessions d ON d.id = o.desk_id AND d.org_id = o.org_id
  WHERE uklad.current_org() IS NOT NULL
    AND o.org_id = uklad.current_org()
    AND o.warehouse_ref = p_warehouse
    -- Граница страницы включительно: две операции в одну миллисекунду не
    -- теряются между страницами, повтор кабинет отсеивает по id.
    AND (p_before IS NULL OR coalesce(o.happened_at, o.received_at) <= p_before)
    AND (p_since IS NULL OR coalesce(o.happened_at, o.received_at) >= p_since)
    AND (p_staff IS NULL OR o.staff_ref = p_staff)
    AND (p_steps IS NULL OR o.step = ANY (p_steps))
    AND (NOT coalesce(p_errors, false) OR o.status = 'flagged'
         OR o.body ? 'dispute' OR o.body->>'type' IN ('pack_error', 'pack_reject')
         -- Отмена скана сборки (миграция 043) — тоже ошибка сборщика.
         OR o.kind = 'pick_undo')
    AND (p_product IS NULL OR o.body->>'productId' = p_product
         OR o.body->'lines' @> jsonb_build_array(jsonb_build_object('productId', p_product)))
    AND (p_place IS NULL OR p_place IN (o.body->>'toteId', o.body->>'boxId',
                                        o.body->>'palletId', o.body->>'outboundCode',
                                        o.body->>'outboundId', o.body->>'sortCode'))
  ORDER BY 2 DESC, 1 DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

REVOKE EXECUTE ON FUNCTION
  auth.warehouse_journal(text, timestamptz, timestamptz, text, text[], text, text, boolean, integer)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.warehouse_journal(text, timestamptz, timestamptz, text, text[], text, text, boolean, integer)
TO uklad_app;
