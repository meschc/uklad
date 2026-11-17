-- Ответ продавца на акт расхождений приёмки (Кирилл 17.11, PR 2 споров по
-- приёмке; PR 1 — #180, акт у продавца и карантин излишка).
--
-- Склад принимает поставку по факту, продавец видит акт по своим строкам и
-- в течение трёх суток после закрытия поставки отвечает один раз:
-- «Согласен» или «Не согласен» с комментарием. Молчание три дня — согласие
-- (так в оферте). Возражение уходит старшему в «Подтверждения»: он
-- закрывает его ответом (`kept` — учёт верный) или ставит пересчёт
-- (`recount`). Один ответ на поставку: переписать его нельзя, иначе акт
-- перестаёт быть документом.
--
-- Это первый факт продавца в таблице, а не в снимке кабинета (ADR 0009–0010):
-- продавец снимок не пишет вовсе. Сервер сам проверяет, что поставка — его,
-- закрыта и срок не вышел (`server/api/src/cabinet/receivingAnswers.js`).

CREATE TABLE uklad.receiving_answers (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Склад кабинета (id внутри снимка) и поставка на нём.
  warehouse_ref text NOT NULL CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  shipment_ref text NOT NULL CHECK (length(shipment_ref) BETWEEN 1 AND 100),
  -- Продавец (id партнёра склада), чей товар в поставке.
  partner_ref text NOT NULL CHECK (length(partner_ref) BETWEEN 1 AND 100),
  answer text NOT NULL CHECK (answer IN ('agree', 'dispute')),
  comment text CHECK (length(comment) <= 1000),
  answered_by uuid NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  -- Решение старшего по возражению.
  resolution text CHECK (resolution IN ('kept', 'recount')),
  reply text CHECK (length(reply) <= 1000),
  resolved_by text CHECK (length(resolved_by) <= 100),
  resolved_at timestamptz,
  PRIMARY KEY (org_id, warehouse_ref, shipment_ref),
  -- Возражение без слов старшему не поможет; решают только возражение.
  CHECK (answer = 'agree' OR length(comment) >= 1),
  CHECK (resolution IS NULL OR (answer = 'dispute' AND resolved_at IS NOT NULL))
);

ALTER TABLE uklad.receiving_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.receiving_answers FORCE ROW LEVEL SECURITY;
CREATE POLICY receiving_answers_own ON uklad.receiving_answers
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

-- Удалять нечего: ответ — часть акта.
GRANT SELECT, INSERT, UPDATE ON uklad.receiving_answers TO uklad_app;
