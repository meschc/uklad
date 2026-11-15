-- Хранение как услуга: сколько паллето-мест и коробов занимал товар продавца
-- в каждые сутки (Кирилл 15.11: «должно быть хранение как услуга»).
--
-- Склад берёт деньги за сутки хранения, а снимок кабинета знает только «где
-- лежит сейчас». Поэтому при каждой записи работы склада сервер пересчитывает
-- занятость и пишет её строкой на сегодняшние сутки (по Москве). За день
-- строка переписывается, и остаётся состояние на конец дня. День без записей
-- ничего не меняет на полках: его сутки — последняя строка до него, её
-- подставляет отчёт.
--
-- Хранение начинается с размещения: тара без адреса (на воротах, в пути до
-- полки) место не занимает. Паллето-место — ячейка полки с отметкой
-- «паллетное место» на плане, занятая товаром продавца; остальная тара на
-- местах хранения — короба. Подробно — `server/api/src/cabinet/storage.js`.

CREATE TABLE uklad.storage_days (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Склад кабинета (id внутри снимка).
  warehouse_ref text NOT NULL CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  day date NOT NULL,
  -- Продавец (id партнёра склада); пустая строка — товар без продавца, свой.
  partner_ref text NOT NULL CHECK (length(partner_ref) <= 100),
  pallets integer NOT NULL CHECK (pallets >= 0),
  boxes integer NOT NULL CHECK (boxes >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, warehouse_ref, day, partner_ref)
);

ALTER TABLE uklad.storage_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.storage_days FORCE ROW LEVEL SECURITY;
CREATE POLICY storage_days_own ON uklad.storage_days
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

-- Удалять приложению нечего: ушедший продавец получает на сегодня ноль.
GRANT SELECT, INSERT, UPDATE ON uklad.storage_days TO uklad_app;
