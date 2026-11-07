-- Рейс и решение старшего операциями: журнал операций стола принимает
-- уехавшую машину (`ship_run`) и решение по спорному (`dispute_resolve`).
-- Что можно, сервер проверяет сам (`server/api/src/cabinet/deskShip.js`).
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve'));
