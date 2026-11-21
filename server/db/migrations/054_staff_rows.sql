-- Сотрудники переезжают из карточки склада в строки (план переноса снимка,
-- шаг «сотрудники», 21.11; склады — миграция 051).
--
-- Кабинет по-прежнему присылает и получает сотрудников в карточке склада
-- (`warehouse.staff`), но сервер хранит каждого строкой `uklad.staff`, а
-- карточка склада — без них. Собирает обратно `uklad.load_warehouses`, так
-- что кабинет, стол, журнал и права видят тот же JSON. Имя и должность — ещё
-- и колонками; вся карточка сотрудника (ставка, телефон, почта) — в `card`.
-- Порядок в списке — `position`.
--
-- Список, который нельзя разложить без потерь (нет строкового id, id
-- повторяются), остаётся в карточке склада как был — тем же правилом, что
-- списки работы и сами склады. `staff_rows` у склада — «сотрудники лежат
-- строками»: без пометки пустой список и отсутствие ключа не различить.

CREATE TABLE uklad.staff (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  warehouse_ref text NOT NULL CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  ref text NOT NULL CHECK (length(ref) BETWEEN 1 AND 100),
  name text,
  role text,
  card jsonb NOT NULL CHECK (jsonb_typeof(card) = 'object'),
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Корзина: пропавший из списка сотрудник не удаляется (журнал смен и
  -- бейджи ссылаются на него по `ref`).
  deleted_at timestamptz,
  PRIMARY KEY (org_id, warehouse_ref, ref)
);
CREATE INDEX staff_live ON uklad.staff (org_id, warehouse_ref, position)
  WHERE deleted_at IS NULL;

ALTER TABLE uklad.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.staff FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_own ON uklad.staff
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
GRANT SELECT, INSERT, UPDATE ON uklad.staff TO uklad_app;

ALTER TABLE uklad.warehouses ADD COLUMN staff_rows boolean NOT NULL DEFAULT false;

-- Годен ли список сотрудников для строк: объекты со строковым id, без повторов.
CREATE FUNCTION uklad.staff_cards_ok(p_staff jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_typeof(p_staff) = 'array', false)
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_staff) s
      WHERE NOT coalesce(jsonb_typeof(s) = 'object' AND jsonb_typeof(s->'id') = 'string'
                         AND length(s->>'id') BETWEEN 1 AND 100, false))
    AND (SELECT count(DISTINCT s->>'id') = count(*) FROM jsonb_array_elements(p_staff) s)
$$;

-- Сотрудники одного склада → строки: изменённое переписывается, пропавшее —
-- в корзину, вернувшееся — из неё.
CREATE FUNCTION uklad.save_staff(p_wh text, p_staff jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  INSERT INTO uklad.staff AS s (org_id, warehouse_ref, ref, name, role, card, position)
  SELECT uklad.current_org(), p_wh, c->>'id',
    CASE WHEN jsonb_typeof(c->'name') = 'string' THEN left(c->>'name', 500) END,
    CASE WHEN jsonb_typeof(c->'role') = 'string' THEN left(c->>'role', 200) END,
    c, (n - 1)::integer
  FROM jsonb_array_elements(p_staff) WITH ORDINALITY AS t(c, n)
  ON CONFLICT (org_id, warehouse_ref, ref) DO UPDATE SET
    name = excluded.name, role = excluded.role, card = excluded.card,
    position = excluded.position, deleted_at = NULL, updated_at = now()
  WHERE s.deleted_at IS NOT NULL
    OR (s.card, s.position) IS DISTINCT FROM (excluded.card, excluded.position);

  UPDATE uklad.staff s SET deleted_at = now(), updated_at = now()
  WHERE s.org_id = uklad.current_org() AND s.warehouse_ref = p_wh AND s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_staff) c WHERE c->>'id' = s.ref);
END $$;

-- Склады компании для кабинета — с сотрудниками из строк.
CREATE OR REPLACE FUNCTION uklad.load_warehouses() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(
    w.card || jsonb_build_object('id', w.ref)
      || CASE WHEN w.staff_rows THEN jsonb_build_object('staff', coalesce((
           SELECT jsonb_agg(s.card ORDER BY s.position, s.created_at) FROM uklad.staff s
           WHERE s.org_id = w.org_id AND s.warehouse_ref = w.ref AND s.deleted_at IS NULL),
           '[]'::jsonb)) ELSE '{}'::jsonb END
    ORDER BY w.position, w.created_at), '[]')
  FROM uklad.warehouses w
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
$$;

