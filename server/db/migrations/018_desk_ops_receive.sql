-- Приёмка операциями: журнал операций стола принимает вскрытие места
-- (`recv_open`), принятое в тару (`recv_unit`), тару в ячейку (`recv_place`),
-- тару на паллету (`recv_attach`) и закрытие поставки (`recv_close`). Что и
-- куда можно, сервер проверяет сам (`server/api/src/cabinet/deskReceive.js`).
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close'));
