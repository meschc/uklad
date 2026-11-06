-- Кто сейчас за столом: смена стола на сервере.
--
-- До этой миграции сервер знал только «это стол компании», но не кто за ним
-- стоит. Стол присылает снимок кабинета, и отметку смены или решение по
-- спорному можно было записать за любого сотрудника. Теперь бейдж,
-- отсканированный за столом, запоминается в пропуске стола на 12 часов, и
-- запись стола проверяется по нему (`server/api/src/cabinet/desks.js`):
-- отметки смены — только этого сотрудника, решение спорного — только его и
-- только если он старший.
--
-- Прежнего сотрудника держим ещё 10 минут после смены: отметки, набранные
-- до того, как за стол встал следующий, могут дойти до сервера чуть позже.

ALTER TABLE auth.desk_sessions
  ADD COLUMN staff_ref text CHECK (staff_ref IS NULL OR length(staff_ref) BETWEEN 1 AND 100),
  ADD COLUMN staff_until timestamptz,
  ADD COLUMN prev_staff_ref text CHECK (prev_staff_ref IS NULL OR length(prev_staff_ref) BETWEEN 1 AND 100),
  ADD COLUMN prev_until timestamptz;

-- Встал за стол (бейдж узнан сервером) или ушёл (`p_staff` = NULL).
CREATE FUNCTION auth.desk_set_staff(p_token bytea, p_staff text, p_ttl interval)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
BEGIN
  UPDATE auth.desk_sessions SET
    prev_staff_ref = CASE
      WHEN staff_ref IS NOT NULL AND staff_until > now()
           AND staff_ref IS DISTINCT FROM p_staff THEN staff_ref
      ELSE prev_staff_ref END,
    prev_until = CASE
      WHEN staff_ref IS NOT NULL AND staff_until > now()
           AND staff_ref IS DISTINCT FROM p_staff THEN now() + interval '10 minutes'
      ELSE prev_until END,
    staff_ref = p_staff,
    staff_until = CASE WHEN p_staff IS NULL THEN NULL ELSE now() + p_ttl END
  WHERE token_hash = p_token AND revoked_at IS NULL AND expires_at > now();
END $$;

-- Кто за столом сейчас и кто был только что; истёкшее — NULL.
CREATE FUNCTION auth.desk_staff(p_token bytea)
RETURNS TABLE (staff_ref text, prev_staff_ref text)
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT
    CASE WHEN d.staff_until > now() THEN d.staff_ref END,
    CASE WHEN d.prev_until > now() THEN d.prev_staff_ref END
  FROM auth.desk_sessions d
  WHERE d.token_hash = p_token AND d.revoked_at IS NULL AND d.expires_at > now();
$$;

REVOKE EXECUTE ON FUNCTION
  auth.desk_set_staff(bytea, text, interval),
  auth.desk_staff(bytea)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.desk_set_staff(bytea, text, interval),
  auth.desk_staff(bytea)
TO uklad_app;
