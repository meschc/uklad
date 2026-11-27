-- Отмена своей раскладки (`sort_undo`, `server/api/src/cabinet/deskSort.js`).
-- Свою посылку вынули из места сортировки, пока отгрузка места не закрыта:
-- посылка снова «не разложена». Товар не двигается.
--
-- Вид дописывается к текущему ограничению, а не переписывает список целиком
-- (как в 042). Ограничение бывает в двух записях: `ARRAY['a'::text, …]` (до
-- 042) и `'{a,b}'::text[]` (после 042), поэтому виды берутся словами из
-- выражения после ANY, без служебных `text` и `array`.
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
  IF NOT 'sort_undo' = ANY (kinds) THEN
    kinds := kinds || 'sort_undo'::text;
  END IF;
  ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
  EXECUTE format(
    'ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check CHECK (kind = ANY (%L::text[]))',
    kinds);
END $$;
