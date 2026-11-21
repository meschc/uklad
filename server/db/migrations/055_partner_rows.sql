-- Партнёры-продавцы переезжают из карточки склада в строки (план переноса
-- снимка, шаг «партнёры», 21.11; тем же путём, что сотрудники в 054).
--
-- Кабинет по-прежнему присылает и получает партнёров в карточке склада
-- (`warehouse.partners`), сервер хранит каждого строкой `uklad.partners`:
-- название и ИНН — колонками, вся карточка (реквизиты, контакты) — в `card`.
-- Собирает обратно `uklad.load_warehouses`, поэтому кабинет, стол, продавец,
-- приглашения и подкачка заказов видят тот же JSON. Карточка склада без
-- ключа `partners` значит «партнёры не менялись» (как `staff` в 054); список
-- с повтором id остаётся в карточке как был. Убранный партнёр — в корзину:
-- на него ссылаются товары, заказы и люди продавца (`partner_ref`).

CREATE TABLE uklad.partners (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  warehouse_ref text NOT NULL CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  ref text NOT NULL CHECK (length(ref) BETWEEN 1 AND 100),
  name text,
  inn text,
  card jsonb NOT NULL CHECK (jsonb_typeof(card) = 'object'),
  position integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (org_id, warehouse_ref, ref)
);
CREATE INDEX partners_live ON uklad.partners (org_id, warehouse_ref, position)
  WHERE deleted_at IS NULL;

ALTER TABLE uklad.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.partners FORCE ROW LEVEL SECURITY;
CREATE POLICY partners_own ON uklad.partners
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
GRANT SELECT, INSERT, UPDATE ON uklad.partners TO uklad_app;

ALTER TABLE uklad.warehouses ADD COLUMN partner_rows boolean NOT NULL DEFAULT false;

-- Партнёры одного склада → строки: изменённое переписывается, пропавшее —
-- в корзину, вернувшееся — из неё. Годность списка — `staff_cards_ok` (054):
-- те же правила, объекты со строковым id без повторов.
CREATE FUNCTION uklad.save_partners(p_wh text, p_list jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  INSERT INTO uklad.partners AS s (org_id, warehouse_ref, ref, name, inn, card, position)
  SELECT uklad.current_org(), p_wh, c->>'id',
    CASE WHEN jsonb_typeof(c->'name') = 'string' THEN left(c->>'name', 500) END,
    CASE WHEN jsonb_typeof(c->'inn') = 'string' THEN left(c->>'inn', 20) END,
    c, (n - 1)::integer
  FROM jsonb_array_elements(p_list) WITH ORDINALITY AS t(c, n)
  ON CONFLICT (org_id, warehouse_ref, ref) DO UPDATE SET
    name = excluded.name, inn = excluded.inn, card = excluded.card,
    position = excluded.position, deleted_at = NULL, updated_at = now()
  WHERE s.deleted_at IS NOT NULL
    OR (s.card, s.position) IS DISTINCT FROM (excluded.card, excluded.position);

  UPDATE uklad.partners s SET deleted_at = now(), updated_at = now()
  WHERE s.org_id = uklad.current_org() AND s.warehouse_ref = p_wh AND s.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_list) c WHERE c->>'id' = s.ref);
END $$;

-- Склады компании для кабинета — с сотрудниками и партнёрами из строк.
CREATE OR REPLACE FUNCTION uklad.load_warehouses() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(
    w.card || jsonb_build_object('id', w.ref)
      || CASE WHEN w.staff_rows THEN jsonb_build_object('staff', coalesce((
           SELECT jsonb_agg(s.card ORDER BY s.position, s.created_at) FROM uklad.staff s
           WHERE s.org_id = w.org_id AND s.warehouse_ref = w.ref AND s.deleted_at IS NULL),
           '[]'::jsonb)) ELSE '{}'::jsonb END
      || CASE WHEN w.partner_rows THEN jsonb_build_object('partners', coalesce((
           SELECT jsonb_agg(p.card ORDER BY p.position, p.created_at) FROM uklad.partners p
           WHERE p.org_id = w.org_id AND p.warehouse_ref = w.ref AND p.deleted_at IS NULL),
           '[]'::jsonb)) ELSE '{}'::jsonb END
    ORDER BY w.position, w.created_at), '[]')
  FROM uklad.warehouses w
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
$$;

