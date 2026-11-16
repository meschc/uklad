-- Инвентаризация ячейки, где по учёту тары нет (`inv_cell`,
-- `server/api/src/cabinet/deskInventory.js`). Пусто — факт остаётся строкой
-- журнала операций стола; нашли товар — излишек на свободную тару, которую
-- сервер ставит в эту ячейку. Право то же, что у пересчёта тары.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count', 'sort_place',
                  'sort_close', 'inv_cell'));
