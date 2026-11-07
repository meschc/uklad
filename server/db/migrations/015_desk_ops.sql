-- Журнал операций стола (шаг 3 переезда на таблицы).
--
-- Стол больше не переписывает снимок целиком на каждое действие: он шлёт
-- операции — «отметил начало смены», «отменил отметку» — каждую со своим
-- ключом. Сервер применяет операцию к текущему снимку сам, поэтому правка
-- руководителя в это же время не отбрасывает работу стола, а повтор после
-- обрыва связи не задваивает её: тот же ключ вернёт тот же ответ.
--
-- Физический факт не отклоняется, а помечается (`flagged`): отметка смены,
-- которую сервер не смог приписать человеку за столом, остаётся здесь со
-- всем, что прислал стол, и её видно руководителю.

CREATE TABLE uklad.desk_ops (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Ключ повтора, который придумывает устройство: один на операцию.
  op_key text NOT NULL CHECK (length(op_key) BETWEEN 8 AND 100),
  desk_id uuid NOT NULL REFERENCES auth.desk_sessions (id),
  -- Кто был за столом по данным сервера в момент приёма.
  staff_ref text CHECK (length(staff_ref) <= 100),
  kind text NOT NULL CHECK (kind IN ('shift_mark', 'shift_undo')),
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object'),
  status text NOT NULL CHECK (status IN ('applied', 'flagged')),
  -- Почему помечена: сервер не смог применить факт как есть.
  reason text CHECK (length(reason) <= 100),
  -- Когда операция случилась на устройстве и когда дошла до сервера.
  happened_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  -- Ключ — у каждого стола свой: один стол не займёт ключ другого.
  UNIQUE (org_id, desk_id, op_key)
);
CREATE INDEX desk_ops_received ON uklad.desk_ops (org_id, received_at);
-- Когда сервер принял отметку: окно отмены считается по нему, а не по часам стола.
CREATE INDEX desk_ops_event ON uklad.desk_ops (org_id, (body->>'eventId'));

ALTER TABLE uklad.desk_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_ops FORCE ROW LEVEL SECURITY;
CREATE POLICY desk_ops_read ON uklad.desk_ops FOR SELECT
  USING (org_id = uklad.current_org());
CREATE POLICY desk_ops_write ON uklad.desk_ops FOR INSERT
  WITH CHECK (org_id = uklad.current_org());

-- Только читать и дописывать.
GRANT SELECT, INSERT ON uklad.desk_ops TO uklad_app;

-- С какого момента сотрудник за столом. Отметка из очереди устройства может
-- прийти с опозданием, но не раньше, чем человек встал за стол: иначе
-- «начало смены» задним числом на сутки легло бы как настоящее.
ALTER TABLE auth.desk_sessions
  ADD COLUMN staff_since timestamptz,
  ADD COLUMN prev_since timestamptz;

CREATE OR REPLACE FUNCTION auth.desk_set_staff(p_token bytea, p_staff text, p_ttl interval)
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
    staff_until = CASE WHEN p_staff IS NULL THEN NULL ELSE now() + p_ttl END
  WHERE token_hash = p_token AND revoked_at IS NULL AND expires_at > now();
END $$;

-- Кто за столом и с какого времени; прежний — с какого и до какого стоял.
-- Входы до этой миграции начала не знают: считаем от последнего скана.
CREATE FUNCTION auth.desk_staff_times(p_token bytea)
RETURNS TABLE (
  staff_ref text, staff_since timestamptz,
  prev_staff_ref text, prev_since timestamptz, prev_left timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT
    CASE WHEN d.staff_until > now() THEN d.staff_ref END,
    CASE WHEN d.staff_until > now()
      THEN coalesce(d.staff_since, d.staff_until - interval '12 hours') END,
    CASE WHEN d.prev_until > now() THEN d.prev_staff_ref END,
    CASE WHEN d.prev_until > now()
      THEN coalesce(d.prev_since, d.prev_until - interval '12 hours 10 minutes') END,
    CASE WHEN d.prev_until > now() THEN d.prev_until - interval '10 minutes' END
  FROM auth.desk_sessions d
  WHERE d.token_hash = p_token AND d.revoked_at IS NULL AND d.expires_at > now();
$$;

REVOKE EXECUTE ON FUNCTION
  auth.desk_set_staff(bytea, text, interval),
  auth.desk_staff_times(bytea)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.desk_set_staff(bytea, text, interval),
  auth.desk_staff_times(bytea)
TO uklad_app;