-- Склады → строки; сотрудники и партнёры каждого склада — своими строками.
-- Карточка без ключа списка — «не менялся»: пометка и строки остаются.
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
    (org_id, ref, name, kind, address, placeholder, card, position, staff_rows, partner_rows)
  SELECT uklad.current_org(), c->>'id',
    CASE WHEN jsonb_typeof(c->'name') = 'string' THEN left(c->>'name', 500) END,
    CASE WHEN jsonb_typeof(c->'kind') = 'string' THEN left(c->>'kind', 100) END,
    CASE WHEN jsonb_typeof(c->'address') = 'string' THEN left(c->>'address', 1000) END,
    coalesce(c->'placeholder' = 'true'::jsonb, false),
    c - 'id'
      - CASE WHEN uklad.staff_cards_ok(c->'staff') THEN 'staff' ELSE '' END
      - CASE WHEN uklad.staff_cards_ok(c->'partners') THEN 'partners' ELSE '' END,
    (n - 1)::integer,
    uklad.staff_cards_ok(c->'staff'),
    uklad.staff_cards_ok(c->'partners')
  FROM jsonb_array_elements(p_cards) WITH ORDINALITY AS t(c, n)
  ON CONFLICT (org_id, ref) DO UPDATE SET
    name = excluded.name, kind = excluded.kind, address = excluded.address,
    placeholder = excluded.placeholder, card = excluded.card, position = excluded.position,
    staff_rows = CASE WHEN excluded.staff_rows OR excluded.card ? 'staff'
                      THEN excluded.staff_rows ELSE w.staff_rows END,
    partner_rows = CASE WHEN excluded.partner_rows OR excluded.card ? 'partners'
                        THEN excluded.partner_rows ELSE w.partner_rows END,
    deleted_at = NULL, updated_at = now()
  WHERE w.deleted_at IS NOT NULL
    OR (w.card, w.position) IS DISTINCT FROM (excluded.card, excluded.position)
    OR (excluded.staff_rows OR excluded.card ? 'staff')
       AND w.staff_rows IS DISTINCT FROM excluded.staff_rows
    OR (excluded.partner_rows OR excluded.card ? 'partners')
       AND w.partner_rows IS DISTINCT FROM excluded.partner_rows;

  FOR one IN SELECT x FROM jsonb_array_elements(p_cards) x LOOP
    IF uklad.staff_cards_ok(one->'staff') THEN
      PERFORM uklad.save_staff(one->>'id', one->'staff');
    END IF;
    IF uklad.staff_cards_ok(one->'partners') THEN
      PERFORM uklad.save_partners(one->>'id', one->'partners');
    END IF;
  END LOOP;

  UPDATE uklad.warehouses w SET deleted_at = now(), updated_at = now()
  WHERE w.org_id = uklad.current_org() AND w.deleted_at IS NULL AND w.card IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_cards) c WHERE c->>'id' = w.ref);
END $$;

REVOKE EXECUTE ON FUNCTION uklad.save_partners(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION uklad.save_partners(text, jsonb) TO uklad_app;

-- Удаление компании стирает и партнёров: в карточках реквизиты и контакты.
CREATE OR REPLACE FUNCTION uklad.drop_cabinet_warehouses() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', OLD.org_id::text, true);
  DELETE FROM uklad.warehouses WHERE org_id = OLD.org_id AND card IS NOT NULL;
  DELETE FROM uklad.staff WHERE org_id = OLD.org_id;
  DELETE FROM uklad.partners WHERE org_id = OLD.org_id;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN OLD;
END $$;

-- Перенос: партнёры складов, уже лежащих строками, — в свои строки.
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
DO $$
DECLARE
  w record;
BEGIN
  FOR w IN SELECT org_id, ref, card FROM uklad.warehouses
           WHERE card IS NOT NULL AND uklad.staff_cards_ok(card->'partners')
  LOOP
    PERFORM set_config('app.org_id', w.org_id::text, true);
    PERFORM uklad.save_partners(w.ref, w.card->'partners');
    UPDATE uklad.warehouses SET card = card - 'partners', partner_rows = true
    WHERE org_id = w.org_id AND ref = w.ref;
  END LOOP;
  PERFORM set_config('app.org_id', '', true);
END $$;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
