-- Бейдж рабочего места, пока кабинет живёт снимком (ADR 0010).
--
-- Сотрудники склада сегодня лежат в снимке кабинета, а не в `uklad.members`:
-- у них свой id из браузера (`staff_ref`). Бейдж из этого id подделывается
-- копией — кто видел чужой бейдж, напечатает такой же и отработает смену за
-- другого. Поэтому в QR кладётся случайный секрет (128 бит), в базе — только
-- его sha256, а сам код показывается один раз при выпуске.
--
-- У сотрудника один живой бейдж: выпуск нового гасит старый (потерял — выпустили
-- заново, найденный старый уже не пустит). Строки не удаляются: по ним видно,
-- когда и кем выпускался и гас бейдж.
--
-- Когда персонал переедет в `uklad.members`, эту таблицу сменит `auth.badges`
-- (004) с сессией по бейджу и правами роли; до тех пор стол открыт входом
-- руководителя, а сервер подтверждает, кто за ним стоит.

CREATE TABLE uklad.desk_badges (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  staff_ref text NOT NULL CHECK (length(staff_ref) BETWEEN 1 AND 100),
  secret_hash bytea NOT NULL UNIQUE CHECK (length(secret_hash) = 32),
  issued_at timestamptz NOT NULL DEFAULT now(),
  -- Кто выпустил и кто погасил — сотрудник компании, а не учётная запись.
  issued_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  FOREIGN KEY (org_id, issued_by) REFERENCES uklad.members (org_id, id),
  FOREIGN KEY (org_id, revoked_by) REFERENCES uklad.members (org_id, id)
);

CREATE UNIQUE INDEX desk_badges_one_active ON uklad.desk_badges (org_id, staff_ref)
  WHERE revoked_at IS NULL;

ALTER TABLE uklad.desk_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_badges FORCE ROW LEVEL SECURITY;
-- Чужой бейдж не найти даже по верному секрету: поиск идёт внутри компании.
CREATE POLICY desk_badges_own ON uklad.desk_badges
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

-- Без DELETE: погасить — это UPDATE revoked_at.
GRANT SELECT, INSERT, UPDATE ON uklad.desk_badges TO uklad_app;
