-- Окно истории (ADR 0010, «Потолок снимка», шаг 3). Законченная работа
-- старше 45 дней — уехавшие заявки, закрытые поставки, рейсы, приёмка,
-- журнал смен, подтверждённые документы — уходит в архив: кабинет её больше
-- не получает при входе и не держит в браузере, а отчёты за долгий период
-- читают её отдельно (`GET /api/cabinet/history`). Строка не удаляется и не
-- меняется: архив — пометка `archived_at`, а не другое место.
--
-- Запись кабинета архивные строки не трогает: пропавшая из списка архивная
-- строка в корзину не уходит. Присланная заново (копия на другом устройстве
-- была открыта до архивации) — возвращается из архива.

ALTER TABLE uklad.cabinet_records ADD COLUMN archived_at timestamptz;

DROP INDEX uklad.cabinet_records_live;
CREATE INDEX cabinet_records_live ON uklad.cabinet_records (org_id, warehouse_ref, domain, position)
  WHERE deleted_at IS NULL AND archived_at IS NULL;
CREATE INDEX cabinet_records_archive ON uklad.cabinet_records (org_id, warehouse_ref, domain, ref)
  WHERE deleted_at IS NULL AND archived_at IS NOT NULL;

-- Когда архив последний раз пополнялся: не чаще раза в сутки на компанию.
ALTER TABLE uklad.cabinet_snapshots ADD COLUMN archive_checked_at timestamptz;