-- Склады → строки, сотрудники каждого склада — своими строками (051 + 054).
-- Карточка без ключа `staff` значит «сотрудники не менялись»: пометка и
-- строки остаются как были (ревью безопасности #231), иначе одна такая
-- запись спрятала бы людей склада от кабинета и бейджей.
CREATE OR REPLACE FUNCTION uklad.save_warehouses(p_cards jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
DECLARE
  one jsonb;
BEGIN
  IF NOT uklad.warehouse_cards_ok(p_cards) THEN
    RAISE EXCEPTION 'warehouses must be cards with unique ids'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO uklad.warehouses AS w
    (org_id, ref, name, kind, address, placeholder, card, position, staff_rows)
  SELECT uklad.current_org(), c->>'id',
    CASE WHEN jsonb_typeof(c->'name') = 'string' THEN left(c->>'name', 500) END,
    CASE WHEN jsonb_typeof(c->'kind') = 'string' THEN left(c->>'kind', 100) END,
    CASE WHEN jsonb_typeof(c->'address') = 'string' THEN left(c->>'address', 1000) END,
    coalesce(c->'placeholder' = 'true'::jsonb, false),
    CASE WHEN uklad.staff_cards_ok(c->'staff') THEN c - 'id' - 'staff' ELSE c - 'id' END,
    (n - 1)::integer,
    uklad.staff_cards_ok(c->'staff')
  FROM jsonb_array_elements(p_cards) WITH ORDINALITY AS t(c, n)
  ON CONFLICT (org_id, ref) DO UPDATE SET
    name = excluded.name, kind = excluded.kind, address = excluded.address,
    placeholder = excluded.placeholder, card = excluded.card, position = excluded.position,
    staff_rows = CASE WHEN excluded.staff_rows OR excluded.card ? 'staff'
                      THEN excluded.staff_rows ELSE w.staff_rows END,
    deleted_at = NULL, updated_at = now()
  WHERE w.deleted_at IS NOT NULL
    OR (w.card, w.position) IS DISTINCT FROM (excluded.card, excluded.position)
    OR (excluded.staff_rows OR excluded.card ? 'staff')
       AND w.staff_rows IS DISTINCT FROM excluded.staff_rows;

  FOR one IN SELECT x FROM jsonb_array_elements(p_cards) x LOOP
    IF uklad.staff_cards_ok(one->'staff') THEN
      PERFORM uklad.save_staff(one->>'id', one->'staff');
    END IF;
  END LOOP;

  UPDATE uklad.warehouses w SET deleted_at = now(), updated_at = now()
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_cards) c WHERE c->>'id' = w.ref);
END $$;

REVOKE EXECUTE ON FUNCTION uklad.staff_cards_ok(jsonb), uklad.save_staff(text, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uklad.staff_cards_ok(jsonb), uklad.save_staff(text, jsonb)
  TO uklad_app;

-- Удаление компании стирает и сотрудников: в карточках телефоны и почты.
CREATE OR REPLACE FUNCTION uklad.drop_cabinet_warehouses() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', OLD.org_id::text, true);
  DELETE FROM uklad.warehouses WHERE org_id = OLD.org_id AND card IS NOT NULL;
  DELETE FROM uklad.staff WHERE org_id = OLD.org_id;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN OLD;
END $$;

-- Перенос: сотрудники складов, уже лежащих строками, — в свои строки.
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  w record;
BEGIN
  FOR w IN SELECT org_id, ref, card FROM uklad.warehouses
           WHERE card IS NOT NULL AND uklad.staff_cards_ok(card->'staff')
  LOOP
    PERFORM set_config('app.org_id', w.org_id::text, true);
    PERFORM uklad.save_staff(w.ref, w.card->'staff');
    UPDATE uklad.warehouses SET card = card - 'staff', staff_rows = true
    WHERE org_id = w.org_id AND ref = w.ref;
  END LOOP;
  PERFORM set_config('app.org_id', '', true);
END $$;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
