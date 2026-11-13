-- Закрытие отгрузки места сортировки операцией стола (`sort_close`).
--
-- Кирилл 13.11: место сортировки UK-SORT — одна отгрузка в одно направление;
-- при закрытии старший указывает, сколько паллет и коробок получилось, и на
-- каждое грузовое место печатается ярлык UK-OUT. Правила —
-- `server/api/src/cabinet/deskSort.js`.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count', 'sort_place',
                  'sort_close'));
