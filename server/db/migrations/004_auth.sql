-- Вход: сессии по паролю и по бейджу, бейджи, неудачные попытки.
--
-- Таблицы — в закрытой схеме `auth`: у роли приложения нет к ним доступа.
-- Приложение вызывает только функции ниже (SECURITY DEFINER), и каждая
-- отвечает ровно на один вопрос. Токены и секреты в базе — только хэшами
-- (sha256 считает сервер): утёкшая копия базы не даёт войти.
--
-- Кто человек — решает сессия. Какая компания — тоже она: `auth.resolve`
-- сам ставит `app.org_id`, только если у человека есть живое членство в
-- этой компании. Сервер не может «забыть» проверку, потому что иначе
-- компании в транзакции просто нет.

ALTER TABLE auth.accounts ADD COLUMN email_verified_at timestamptz;

CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  token_hash bytea NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('password', 'badge')),
  -- По паролю — человек, компанию он выбирает сам среди своих.
  account_id uuid REFERENCES auth.accounts (id),
  -- По бейджу — сотрудник одной компании, без учётной записи.
  org_id uuid REFERENCES uklad.orgs (id),
  member_id uuid,
  -- Бейдж открывает один склад компании, а не все (Кирилл, 24.10).
  warehouse_id uuid,
  -- Каким бейджем открыта: отозвали бейдж — сессия гаснет на следующем запросе.
  badge_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK ((kind = 'password') = (account_id IS NOT NULL)),
  CHECK ((kind = 'badge') = (member_id IS NOT NULL AND org_id IS NOT NULL AND warehouse_id IS NOT NULL)),
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id),
  FOREIGN KEY (org_id, warehouse_id) REFERENCES uklad.warehouses (org_id, id)
);
CREATE INDEX sessions_account ON auth.sessions (account_id) WHERE revoked_at IS NULL;

-- QR-бейдж: случайный секрет (≥128 бит), а не номер сотрудника — копия
-- номера не открывает вход. Перевыпуск гасит прежний бейдж. Бейдж выдан
-- на один склад: с ним не войти ни на другой склад той же компании, ни в
-- чужую компанию.
CREATE TABLE auth.badges (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  member_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  secret_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id),
  FOREIGN KEY (org_id, warehouse_id) REFERENCES uklad.warehouses (org_id, id)
);
CREATE UNIQUE INDEX badges_one_active ON auth.badges (member_id) WHERE revoked_at IS NULL;
ALTER TABLE auth.sessions ADD FOREIGN KEY (badge_id) REFERENCES auth.badges (id);

-- Отключили человека или сменили пароль — все его сессии гаснут сразу,
-- а не когда истекут.
CREATE FUNCTION auth.revoke_account_sessions() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
BEGIN
  UPDATE auth.sessions SET revoked_at = now()
  WHERE account_id = NEW.id AND revoked_at IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER accounts_revoke_sessions AFTER UPDATE OF disabled_at, password_hash ON auth.accounts
  FOR EACH ROW WHEN (NEW.disabled_at IS DISTINCT FROM OLD.disabled_at
                     OR NEW.password_hash IS DISTINCT FROM OLD.password_hash)
  EXECUTE FUNCTION auth.revoke_account_sessions();

