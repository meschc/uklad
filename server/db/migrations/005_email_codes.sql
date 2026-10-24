-- Подтверждение почты и сброс пароля кодом из письма.
--
-- Код — шесть цифр, живёт 15 минут, на него пять попыток. В базе только
-- sha256 от «id учётной записи + код» (считает сервер): утёкшая копия базы
-- не даёт ни кода, ни входа. Новый код гасит прежний того же назначения.
--
-- Регистрация больше не открывает сессию: вход появляется только после кода.
-- Поэтому ответ на регистрацию один и тот же, есть такая почта или нет, —
-- перебором почт не узнать, кто зарегистрирован (замечание безопасности к
-- PR #33). Разница уходит в письмо, которое читает только владелец почты.

CREATE TABLE auth.email_codes (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  account_id uuid NOT NULL REFERENCES auth.accounts (id),
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash bytea NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX email_codes_account ON auth.email_codes (account_id, purpose, created_at);

-- Учётная запись для письма с кодом: id, подтверждена ли почта и сколько
-- кодов этого назначения выдано за час (сервер не шлёт больше пяти).
-- Отключённой учётной записи нет — письмо ей не уходит.
CREATE FUNCTION auth.code_target(p_email text, p_purpose text)
RETURNS TABLE (account_id uuid, verified boolean, sent_last_hour integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT a.id, a.email_verified_at IS NOT NULL,
         (SELECT count(*)::int FROM auth.email_codes c
          WHERE c.account_id = a.id AND c.purpose = p_purpose
            AND c.created_at > now() - interval '1 hour')
  FROM auth.accounts a
  WHERE a.email = lower(trim(p_email)) AND a.disabled_at IS NULL
$$;

CREATE FUNCTION auth.issue_code(p_account uuid, p_purpose text, p_hash bytea, p_ttl interval)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  UPDATE auth.email_codes SET used_at = now()
  WHERE account_id = p_account AND purpose = p_purpose AND used_at IS NULL;
  INSERT INTO auth.email_codes (account_id, purpose, code_hash, expires_at)
  VALUES (p_account, p_purpose, p_hash, now() + p_ttl);
$$;

-- Проверить код: верный гасится и возвращает true; неверный тратит одну из
-- пяти попыток. Блокировка строки — чтобы параллельные запросы не прошли
-- оба и не потратили одну попытку дважды.
CREATE FUNCTION auth.use_code(p_account uuid, p_purpose text, p_hash bytea)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE
  v auth.email_codes;
BEGIN
  SELECT * INTO v FROM auth.email_codes
  WHERE account_id = p_account AND purpose = p_purpose AND used_at IS NULL
    AND expires_at > now() AND attempts < 5
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v.code_hash <> p_hash THEN
    UPDATE auth.email_codes SET attempts = attempts + 1 WHERE id = v.id;
    RETURN false;
  END IF;
  UPDATE auth.email_codes SET used_at = now() WHERE id = v.id;
  RETURN true;
END $$;

-- Почта подтверждена: возвращает первую компанию человека, в неё он и
-- попадёт после кода.
CREATE FUNCTION auth.confirm_email(p_account uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_org uuid;
BEGIN
  UPDATE auth.accounts SET email_verified_at = coalesce(email_verified_at, now())
  WHERE id = p_account AND disabled_at IS NULL;
  PERFORM set_config('app.account_id', p_account::text, true);
  SELECT m.org_id INTO v_org FROM uklad.members m
  WHERE m.account_id = p_account AND auth.can_enter(m.status, m.deleted_at)
  ORDER BY m.created_at LIMIT 1;
  PERFORM set_config('app.account_id', '', true);
  RETURN v_org;
END $$;

-- Новый пароль после кода сброса. Триггер на accounts гасит все прежние
-- сессии; код пришёл на почту — значит, и почта подтверждена.
CREATE FUNCTION auth.set_password(p_account uuid, p_hash text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  UPDATE auth.accounts
  SET password_hash = p_hash, email_verified_at = coalesce(email_verified_at, now())
  WHERE id = p_account AND disabled_at IS NULL;
$$;

-- Вход по паролю проверяет подтверждение: вместе с хэшем отдаём и его.
DROP FUNCTION auth.password_hash(text);
CREATE FUNCTION auth.password_hash(p_email text)
RETURNS TABLE (account_id uuid, password_hash text, verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT a.id, a.password_hash, a.email_verified_at IS NOT NULL FROM auth.accounts a
  WHERE a.email = lower(trim(p_email)) AND a.disabled_at IS NULL
$$;

-- Регистрация на уже занятую почту не падает, а отдаёт пустой результат:
-- сервер ответит так же, как на новую, и пошлёт письмо «вы уже с нами».
CREATE OR REPLACE FUNCTION auth.register(p_email text, p_hash text, p_company text,
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
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_account;
  IF v_account IS NULL THEN RETURN; END IF;
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

-- Уборка: коды старше суток не нужны ни для чего.
CREATE OR REPLACE FUNCTION auth.purge() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  DELETE FROM auth.sessions WHERE kind = 'password' AND expires_at < now() - interval '30 days';
  DELETE FROM auth.sessions WHERE kind = 'badge' AND expires_at < now() - interval '90 days';
  DELETE FROM auth.login_failures WHERE at < now() - interval '1 day';
  DELETE FROM auth.email_codes WHERE created_at < now() - interval '1 day';
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.password_hash(text),
  auth.code_target(text, text),
  auth.issue_code(uuid, text, bytea, interval),
  auth.use_code(uuid, text, bytea),
  auth.confirm_email(uuid),
  auth.set_password(uuid, text)
TO uklad_app;
