-- Команда компании: приглашение второго человека, смена роли, свои роли.
--
-- Модель прав из 002 не меняется: роль — набор кодов, право проверяет
-- сервер по сессии. Здесь — действия над людьми и ролями. Каждая функция
-- сама сверяет, что делающий может не больше, чем у него есть:
--  * роль можно дать, только если все её права есть у самого делающего;
--  * человека с правами выше своих нельзя ни переназначить, ни отключить;
--  * себя нельзя ни переназначить, ни отключить.
-- Из этих трёх правил следует, что в компании всегда остаётся владелец:
-- тронуть владельца может только владелец, и не себя.
-- Приглашение — случайный токен (256 бит), в базе только его хэш.

CREATE TABLE auth.invitations (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  member_id uuid NOT NULL,
  email text NOT NULL CHECK (email = lower(email)),
  token_hash bytea NOT NULL UNIQUE,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id)
);
CREATE INDEX invitations_member ON auth.invitations (member_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Права того, кто сейчас действует (`app.member_id` ставит auth.resolve).
CREATE FUNCTION auth.actor_permissions() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT coalesce((SELECT r.permissions FROM uklad.members m
                   JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
                   WHERE m.id = nullif(current_setting('app.member_id', true), '')::uuid
                     AND m.org_id = uklad.current_org()), '{}')
$$;

CREATE FUNCTION auth.actor_member() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.member_id', true), '')::uuid $$;

-- Управлять командой может только тот, у кого есть право `staff.manage`.
-- Проверяет и сервер, но функции базы не полагаются на него: новый маршрут,
-- который вызовет их с сессией кладовщика, не должен дать ему менять людей.
CREATE FUNCTION auth.assert_staff() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
BEGIN
  IF NOT ('staff.manage' = ANY (auth.actor_permissions())) THEN
    RAISE EXCEPTION 'team:role_not_allowed';
  END IF;
END $$;

-- Приглашение живёт, пока жив пригласивший: он активен и права роли
-- приглашённого не выше его нынешних. Отключили руководителя — его
-- неоткрытые ссылки мертвы, а не ждут, чтобы вернуть его со стороны.
CREATE FUNCTION auth.inviter_still_may(p_invited_by uuid, p_role uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM uklad.members m
    JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
    JOIN uklad.roles t ON t.org_id = m.org_id AND t.id = p_role AND t.deleted_at IS NULL
    WHERE m.id = p_invited_by AND m.org_id = uklad.current_org()
      AND m.deleted_at IS NULL AND m.status IN ('active', 'sleeping')
      AND 'staff.manage' = ANY (r.permissions) AND t.permissions <@ r.permissions)
$$;

-- Список людей компании: роль, статус, почта (если есть вход), бейдж.
CREATE FUNCTION auth.team_list()
RETURNS TABLE (member_id uuid, name text, email text, role_id uuid, role_name text,
               status text, has_login boolean, has_badge boolean,
               last_seen_at timestamptz, invite_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT m.id, m.display_name,
         coalesce(a.email, (SELECT i.email FROM auth.invitations i
                            WHERE i.member_id = m.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
                            ORDER BY i.created_at DESC LIMIT 1)),
         m.role_id, r.name, m.status, m.account_id IS NOT NULL,
         EXISTS (SELECT 1 FROM auth.badges b WHERE b.member_id = m.id AND b.revoked_at IS NULL),
         m.last_seen_at,
         (SELECT i.expires_at FROM auth.invitations i
          WHERE i.member_id = m.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
          ORDER BY i.created_at DESC LIMIT 1)
  FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  LEFT JOIN auth.accounts a ON a.id = m.account_id
  WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
  ORDER BY m.created_at
$$;

-- Пригласить человека по почте с ролью. Повторное приглашение на ту же
-- почту заменяет прежнее: старая ссылка гаснет.
CREATE FUNCTION auth.invite_member(p_email text, p_role uuid, p_name text, p_token bytea, p_ttl interval)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_perms text[];
  v_member uuid;
BEGIN
  PERFORM auth.assert_staff();
  SELECT r.permissions INTO v_perms FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  -- Письма уходят с нашего домена: суточный потолок на компанию не даёт
  -- циклом «отозвать → пригласить» разослать их тысячи.
  IF (SELECT count(*) FROM auth.invitations i
      WHERE i.org_id = uklad.current_org() AND i.created_at > now() - interval '1 day') >= 50 THEN
    RAISE EXCEPTION 'team:too_many_invites';
  END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m JOIN auth.accounts a ON a.id = m.account_id
             WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL AND a.email = v_email) THEN
    RAISE EXCEPTION 'team:already_member';
  END IF;
  -- Прежнее приглашение на эту почту — отзываем и берём его карточку.
  SELECT i.member_id INTO v_member FROM auth.invitations i
  JOIN uklad.members m ON m.id = i.member_id AND m.deleted_at IS NULL
  WHERE i.org_id = uklad.current_org() AND i.email = v_email
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL
  ORDER BY i.created_at DESC LIMIT 1;
  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM uklad.members m
        WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
          AND m.account_id IS NULL AND m.status = 'invited') >= 20 THEN
      RAISE EXCEPTION 'team:too_many_invites';
    END IF;
    INSERT INTO uklad.members (org_id, role_id, display_name, status)
    VALUES (uklad.current_org(), p_role, nullif(trim(p_name), ''), 'invited')
    RETURNING id INTO v_member;
  ELSE
    UPDATE uklad.members SET role_id = p_role,
      display_name = coalesce(nullif(trim(p_name), ''), display_name), status = 'invited'
    WHERE id = v_member;
    UPDATE auth.invitations SET revoked_at = now()
    WHERE member_id = v_member AND accepted_at IS NULL AND revoked_at IS NULL;
  END IF;
  INSERT INTO auth.invitations (org_id, member_id, email, token_hash, invited_by, expires_at)
  VALUES (uklad.current_org(), v_member, v_email, p_token, auth.actor_member(), now() + p_ttl);
  RETURN v_member;
