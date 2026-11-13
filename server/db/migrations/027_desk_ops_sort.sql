-- Сортировка посылок по паллетам назначения операцией стола (`sort_place`).
--
-- Кирилл 12.11 выбрал отдельную станцию сортировки: посылку сканируют,
-- экран показывает её назначение, посылку кладут на паллету этого назначения.
-- Правила — `server/api/src/cabinet/deskSort.js`.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count', 'sort_place'));
-- 'inv_count' — из 025 (инвентаризация, #112): какая из веток ни войдёт первой,
-- проверка не потеряет вид другой.
