-- Один вход на бейдж: новый вход за другим столом гасит прежний.
--
-- До этой миграции бейдж, отсканированный за вторым столом, вставал за него,
-- а за первым оставался ещё 12 часов. На складе в 5–10 столов человек уходит
-- от стола, не выйдя, и встаёт за соседний: за первым столом его вход жив, и
-- следующий, кто там работает без своего скана, пишет журнал, выработку и
-- оплату часов на него. Теперь, как в WMS с одним входом на пользователя
-- (SAP EWM: пользователь — на одном ресурсе), вход у сотрудника один: скан
-- за новым столом снимает его с прежнего. Прежний стол узнаёт об этом из
-- `auth.desk_taken` и показывает «Вход перехвачен».
--
-- Снятого держим в «прежнем» 10 минут, как при обычной смене за столом
-- (012): отметки, сделанные до перехвата и дошедшие позже, остаются его, а
-- сделанные после — уже не его (`deskOps.js`, `not_present`).

ALTER TABLE auth.desk_sessions
  -- Кого и когда перехватили с этого стола и за каким столом он теперь.
  ADD COLUMN taken_staff_ref text CHECK (length(taken_staff_ref) BETWEEN 1 AND 100),
  ADD COLUMN taken_at timestamptz,
  ADD COLUMN taken_by_desk uuid REFERENCES auth.desk_sessions (id);

CREATE OR REPLACE FUNCTION auth.desk_set_staff(p_token bytea, p_staff text, p_ttl interval)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE v_id uuid; v_org uuid;
BEGIN
  SELECT id, org_id INTO v_id, v_org FROM auth.desk_sessions
  WHERE token_hash = p_token AND revoked_at IS NULL AND expires_at > now();
  IF v_id IS NULL THEN RETURN; END IF;

  IF p_staff IS NOT NULL THEN
    -- Два стола сканируют один бейдж в одну секунду: по очереди, иначе
    -- встречные UPDATE двух строк дают взаимную блокировку.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text || '/' || p_staff, 49));
    UPDATE auth.desk_sessions SET
      prev_staff_ref = staff_ref,
      prev_since = staff_since,
      prev_until = now() + interval '10 minutes',
      staff_ref = NULL,
      staff_since = NULL,
      staff_until = NULL,
      taken_staff_ref = p_staff,
      taken_at = now(),
      taken_by_desk = v_id
    WHERE org_id = v_org AND id <> v_id AND revoked_at IS NULL AND expires_at > now()
      AND staff_ref = p_staff AND staff_until > now();
  END IF;

  UPDATE auth.desk_sessions SET
    prev_staff_ref = CASE
      WHEN staff_ref IS NOT NULL AND staff_until > now()
           AND staff_ref IS DISTINCT FROM p_staff THEN staff_ref
      ELSE prev_staff_ref END,
    prev_until = CASE
      WHEN staff_ref IS NOT NULL AND staff_until > now()
           AND staff_ref IS DISTINCT FROM p_staff THEN now() + interval '10 minutes'
      ELSE prev_until END,
    prev_since = CASE
      WHEN staff_ref IS NOT NULL AND staff_until > now()
           AND staff_ref IS DISTINCT FROM p_staff THEN staff_since
      ELSE prev_since END,
    -- Повторный скан того же бейджа продлевает вход, но не сдвигает начало.
    staff_since = CASE
      WHEN p_staff IS NULL THEN NULL
      WHEN staff_ref IS NOT DISTINCT FROM p_staff AND staff_until > now() THEN staff_since
      ELSE now() END,
    staff_ref = p_staff,
    staff_until = CASE WHEN p_staff IS NULL THEN NULL ELSE now() + p_ttl END,
    -- За столом снова вошли или вышли: прежняя весть о перехвате ни к чему.
    taken_staff_ref = NULL,
    taken_at = NULL,
    taken_by_desk = NULL
  WHERE id = v_id;
END $$;

-- Кого перехватили с этого стола: сотрудник, когда и имя стола, где он
-- теперь. Пусто — перехвата не было или за столом уже вошли заново.
CREATE FUNCTION auth.desk_taken(p_token bytea)
RETURNS TABLE (staff_ref text, taken_at timestamptz, by_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT d.taken_staff_ref, d.taken_at, n.name
  FROM auth.desk_sessions d
  LEFT JOIN auth.desk_sessions n ON n.id = d.taken_by_desk
  WHERE d.token_hash = p_token AND d.revoked_at IS NULL AND d.expires_at > now()
    AND d.taken_staff_ref IS NOT NULL AND d.taken_at > now() - interval '12 hours';
$$;

REVOKE EXECUTE ON FUNCTION auth.desk_taken(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.desk_taken(bytea) TO uklad_app;
