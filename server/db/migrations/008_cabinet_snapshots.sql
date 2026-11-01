-- Кабинет компании на сервере одним снимком (ADR 0010).
--
-- Переходный шаг: кабинет хранит работу склада в браузере, и пока она
-- раскладывается по таблицам модуль за модулем, сервер держит её целиком —
-- тот же JSON, что `partialize` пишет в localStorage. Так данные перестают
-- жить в единственной копии в браузере сразу, а не через месяц.
--
-- Одна строка на компанию. `version` — защита от одновременной правки с двух
-- устройств: запись проходит, только если клиент знает текущую версию.
-- `previous` — снимок до последней записи: если второе устройство затёрло
-- правку, её можно вернуть без бэкапа.

CREATE TABLE uklad.cabinet_snapshots (
  org_id uuid PRIMARY KEY REFERENCES uklad.orgs (id),
  -- Версия формата данных кабинета (PERSIST_VERSION): по ней клиент решает,
  -- нужны ли миграции.
  format integer NOT NULL CHECK (format > 0),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  previous jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Кто записал последним — сотрудник компании, а не учётная запись.
  updated_by uuid,
  FOREIGN KEY (org_id, updated_by) REFERENCES uklad.members (org_id, id)
);

ALTER TABLE uklad.cabinet_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.cabinet_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY cabinet_snapshots_own ON uklad.cabinet_snapshots
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

GRANT SELECT, INSERT, UPDATE ON uklad.cabinet_snapshots TO uklad_app;
