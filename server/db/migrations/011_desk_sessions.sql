-- Вход стола: свой пропуск у компьютера, а не сессия руководителя.
--
-- До этой миграции стол за упаковкой держал вход руководителя с паролем и
-- правом staff.manage на 30 дней. Значит, любой за столом через консоль
-- браузера мог выпустить бейдж на коллегу, читать ставки и перезаписать
-- кабинет целиком. Теперь руководитель один раз «делает этот компьютер
-- столом»: его сессия в этом браузере гаснет, а браузер получает пропуск
-- стола. Пропуск умеет только своё: узнать сотрудника по бейджу, прочитать
-- снимок без ставок и контактов, записать работу склада (без персонала,
-- цен, тарифа, подключений и чужих складов). Отвязать стол — бейджем
-- руководителя на самом столе или с экрана «Устройства».
--
-- Таблица в схеме `auth`: приложение к ней доступа не имеет, только через
-- функции ниже, как и к сессиям (004).

CREATE TABLE auth.desk_sessions (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  token_hash bytea NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Устройство из кабинета (`Device.id`): по нему стол гасят с другого компьютера.
  device_ref text NOT NULL CHECK (length(device_ref) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (org_id, created_by) REFERENCES uklad.members (org_id, id)
);
-- У устройства один живой пропуск: заведённый заново стол гасит прежний.
CREATE UNIQUE INDEX desk_sessions_one_live ON auth.desk_sessions (org_id, device_ref)
  WHERE revoked_at IS NULL;

-- Сделать стол. Компанию и руководителя берём из транзакции: их поставил
-- `auth.resolve` по сессии с паролем, а право staff.manage проверил сервер.
CREATE FUNCTION auth.open_desk(p_device text, p_name text, p_token bytea, p_ttl interval)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF uklad.current_org() IS NULL OR uklad.current_member() IS NULL THEN
    RAISE EXCEPTION 'no company' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE auth.desk_sessions SET revoked_at = now()
  WHERE org_id = uklad.current_org() AND device_ref = p_device AND revoked_at IS NULL;
  INSERT INTO auth.desk_sessions (token_hash, org_id, device_ref, name, created_by, expires_at)
  VALUES (p_token, uklad.current_org(), p_device, p_name, uklad.current_member(), now() + p_ttl)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Кто это: живой пропуск стола → компания и устройство. Ставит компанию в
-- транзакции, как `auth.resolve`, чтобы дальше работал RLS.
CREATE FUNCTION auth.desk_resolve(p_token bytea)
RETURNS TABLE (desk_id uuid, org_id uuid, device_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE d auth.desk_sessions;
BEGIN
  PERFORM set_config('app.org_id', '', true);
  PERFORM set_config('app.member_id', '', true);
  SELECT x.* INTO d FROM auth.desk_sessions x
  WHERE x.token_hash = p_token AND x.revoked_at IS NULL AND x.expires_at > now();
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE auth.desk_sessions x SET last_seen_at = now()
  WHERE x.id = d.id AND x.last_seen_at < now() - interval '1 minute';
  PERFORM set_config('app.org_id', d.org_id::text, true);
  RETURN QUERY SELECT d.id, d.org_id, d.device_ref;
END $$;

-- Погасить стол: по пропуску (отвязка на самом столе) или по устройству в
-- текущей компании (экран «Устройства» руководителя).
CREATE FUNCTION auth.close_desk(p_token bytea) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE auth.desk_sessions SET revoked_at = now()
  WHERE token_hash = p_token AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE FUNCTION auth.revoke_desk(p_device text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF uklad.current_org() IS NULL THEN RETURN 0; END IF;
  UPDATE auth.desk_sessions SET revoked_at = now()
  WHERE org_id = uklad.current_org() AND device_ref = p_device AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION
  auth.open_desk(text, text, bytea, interval),
  auth.desk_resolve(bytea),
  auth.close_desk(bytea),
  auth.revoke_desk(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.open_desk(text, text, bytea, interval),
  auth.desk_resolve(bytea),
  auth.close_desk(bytea),
  auth.revoke_desk(text)
TO uklad_app;
