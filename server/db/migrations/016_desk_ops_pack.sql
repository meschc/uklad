-- Упаковка операциями: журнал операций стола принимает скан, этикетку, брак
-- (`pack_event`) и закрытие тары (`pack_done`). Правило «что в таре, то и в
-- коробе» сервер проверяет сам (`server/api/src/cabinet/deskPack.js`).
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done'));
