-- Инвентаризация операцией: слепой пересчёт тары на полке (`inv_count`,
-- `server/api/src/cabinet/deskInventory.js`). Сервер сам сравнивает счёт с
-- учётом и заводит спорное по расхождению; числа учёта стол не знает.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count'));
