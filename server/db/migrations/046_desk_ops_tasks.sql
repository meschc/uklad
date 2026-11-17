-- Работы склада у стола (`server/api/src/cabinet/deskTasks.js`): `task_take` —
-- сотрудник взял работу (маркировка, переупаковка, своя услуга склада),
-- `task_done` — закрыл её. Раньше работа менялась только снимком
-- руководителя, а сотрудник за столом её не видел. Теперь каждая отметка —
-- строка журнала операций стола: кто, когда и сколько сделал, по ней дата
-- услуги в счёте продавцу.
--
-- Вид дописывается к текущему ограничению, как в 043.
DO $$
DECLARE
  def text;
  kinds text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'desk_ops_kind_check' AND c.conrelid = 'uklad.desk_ops'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'desk_ops_kind_check не найдено';
  END IF;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO kinds
    FROM regexp_matches(substring(lower(def) FROM 'any\s*\((.*)\)'), '([a-z_]+)', 'g') AS m
   WHERE m[1] NOT IN ('text', 'array');
  IF kinds IS NULL OR NOT 'pick_unit' = ANY (kinds) THEN
    RAISE EXCEPTION 'не разобрал desk_ops_kind_check: %', def;
  END IF;
  IF NOT 'task_take' = ANY (kinds) THEN
    kinds := kinds || 'task_take'::text;
  END IF;
  IF NOT 'task_done' = ANY (kinds) THEN
    kinds := kinds || 'task_done'::text;
  END IF;
  ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
  EXECUTE format(
    'ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check CHECK (kind = ANY (%L::text[]))',
    kinds);
END $$;
