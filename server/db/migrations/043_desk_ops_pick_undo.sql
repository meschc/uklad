-- Отмена снятой в сборке штуки (`pick_undo`, `server/api/src/cabinet/deskPick.js`).
-- Сборщик ошибся — не та тара, лишняя штука, тара полна: штука возвращается
-- из тары в тот же короб, собранное по заявке −1. Скан из журнала не
-- исчезает: отмена — своя строка журнала операций со ссылкой на него.
--
-- Вид дописывается к текущему ограничению, а не переписывает список целиком:
-- миграции соседних PR (040–042) тоже добавляют виды, и порядок вливания не
-- должен выкинуть чужой.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conname = 'desk_ops_kind_check' AND conrelid = 'uklad.desk_ops'::regclass;
  IF def LIKE '%''pick_undo''%' THEN
    RETURN;
  END IF;
  ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
  EXECUTE 'ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check '
    || replace(def, '::text])', '::text, ''pick_undo''::text])');
END $$;
