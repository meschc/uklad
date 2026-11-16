-- Кто отвязал стол — и второй способ отвязать его на самом столе.
--
-- До этой миграции стол отвязывали на нём только бейджем с правом
-- staff.manage. Нет такого бейджа — стол не отвязать: вход паролем на этом
-- компьютере погашен привязкой, остаётся искать другой компьютер. Теперь на
-- столе можно отвязать и паролем руководителя (`auth.close_desk_by_account`),
-- тем же правом, каким стол привязывают.
--
-- Журнал устройства говорил «привязали» и «отвязали» по отметкам кабинета —
-- без того, кто это сделал. Теперь пропуск стола помнит, кто его погасил:
-- руководитель (`revoked_by`) или сотрудник по бейджу (`revoked_by_staff`),
-- а `auth.desk_events` отдаёт эти события журналу.

ALTER TABLE auth.desk_sessions
  ADD COLUMN revoked_by uuid,
  ADD COLUMN revoked_by_staff text CHECK (length(revoked_by_staff) BETWEEN 1 AND 100),
  ADD FOREIGN KEY (org_id, revoked_by) REFERENCES uklad.members (org_id, id);

-- Отвязка бейджем: кто — сотрудник склада, право проверил сервер
-- (`desk_staff_permissions`).
DROP FUNCTION auth.close_desk(bytea);
CREATE FUNCTION auth.close_desk(p_token bytea, p_staff text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE auth.desk_sessions SET revoked_at = now(), revoked_by_staff = p_staff
  WHERE token_hash = p_token AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Отвязка паролем на самом столе. Пароль проверил сервер; здесь — что эта
-- учётная запись входит в компанию стола и вправе управлять персоналом.
-- Компанию поставил `auth.desk_resolve` в этой же транзакции.
CREATE FUNCTION auth.close_desk_by_account(p_token bytea, p_account uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_member uuid;
BEGIN
  IF uklad.current_org() IS NULL THEN RETURN false; END IF;
  SELECT m.id INTO v_member
  FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  JOIN auth.accounts a ON a.id = m.account_id
  WHERE m.org_id = uklad.current_org() AND m.account_id = p_account
    AND auth.can_enter(m.status, m.deleted_at) AND a.disabled_at IS NULL
    AND 'staff.manage' = ANY (r.permissions);
  IF v_member IS NULL THEN RETURN false; END IF;
  UPDATE auth.desk_sessions SET revoked_at = now(), revoked_by = v_member
  WHERE token_hash = p_token AND org_id = uklad.current_org() AND revoked_at IS NULL;
  RETURN FOUND;
END $$;

-- С другого компьютера («Устройства → Отключить»): кто — вошедший руководитель.
CREATE OR REPLACE FUNCTION auth.revoke_desk(p_device text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE n integer;
BEGIN
  IF uklad.current_org() IS NULL THEN RETURN 0; END IF;
  UPDATE auth.desk_sessions SET revoked_at = now(), revoked_by = uklad.current_member()
  WHERE org_id = uklad.current_org() AND device_ref = p_device AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- События пропусков устройства: привязали (кто открыл стол) и отвязали (кто
-- погасил). `by_member` — имя руководителя (нет имени — его почта, её видит
-- только тот, кто управляет персоналом), `by_staff` — сотрудник по бейджу;
-- оба пусты — пропуск истёк сам или отвязан до этой миграции.
CREATE FUNCTION auth.desk_events(p_device text)
RETURNS TABLE (at timestamptz, kind text, by_member text, by_staff text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT e.at, e.kind, coalesce(m.display_name, a.email), e.by_staff
  FROM (
    SELECT d.created_at AS at, 'bound' AS kind, d.created_by AS member_id,
           NULL::text AS by_staff, d.org_id
    FROM auth.desk_sessions d
    WHERE d.org_id = uklad.current_org() AND d.device_ref = p_device
    UNION ALL
    SELECT d.revoked_at, 'revoked', d.revoked_by, d.revoked_by_staff, d.org_id
    FROM auth.desk_sessions d
    WHERE d.org_id = uklad.current_org() AND d.device_ref = p_device
      AND d.revoked_at IS NOT NULL
  ) e
  LEFT JOIN uklad.members m ON m.org_id = e.org_id AND m.id = e.member_id
  LEFT JOIN auth.accounts a ON a.id = m.account_id
  WHERE uklad.current_org() IS NOT NULL
  ORDER BY 1 DESC
  LIMIT 50
$$;

REVOKE EXECUTE ON FUNCTION
  auth.close_desk(bytea, text),
  auth.close_desk_by_account(bytea, uuid),
  auth.desk_events(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.close_desk(bytea, text),
  auth.close_desk_by_account(bytea, uuid),
  auth.desk_events(text)
TO uklad_app;
