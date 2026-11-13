-- Журнал устройства: кто и что делал за этим столом.
--
-- Кирилл 12.11: в «Устройствах» видно только, кто за столом сейчас, а нужно и
-- кто работал раньше — тот же журнал операций сотрудника, но по устройству.
-- Операции стола уже лежат строками (`uklad.desk_ops`, миграция 015) с тем,
-- кто был за столом по данным сервера; устройство у них — через пропуск стола
-- (`auth.desk_sessions.device_ref`). Схема `auth` приложению не видна, поэтому
-- соединение — функцией с явной проверкой компании, как `auth.revoke_desk`.
--
-- Номер 026: 025 занят веткой инвентаризации.

CREATE FUNCTION auth.desk_journal(p_device text, p_limit integer)
RETURNS TABLE (at timestamptz, staff_ref text, kind text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT coalesce(o.happened_at, o.received_at), o.staff_ref, o.kind, o.status
  FROM uklad.desk_ops o
  JOIN auth.desk_sessions d ON d.id = o.desk_id AND d.org_id = o.org_id
  WHERE uklad.current_org() IS NOT NULL
    AND o.org_id = uklad.current_org()
    AND d.device_ref = p_device
  ORDER BY 1 DESC
  LIMIT least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

REVOKE EXECUTE ON FUNCTION auth.desk_journal(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.desk_journal(text, integer) TO uklad_app;
