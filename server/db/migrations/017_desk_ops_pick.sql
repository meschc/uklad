-- Сборка операциями: журнал операций стола принимает снятую штуку
-- (`pick_unit`: место → тара под заявку) и собранную заявку (`pick_done`).
-- Откуда снять и в какую тару можно, сервер проверяет сам
-- (`server/api/src/cabinet/deskPick.js`).
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done'));
