-- Оглавление кабинета — строками, а не в документе снимка (план переноса
-- снимка, последний шаг, 22.11; ADR 0010).
--
-- После 051–055 в документе `cabinet_snapshots.data` оставались только
-- метки `{ "$rows": n }`: «этот список лежит строками `cabinet_records`, в
-- нём n записей». Теперь и метки хранит таблица `uklad.cabinet_slots`: место
-- (`place`: '' — корень документа, иначе склад из `warehouseData`), список и
-- число. Документ остаётся пустым объектом, а в нём — только список, который
-- нельзя разложить строками без потерь (повтор id): лучше вес, чем пропавшая
-- запись.
--
-- Разбирает метки сама база, триггером на записи снимка, поэтому все пути
-- записи (кабинет целиком, только изменённое, стол, подкачка заказов) ведут
-- себя одинаково и ни один не оставит метку в документе. Собирает обратно
-- сервер при чтении (`records.js`, `withSlots`): кабинет, стол и проверки
-- видят тот же документ с метками, что и раньше. Версия и формат кабинета
-- остаются в `cabinet_snapshots`.

CREATE TABLE uklad.cabinet_slots (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  place text NOT NULL CHECK (length(place) <= 200),
  domain text NOT NULL CHECK (length(domain) BETWEEN 1 AND 200),
  n integer NOT NULL,
  PRIMARY KEY (org_id, place, domain)
);

ALTER TABLE uklad.cabinet_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.cabinet_slots FORCE ROW LEVEL SECURITY;
CREATE POLICY cabinet_slots_own ON uklad.cabinet_slots
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
-- Приложение оглавление только читает: пишет его триггер от имени владельца,
-- и удалять строки роли приложения по-прежнему нечем.
GRANT SELECT ON uklad.cabinet_slots TO uklad_app;

-- Метка — объект ровно с одним ключом `$rows` и целым числом (как `isMark`).
CREATE FUNCTION uklad.rows_mark(p jsonb) RETURNS integer
LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE
    WHEN jsonb_typeof(p) = 'object'
     AND (SELECT count(*) FROM jsonb_object_keys(p)) = 1
     AND jsonb_typeof(p->'$rows') = 'number'
     AND (p->>'$rows')::numeric = trunc((p->>'$rows')::numeric)
     AND (p->>'$rows')::numeric BETWEEN -2147483648 AND 2147483647
    THEN (p->>'$rows')::integer
  END
$f$;

-- Запись снимка: метки корня и `warehouseData` — в оглавление, из документа
-- — прочь. Оглавление компании переписывается целиком: оно отражает ровно
-- тот документ, что лежит сейчас. Компания — та, чей снимок пишется: её
-- триггер ставит для политики оглавления сам (как `drop_cabinet_records`),
-- а чужой снимок приложению не записать — политика снимка проверяет строку
-- после триггера и откатывает всю запись вместе с оглавлением.
CREATE FUNCTION uklad.cabinet_slots_take() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, uklad, pg_temp AS $f$
DECLARE
  k text;
  v jsonb;
  wh text;
  work jsonb;
  n integer;
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', NEW.org_id::text, true);
  DELETE FROM uklad.cabinet_slots WHERE org_id = NEW.org_id;
  FOR k, v IN SELECT key, value FROM jsonb_each(NEW.data) LOOP
    n := uklad.rows_mark(v);
    CONTINUE WHEN n IS NULL;
    INSERT INTO uklad.cabinet_slots (org_id, place, domain, n) VALUES (NEW.org_id, '', k, n);
    NEW.data := NEW.data - k;
  END LOOP;
  IF jsonb_typeof(NEW.data->'warehouseData') = 'object' THEN
    FOR wh, work IN SELECT key, value FROM jsonb_each(NEW.data->'warehouseData') LOOP
      CONTINUE WHEN jsonb_typeof(work) <> 'object' OR wh = '' OR length(wh) > 200;
      FOR k, v IN SELECT key, value FROM jsonb_each(work) LOOP
        n := uklad.rows_mark(v);
        CONTINUE WHEN n IS NULL;
        INSERT INTO uklad.cabinet_slots (org_id, place, domain, n) VALUES (NEW.org_id, wh, k, n);
        work := work - k;
      END LOOP;
      NEW.data := jsonb_set(NEW.data, ARRAY['warehouseData', wh], work);
    END LOOP;
  END IF;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN NEW;
END $f$;
REVOKE EXECUTE ON FUNCTION uklad.cabinet_slots_take() FROM PUBLIC;

CREATE TRIGGER cabinet_slots_take BEFORE INSERT OR UPDATE OF data ON uklad.cabinet_snapshots
  FOR EACH ROW EXECUTE FUNCTION uklad.cabinet_slots_take();

-- Удаление компании стирает и оглавление вместе со строками (021).
CREATE OR REPLACE FUNCTION uklad.drop_cabinet_records() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $f$
DECLARE
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', OLD.org_id::text, true);
  DELETE FROM uklad.cabinet_records WHERE org_id = OLD.org_id;
  DELETE FROM uklad.cabinet_slots WHERE org_id = OLD.org_id;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN OLD;
END $f$;

-- Перенос: метки всех снимков — в оглавление (тот же триггер).
ALTER TABLE uklad.cabinet_snapshots NO FORCE ROW LEVEL SECURITY;
DO $f$
DECLARE
  s record;
BEGIN
  FOR s IN SELECT org_id FROM uklad.cabinet_snapshots LOOP
    PERFORM set_config('app.org_id', s.org_id::text, true);
    UPDATE uklad.cabinet_snapshots SET data = data WHERE org_id = s.org_id;
  END LOOP;
  PERFORM set_config('app.org_id', '', true);
END $f$;
ALTER TABLE uklad.cabinet_snapshots FORCE ROW LEVEL SECURITY;
