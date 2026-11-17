-- Старший перекладывает тару целиком (`server/api/src/cabinet/deskMerge.js`,
-- `applyToteMove`): `pack_move` — тара переполнена, порвалась или
-- недособранную нужно освободить. Право — решать по товару, у того, кто
-- сейчас за столом. Шаг журнала — `pack` (миграция 044 считает его по
-- префиксу вида).
--
-- Вид дописывается к текущему ограничению, как в 047.
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
  IF NOT 'pack_move' = ANY (kinds) THEN
    kinds := kinds || 'pack_move'::text;
  END IF;
  ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
  EXECUTE format(
    'ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check CHECK (kind = ANY (%L::text[]))',
    kinds);
END $$;