END $$;

-- Отозвать приглашение: карточка человека, который так и не пришёл, гаснет.
CREATE FUNCTION auth.revoke_invite(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[];
BEGIN
  PERFORM auth.assert_staff();
  -- Приглашение человеку с правами выше своих не отозвать, как и его самого.
  SELECT r.permissions INTO v_perms FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  WHERE m.id = p_member AND m.org_id = uklad.current_org();
  IF FOUND AND NOT (v_perms <@ auth.actor_permissions()) THEN
    RAISE EXCEPTION 'team:role_not_allowed';
  END IF;
  UPDATE uklad.members SET status = 'expired', deleted_at = now()
  WHERE id = p_member AND org_id = uklad.current_org()
    AND account_id IS NULL AND status = 'invited' AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  UPDATE auth.invitations SET revoked_at = now()
  WHERE member_id = p_member AND accepted_at IS NULL AND revoked_at IS NULL;
END $$;

-- Тронуть человека (роль, отключение) можно, только если он не ты и его
-- права не выше твоих.
CREATE FUNCTION auth.assert_may_touch(p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[];
BEGIN
  PERFORM auth.assert_staff();
  SELECT r.permissions INTO v_perms FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  WHERE m.id = p_member AND m.org_id = uklad.current_org() AND m.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF p_member = auth.actor_member() THEN RAISE EXCEPTION 'team:self'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
END $$;

CREATE FUNCTION auth.change_role(p_member uuid, p_role uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[];
BEGIN
  PERFORM auth.assert_may_touch(p_member);
  SELECT r.permissions INTO v_perms FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  UPDATE uklad.members SET role_id = p_role WHERE id = p_member;
  -- Права человека изменились — его неоткрытые приглашения устарели.
  UPDATE auth.invitations SET revoked_at = now()
  WHERE invited_by = p_member AND accepted_at IS NULL AND revoked_at IS NULL;
END $$;

-- Отключить или вернуть. Отключённый не входит ни паролем, ни бейджем
-- (auth.can_enter), бейдж гаснет сразу.
CREATE FUNCTION auth.set_member_disabled(p_member uuid, p_disabled boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
BEGIN
  PERFORM auth.assert_may_touch(p_member);
  IF p_disabled THEN
    UPDATE uklad.members SET status = 'disabled' WHERE id = p_member;
    -- Отключённый не оставляет за собой живых ссылок.
    UPDATE auth.invitations SET revoked_at = now()
    WHERE invited_by = p_member AND accepted_at IS NULL AND revoked_at IS NULL;
    UPDATE auth.badges SET revoked_at = now() WHERE member_id = p_member AND revoked_at IS NULL;
    UPDATE auth.sessions SET revoked_at = now()
    WHERE kind = 'badge' AND member_id = p_member AND revoked_at IS NULL;
  ELSE
    UPDATE uklad.members
    SET status = CASE WHEN account_id IS NULL THEN 'invited' ELSE 'active' END
    WHERE id = p_member AND status = 'disabled';
  END IF;
END $$;

-- Своя роль склада. Права — не больше своих; `org.manage` (владелец) в
-- свою роль не входит. Роли по умолчанию не правятся.
CREATE FUNCTION auth.save_role(p_role uuid, p_name text, p_perms text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_id uuid := p_role;
  v_old text[];
  v_default boolean;
BEGIN
  PERFORM auth.assert_staff();
  IF length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'team:bad_name'; END IF;
  IF 'org.manage' = ANY (p_perms) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF NOT (p_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO uklad.roles (org_id, name, permissions) VALUES (uklad.current_org(), trim(p_name), p_perms)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT r.permissions, r.is_default INTO v_old, v_default FROM uklad.roles r
  WHERE r.id = v_id AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF v_default THEN RAISE EXCEPTION 'team:default_role'; END IF;
  -- Роль с правами выше своих не правят, как и человека.
  IF NOT (v_old <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  -- Свою собственную роль не расширяют и не сужают: иначе можно отрезать себя.
  IF EXISTS (SELECT 1 FROM uklad.members m WHERE m.id = auth.actor_member() AND m.role_id = v_id) THEN
    RAISE EXCEPTION 'team:self';
  END IF;
  UPDATE uklad.roles SET name = trim(p_name), permissions = p_perms WHERE id = v_id;
  RETURN v_id;
END $$;

CREATE FUNCTION auth.delete_role(p_role uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[]; v_default boolean;
BEGIN
  PERFORM auth.assert_staff();
  SELECT r.permissions, r.is_default INTO v_perms, v_default FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF v_default THEN RAISE EXCEPTION 'team:default_role'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m
             WHERE m.role_id = p_role AND m.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'team:role_in_use';
  END IF;
  UPDATE uklad.roles SET deleted_at = now() WHERE id = p_role;
END $$;

-- ---- Принятие приглашения (без сессии: человека ещё нет в системе) ----

-- Что видит человек по ссылке: компания, роль, почта и есть ли у почты вход.
-- Просроченное, отозванное и принятое — пустой ответ, без различий.
CREATE FUNCTION auth.invite_info(p_token bytea)
RETURNS TABLE (company text, role_name text, email text, account_state text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE i auth.invitations;
BEGIN
  SELECT * INTO i FROM auth.invitations x
  WHERE x.token_hash = p_token AND x.accepted_at IS NULL AND x.revoked_at IS NULL
    AND x.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;
  -- Таблицы компании под RLS: компанию ставит сама функция, по приглашению.
  PERFORM set_config('app.org_id', i.org_id::text, true);
  IF NOT auth.inviter_still_may(i.invited_by, (SELECT m.role_id FROM uklad.members m WHERE m.id = i.member_id)) THEN
    PERFORM set_config('app.org_id', '', true);
    RETURN;
  END IF;
  RETURN QUERY
  SELECT o.name, r.name, i.email,
         CASE WHEN a.id IS NULL THEN 'none'
              WHEN a.email_verified_at IS NULL THEN 'unverified' ELSE 'verified' END
  FROM uklad.orgs o
  JOIN uklad.members m ON m.org_id = o.id AND m.id = i.member_id AND m.deleted_at IS NULL
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  LEFT JOIN auth.accounts a ON a.email = i.email AND a.disabled_at IS NULL
  WHERE o.id = i.org_id AND o.deleted_at IS NULL;
  PERFORM set_config('app.org_id', '', true);
END $$;

-- Новая учётная запись по приглашению: почта подтверждена тем, что пришла ссылка.
CREATE FUNCTION auth.create_invited_account(p_token bytea, p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_email text; v_id uuid;
BEGIN
  SELECT i.email INTO v_email FROM auth.invitations i
  WHERE i.token_hash = p_token AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO auth.accounts (email, password_hash, email_verified_at)
  VALUES (v_email, p_hash, now()) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Связать учётную запись с карточкой. Почта аккаунта обязана совпасть с
-- почтой приглашения: чужую ссылку не примет чужой аккаунт.
CREATE FUNCTION auth.accept_invite(p_token bytea, p_account uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE i auth.invitations;
BEGIN
  SELECT * INTO i FROM auth.invitations x
  WHERE x.token_hash = p_token AND x.accepted_at IS NULL AND x.revoked_at IS NULL
    AND x.expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.accounts a
                 WHERE a.id = p_account AND a.email = i.email AND a.disabled_at IS NULL) THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.org_id', i.org_id::text, true);
  IF NOT auth.inviter_still_may(i.invited_by, (SELECT m.role_id FROM uklad.members m WHERE m.id = i.member_id)) THEN
    PERFORM set_config('app.org_id', '', true);
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m
             WHERE m.org_id = i.org_id AND m.account_id = p_account AND m.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'team:already_member';
  END IF;
  UPDATE uklad.members SET account_id = p_account, status = 'active', last_seen_at = now()
  WHERE id = i.member_id AND org_id = i.org_id AND status = 'invited' AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE auth.invitations SET accepted_at = now() WHERE id = i.id;
  PERFORM set_config('app.org_id', '', true);
  RETURN i.org_id;
END $$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.team_list(),
  auth.invite_member(text, uuid, text, bytea, interval),
  auth.revoke_invite(uuid),
  auth.change_role(uuid, uuid),
  auth.set_member_disabled(uuid, boolean),
  auth.save_role(uuid, text, text[]),
  auth.delete_role(uuid),
  auth.invite_info(bytea),
  auth.create_invited_account(bytea, text),
  auth.accept_invite(bytea, uuid)
TO uklad_app;
