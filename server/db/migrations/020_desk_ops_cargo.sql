-- Грузовая приёмка операцией: места поставки при водителе заводит сервер
-- (`recv_cargo`, `server/api/src/cabinet/deskReceive.js`) и сам выдаёт им
-- номера ярлыков из счётчика склада — два стола не получат один номер.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo'));
