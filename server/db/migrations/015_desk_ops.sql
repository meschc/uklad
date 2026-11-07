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
  UNIQUE (org_id, op_key)
);
CREATE INDEX desk_ops_received ON uklad.desk_ops (org_id, received_at);

ALTER TABLE uklad.desk_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_ops FORCE ROW LEVEL SECURITY;
CREATE POLICY desk_ops_read ON uklad.desk_ops FOR SELECT
  USING (org_id = uklad.current_org());
CREATE POLICY desk_ops_write ON uklad.desk_ops FOR INSERT
  WITH CHECK (org_id = uklad.current_org());

-- Только читать и дописывать.
GRANT SELECT, INSERT ON uklad.desk_ops TO uklad_app;
