-- «Нет на месте» в сборке (`pick_missing`, `server/api/src/cabinet/deskPick.js`).
-- По учёту товар в коробе ячейки, сборщик его не нашёл: сервер заводит на
-- короб недостачу по инвентаризации и замораживает его до пересчёта старшим.
-- Остатки отметка не двигает.
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
  IF NOT 'pick_missing' = ANY (kinds) THEN
    kinds := kinds || 'pick_missing'::text;
  END IF;
  ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
  EXECUTE format(
    'ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check CHECK (kind = ANY (%L::text[]))',
    kinds);
END $$;
