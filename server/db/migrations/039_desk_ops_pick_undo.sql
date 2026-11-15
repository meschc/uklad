-- Отмена снятой в сборке штуки (`pick_undo`, `server/api/src/cabinet/deskPick.js`).
-- Сборщик ошибся — не та тара, лишняя штука, тара полна: штука возвращается
-- из тары в тот же короб, собранное по заявке −1. Скан из журнала не
-- исчезает: отмена — своя строка журнала операций со ссылкой на него.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count', 'sort_place',
                  'sort_close', 'inv_cell', 'pick_undo'));