-- Неудачные входы по паролю. Считаются по связке «почта + адрес»: весь
-- склад ходит в интернет с одного IP, и опечатки одного человека не должны
-- закрывать вход всей смене. Порог на адрес целиком — заметно выше.
CREATE TABLE auth.login_failures (
  email text NOT NULL,
  ip text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_failures_email ON auth.login_failures (email, at);
CREATE INDEX login_failures_ip ON auth.login_failures (ip, at);

-- Членства человека — по его учётной записи. Политики чтения работают только
-- внутри функций входа: те ставят `app.account_id` и снимают его перед
-- выходом. Записи по ним не разрешено.
CREATE FUNCTION auth.current_account() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.account_id', true), '')::uuid
$$;
CREATE POLICY members_account_read ON uklad.members FOR SELECT
  USING (account_id = auth.current_account());
CREATE POLICY orgs_account_read ON uklad.orgs FOR SELECT USING (
  EXISTS (SELECT 1 FROM uklad.members m
          WHERE m.org_id = orgs.id AND m.account_id = auth.current_account()));
CREATE POLICY roles_account_read ON uklad.roles FOR SELECT USING (
  EXISTS (SELECT 1 FROM uklad.members m
          WHERE m.org_id = roles.org_id AND m.role_id = roles.id
            AND m.account_id = auth.current_account()));

-- Живое членство: войти могут приглашённый, активный и «спящий».
-- Отключённый и с истёкшим приглашением — нет, удалённый — тем более.
CREATE FUNCTION auth.can_enter(status text, deleted_at timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT status IN ('invited', 'active', 'sleeping') AND deleted_at IS NULL
$$;

-- ---- Регистрация ----

-- Новая учётная запись, компания и её владелец — одной транзакцией.
-- После вызова в транзакции стоит `app.org_id` новой компании.
CREATE FUNCTION auth.register(p_email text, p_hash text, p_company text,
                              p_warehouse boolean, p_seller boolean, p_name text)
RETURNS TABLE (account_id uuid, org_id uuid, member_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_account uuid;
  v_org uuid := uklad.uuid_v7();
  v_role uuid;
  v_member uuid;
BEGIN
  INSERT INTO auth.accounts (email, password_hash) VALUES (lower(trim(p_email)), p_hash)
  RETURNING id INTO v_account;
  PERFORM set_config('app.org_id', v_org::text, true);
  INSERT INTO uklad.orgs (id, name, has_warehouse, has_seller)
  VALUES (v_org, p_company, p_warehouse, p_seller);
  SELECT r.id INTO v_role FROM uklad.roles r
  WHERE r.org_id = v_org AND r.is_default AND r.name = 'Владелец';
  INSERT INTO uklad.members (org_id, account_id, role_id, display_name, status, last_seen_at)
  VALUES (v_org, v_account, v_role, nullif(trim(p_name), ''), 'active', now())
  RETURNING id INTO v_member;
  RETURN QUERY SELECT v_account, v_org, v_member;
END $$;

-- ---- Пароль ----

-- Хэш пароля для проверки на сервере (scrypt считает Node, не база).
CREATE FUNCTION auth.password_hash(p_email text)
RETURNS TABLE (account_id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT a.id, a.password_hash FROM auth.accounts a
  WHERE a.email = lower(trim(p_email)) AND a.disabled_at IS NULL
$$;

CREATE FUNCTION auth.note_failure(p_email text, p_ip text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  INSERT INTO auth.login_failures (email, ip) VALUES (lower(trim(p_email)), p_ip)
$$;

-- Сколько неудач с `p_since`: по связке, по адресу целиком и по почте с
-- любых адресов (подбор пароля одного человека с многих машин).
CREATE FUNCTION auth.failures(p_email text, p_ip text, p_since timestamptz)
RETURNS TABLE (pair integer, ip integer, email integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT
    count(*) FILTER (WHERE f.email = lower(trim(p_email)) AND f.ip = p_ip)::int,
    count(*) FILTER (WHERE f.ip = p_ip)::int,
    count(*) FILTER (WHERE f.email = lower(trim(p_email)))::int
  FROM auth.login_failures f
  WHERE f.at >= p_since AND (f.ip = p_ip OR f.email = lower(trim(p_email)))
$$;

CREATE FUNCTION auth.open_session(p_account uuid, p_token bytea, p_ttl interval)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  INSERT INTO auth.sessions (token_hash, kind, account_id, expires_at)
  SELECT p_token, 'password', a.id, now() + p_ttl FROM auth.accounts a
  WHERE a.id = p_account AND a.disabled_at IS NULL
  RETURNING expires_at
$$;

-- ---- Бейдж ----

-- Выпуск бейджа сотруднику текущей компании (право staff.manage проверяет
-- сервер по сессии). Сотрудник ищется через RLS: чужого не найти.
CREATE FUNCTION auth.issue_badge(p_member uuid, p_warehouse uuid, p_secret bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM uklad.members m
                 WHERE m.id = p_member AND m.org_id = uklad.current_org()) THEN
    RAISE EXCEPTION 'member not found' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM uklad.warehouses w
                 WHERE w.id = p_warehouse AND w.org_id = uklad.current_org() AND w.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'warehouse not found' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE auth.badges SET revoked_at = now() WHERE member_id = p_member AND revoked_at IS NULL;
  -- Перевыпуск обрывает и текущие сессии по старому бейджу.
  UPDATE auth.sessions SET revoked_at = now()
  WHERE kind = 'badge' AND member_id = p_member AND revoked_at IS NULL;
  INSERT INTO auth.badges (org_id, member_id, warehouse_id, secret_hash)
  VALUES (uklad.current_org(), p_member, p_warehouse, p_secret) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Потерянный бейдж: гасится вместе со своими сессиями, без выпуска нового.
CREATE FUNCTION auth.revoke_badge(p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM uklad.members m
                 WHERE m.id = p_member AND m.org_id = uklad.current_org()) THEN
    RAISE EXCEPTION 'member not found' USING ERRCODE = 'no_data_found';
  END IF;
  UPDATE auth.badges SET revoked_at = now() WHERE member_id = p_member AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE auth.sessions SET revoked_at = now()
  WHERE kind = 'badge' AND member_id = p_member AND revoked_at IS NULL;
  RETURN n;
END $$;

-- Вход по бейджу: сессия сотрудника одной компании. Нет бейджа или
-- сотрудник отключён — пустой ответ.
CREATE FUNCTION auth.open_badge_session(p_secret bytea, p_token bytea, p_ttl interval)
RETURNS TABLE (org_id uuid, member_id uuid, warehouse_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE b auth.badges;
BEGIN
  SELECT * INTO b FROM auth.badges x WHERE x.secret_hash = p_secret AND x.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM set_config('app.org_id', b.org_id::text, true);
  IF NOT EXISTS (SELECT 1 FROM uklad.members m
                 WHERE m.id = b.member_id AND auth.can_enter(m.status, m.deleted_at))
     OR NOT EXISTS (SELECT 1 FROM uklad.warehouses w
                    WHERE w.id = b.warehouse_id AND w.deleted_at IS NULL) THEN
    PERFORM set_config('app.org_id', '', true);
    RETURN;
  END IF;
  UPDATE uklad.members SET status = 'active', last_seen_at = now() WHERE id = b.member_id;
  RETURN QUERY
  INSERT INTO auth.sessions AS s (token_hash, kind, org_id, member_id, warehouse_id, badge_id, expires_at)
  VALUES (p_token, 'badge', b.org_id, b.member_id, b.warehouse_id, b.id, now() + p_ttl)
  RETURNING s.org_id, s.member_id, s.warehouse_id, s.expires_at;
END $$;

-- ---- Каждый запрос ----

-- Кто это и в какой компании. Для сессии по паролю компанию называет
-- запрос (`p_org`), для бейджа она одна. При успехе в транзакции стоят
-- `app.org_id` и `app.member_id`; при отказе компании нет, а `org_id`
-- в ответе пуст — человек вошёл, но в эту компанию его не пускают.
-- Склад: у бейджа он свой и единственный (просьба другого склада — отказ),
-- у входа по паролю — тот, что назвал запрос, если он есть в компании.
CREATE FUNCTION auth.resolve(p_token bytea, p_org uuid, p_warehouse uuid, p_idle interval)
RETURNS TABLE (account_id uuid, org_id uuid, member_id uuid, warehouse_id uuid, permissions text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  s auth.sessions;
  v_member uuid;
  v_perms text[];
  v_wh uuid;
BEGIN
  PERFORM set_config('app.org_id', '', true);
  PERFORM set_config('app.member_id', '', true);
  PERFORM set_config('app.warehouse_id', '', true);
  -- Сессия жива, пока жив её источник: учётная запись не отключена, бейдж
  -- не отозван.
  SELECT x.* INTO s FROM auth.sessions x
  LEFT JOIN auth.accounts a ON a.id = x.account_id
  LEFT JOIN auth.badges b ON b.id = x.badge_id
  WHERE x.token_hash = p_token AND x.revoked_at IS NULL
    AND x.expires_at > now() AND x.last_seen_at > now() - p_idle
    AND (x.kind <> 'password' OR a.disabled_at IS NULL)
    AND (x.kind <> 'badge' OR b.revoked_at IS NULL);
  IF NOT FOUND THEN RETURN; END IF;

  -- Отмечать каждый запрос незачем: раз в минуту хватает для «без действий».
  UPDATE auth.sessions x SET last_seen_at = now()
  WHERE x.id = s.id AND x.last_seen_at < now() - interval '1 minute';

  IF s.kind = 'badge' THEN
    IF (p_org IS NULL OR p_org = s.org_id)
       AND (p_warehouse IS NULL OR p_warehouse = s.warehouse_id) THEN
      v_wh := s.warehouse_id;
      PERFORM set_config('app.org_id', s.org_id::text, true);
      SELECT m.id, r.permissions INTO v_member, v_perms
      FROM uklad.members m JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
      WHERE m.id = s.member_id AND auth.can_enter(m.status, m.deleted_at)
        AND EXISTS (SELECT 1 FROM uklad.warehouses w WHERE w.id = s.warehouse_id AND w.deleted_at IS NULL);
    END IF;
  ELSIF p_org IS NOT NULL THEN
    PERFORM set_config('app.account_id', s.account_id::text, true);
    SELECT m.id, r.permissions INTO v_member, v_perms
    FROM uklad.members m JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
    WHERE m.account_id = s.account_id AND m.org_id = p_org
      AND auth.can_enter(m.status, m.deleted_at);
    PERFORM set_config('app.account_id', '', true);
    IF v_member IS NOT NULL THEN
      PERFORM set_config('app.org_id', p_org::text, true);
      SELECT w.id INTO v_wh FROM uklad.warehouses w
      WHERE w.id = p_warehouse AND w.org_id = p_org AND w.deleted_at IS NULL;
    END IF;
  END IF;

  IF v_member IS NULL THEN
    PERFORM set_config('app.org_id', '', true);
    RETURN QUERY SELECT s.account_id, NULL::uuid, NULL::uuid, NULL::uuid, NULL::text[];
    RETURN;
  END IF;
  PERFORM set_config('app.member_id', v_member::text, true);
  PERFORM set_config('app.warehouse_id', coalesce(v_wh::text, ''), true);
  RETURN QUERY SELECT s.account_id, uklad.current_org(), v_member, v_wh, v_perms;
END $$;

-- Компании, куда человек может войти, — для переключателя в кабинете.
CREATE FUNCTION auth.my_orgs(p_token bytea)
RETURNS TABLE (org_id uuid, name text, has_warehouse boolean, has_seller boolean, role_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_account uuid;
BEGIN
  SELECT x.account_id INTO v_account FROM auth.sessions x
  JOIN auth.accounts a ON a.id = x.account_id AND a.disabled_at IS NULL
  WHERE x.token_hash = p_token AND x.kind = 'password' AND x.revoked_at IS NULL
    AND x.expires_at > now();
  IF v_account IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.account_id', v_account::text, true);
  RETURN QUERY
  SELECT o.id, o.name, o.has_warehouse, o.has_seller, r.name
  FROM uklad.members m
  JOIN uklad.orgs o ON o.id = m.org_id AND o.deleted_at IS NULL
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  WHERE m.account_id = v_account AND auth.can_enter(m.status, m.deleted_at)
  ORDER BY o.name;
  PERFORM set_config('app.account_id', '', true);
END $$;

CREATE FUNCTION auth.close_session(p_token bytea) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  UPDATE auth.sessions SET revoked_at = now() WHERE token_hash = p_token AND revoked_at IS NULL
$$;

-- Ежесуточная уборка: истёкшие сессии и старые неудачи. Сессии по бейджу
-- — это и журнал входов на смену (кто, на какой склад, когда), поэтому
-- они живут дольше: 90 дней.
CREATE FUNCTION auth.purge() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  DELETE FROM auth.sessions WHERE kind = 'password' AND expires_at < now() - interval '30 days';
  DELETE FROM auth.sessions WHERE kind = 'badge' AND expires_at < now() - interval '90 days';
  DELETE FROM auth.login_failures WHERE at < now() - interval '1 day';
$$;

-- Схема `auth` открывается приложению только ради вызова этих функций: к
-- таблицам прав по-прежнему нет.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA auth TO uklad_app;
GRANT EXECUTE ON FUNCTION
  auth.current_account(),
  auth.can_enter(text, timestamptz),
  auth.register(text, text, text, boolean, boolean, text),
  auth.password_hash(text),
  auth.note_failure(text, text),
  auth.failures(text, text, timestamptz),
  auth.open_session(uuid, bytea, interval),
  auth.issue_badge(uuid, uuid, bytea),
  auth.revoke_badge(uuid),
  auth.open_badge_session(bytea, bytea, interval),
  auth.resolve(bytea, uuid, uuid, interval),
  auth.my_orgs(bytea),
  auth.close_session(bytea),
  auth.purge()
TO uklad_app;
