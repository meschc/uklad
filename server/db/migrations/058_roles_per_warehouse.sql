-- Роли — у каждого склада свои (Кирилл 22.11: «разные склады связывает
-- только владелец»; карточка «Свои у каждого склада»).
--
-- Было: роли общие на компанию. Начальник склада Б правил или удалял роль,
-- которой работают люди склада А, и тем менял им права; тестовая роль одного
-- склада появлялась на всех.
--
-- Стало: у роли есть склад (`warehouse_ref`). Роли компании — без склада:
-- владелец (`org.manage`), «Продавец» (без прав, 039) и «Продавец компании»
-- (`seller.requests`). Их нельзя ни править, ни удалить. Остальные — роли
-- склада: стандартные теперь тоже можно переименовать, поменять и удалить.
--
-- Перенос: у каждого склада — свои копии ролей компании. Первый склад
-- (по `position`, потом по времени) забирает сами роли, чтобы у компании с
-- одним складом id не менялись; остальные получают копии. Человек и
-- сотрудник у стола переходят на копию своего склада. Новый склад получает
-- набор по умолчанию триггером; если у компании ещё лежат роли без склада
-- (компания до первого склада), склад забирает их.

ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_staff_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.staff NO FORCE ROW LEVEL SECURITY;

ALTER TABLE uklad.roles
  ADD COLUMN warehouse_ref text
    CHECK (warehouse_ref IS NULL OR length(warehouse_ref) BETWEEN 1 AND 100),
  -- Роль, которую получает сотрудник у стола при выпуске бейджа без роли.
  -- Раньше её искали по имени — переименовали, и бейдж выходил без роли.
  ADD COLUMN desk_default boolean NOT NULL DEFAULT false;
CREATE INDEX roles_warehouse ON uklad.roles (org_id, warehouse_ref) WHERE deleted_at IS NULL;

UPDATE uklad.roles SET desk_default = true
WHERE is_default AND name = 'Кладовщик / оператор' AND deleted_at IS NULL;

-- Роль компании, а не склада: её нет в списке ролей склада и её не правят.
CREATE FUNCTION uklad.company_role(p_perms text[], p_default boolean, p_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT 'org.manage' = ANY (p_perms) OR 'seller.requests' = ANY (p_perms)
      OR (p_default AND p_name = 'Продавец' AND cardinality(p_perms) = 0)
$$;

-- Склад сотрудника у стола: строка `uklad.staff` или карточка склада; не
-- нашёлся, а склад у компании один, — этот склад.
CREATE FUNCTION uklad.staff_warehouse(p_org uuid, p_staff text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
  SELECT coalesce(
    (SELECT s.warehouse_ref FROM uklad.staff s
     WHERE s.org_id = p_org AND s.ref = p_staff AND s.deleted_at IS NULL LIMIT 1),
    (SELECT w.ref FROM uklad.warehouses w
     WHERE w.org_id = p_org AND w.deleted_at IS NULL AND NOT w.staff_rows
       AND w.card->'staff' @> jsonb_build_array(jsonb_build_object('id', p_staff))
     LIMIT 1))
$$;

CREATE FUNCTION uklad.only_warehouse(p_org uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
  SELECT CASE WHEN count(*) = 1 THEN min(ref) END FROM uklad.warehouses
  WHERE org_id = p_org AND deleted_at IS NULL
$$;

DO $$
DECLARE
  o record;
  w record;
  r record;
  v_first text;
  v_new uuid;
BEGIN
  FOR o IN SELECT DISTINCT org_id FROM uklad.warehouses WHERE deleted_at IS NULL LOOP
    v_first := NULL;
    FOR w IN SELECT ref FROM uklad.warehouses
             WHERE org_id = o.org_id AND deleted_at IS NULL
             ORDER BY position, created_at LOOP
      IF v_first IS NULL THEN
        v_first := w.ref;
        UPDATE uklad.roles x SET warehouse_ref = w.ref
        WHERE x.org_id = o.org_id AND x.deleted_at IS NULL
          AND NOT uklad.company_role(x.permissions, x.is_default, x.name);
        CONTINUE;
      END IF;
      FOR r IN SELECT * FROM uklad.roles x
               WHERE x.org_id = o.org_id AND x.deleted_at IS NULL AND x.warehouse_ref = v_first LOOP
        INSERT INTO uklad.roles (org_id, name, permissions, is_default, desk_default,
                                 warehouse_ref, created_at)
        VALUES (o.org_id, r.name, r.permissions, r.is_default, r.desk_default, w.ref, r.created_at)
        RETURNING id INTO v_new;
        UPDATE uklad.members m SET role_id = v_new
        WHERE m.org_id = o.org_id AND m.role_id = r.id AND m.warehouse_ref = w.ref;
        UPDATE uklad.desk_staff_roles d SET role_id = v_new
        WHERE d.org_id = o.org_id AND d.role_id = r.id
          AND uklad.staff_warehouse(o.org_id, d.staff_ref) = w.ref;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Набор компании при регистрации — тот же, что в 057, плюс отметка роли у стола.
CREATE OR REPLACE FUNCTION uklad.create_default_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO uklad.roles (org_id, name, permissions, is_default)
  SELECT NEW.id, 'Владелец', array_agg(code), true FROM uklad.permissions;
  IF NEW.has_warehouse THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Начальник склада', ARRAY['staff.view','staff.manage','contracts.manage',
        'plan.view','plan.edit','products.view','products.edit','stock.view','stock.move',
        'receiving.view','receiving.do','picking.view','picking.do','packing.view','packing.do',
        'shipping.view','shipping.do','inventory.view','inventory.count','goods.view',
        'goods.decide','goods.writeoff','chat.use','integrations.manage'], true),
      (NEW.id, 'Старший смены', ARRAY['staff.view','plan.view','products.view','stock.view',
        'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
        'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
        'goods.view','goods.decide','chat.use'], true),
      (NEW.id, 'Старший участка', ARRAY['plan.view','products.view','stock.view',
        'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
        'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
        'goods.view','goods.decide','chat.use'], true),
      (NEW.id, 'Кладовщик / оператор', ARRAY['plan.view','products.view','stock.view',
        'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
        'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
        'goods.view'], true),
      (NEW.id, 'Продавец', '{}'::text[], true);
  END IF;
  -- Компания-продавец. Если у неё и склад, «Продавец» уже есть (без прав).
  IF NEW.has_seller THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, CASE WHEN NEW.has_warehouse THEN 'Продавец компании' ELSE 'Продавец' END,
        ARRAY['products.view','products.edit','stock.view','seller.requests','chat.use'], true);
  END IF;
  -- Роль сотрудника у стола по умолчанию — по отметке, а не по имени (058).
  UPDATE uklad.roles SET desk_default = true
  WHERE org_id = NEW.id AND is_default AND name = 'Кладовщик / оператор';
  RETURN NEW;
END $$;

-- Новый склад — свой набор ролей (или забирает роли компании до склада).
CREATE FUNCTION uklad.create_warehouse_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
BEGIN
  UPDATE uklad.roles x SET warehouse_ref = NEW.ref
  WHERE x.org_id = NEW.org_id AND x.deleted_at IS NULL AND x.warehouse_ref IS NULL
    AND NOT uklad.company_role(x.permissions, x.is_default, x.name);
  IF FOUND OR EXISTS (SELECT 1 FROM uklad.roles x
                      WHERE x.org_id = NEW.org_id AND x.warehouse_ref = NEW.ref
                        AND x.deleted_at IS NULL) THEN
    RETURN NEW;
  END IF;
  -- Компания-продавец без склада: ролей склада ей не нужно.
  IF NOT (SELECT has_warehouse FROM uklad.orgs WHERE id = NEW.org_id) THEN RETURN NEW; END IF;
  INSERT INTO uklad.roles (org_id, name, permissions, is_default, desk_default, warehouse_ref) VALUES
    (NEW.org_id, 'Начальник склада', ARRAY['staff.view','staff.manage','contracts.manage',
      'plan.view','plan.edit','products.view','products.edit','stock.view','stock.move',
      'receiving.view','receiving.do','picking.view','picking.do','packing.view','packing.do',
      'shipping.view','shipping.do','inventory.view','inventory.count','goods.view',
      'goods.decide','goods.writeoff','chat.use','integrations.manage'], true, false, NEW.ref),
    (NEW.org_id, 'Старший смены', ARRAY['staff.view','plan.view','products.view','stock.view',
      'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
      'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
      'goods.view','goods.decide','chat.use'], true, false, NEW.ref),
    (NEW.org_id, 'Старший участка', ARRAY['plan.view','products.view','stock.view',
      'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
      'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
      'goods.view','goods.decide','chat.use'], true, false, NEW.ref),
    (NEW.org_id, 'Кладовщик / оператор', ARRAY['plan.view','products.view','stock.view',
      'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
      'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
      'goods.view'], true, true, NEW.ref);
  RETURN NEW;
END $$;

CREATE TRIGGER warehouses_roles AFTER INSERT ON uklad.warehouses
  FOR EACH ROW EXECUTE FUNCTION uklad.create_warehouse_roles();

-- Роль человека — его склада (или роль компании). Перевод на другой склад
-- берёт роль с тем же именем там; такой нет — отказ, а не чужая роль.
CREATE FUNCTION uklad.member_role_warehouse() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE v_wh text; v_name text; v_same uuid;
BEGIN
  IF NEW.role_id IS NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT r.warehouse_ref, r.name INTO v_wh, v_name FROM uklad.roles r
  WHERE r.org_id = NEW.org_id AND r.id = NEW.role_id;
  -- Человек без склада (весь кабинет компании, один склад) — не судим.
  IF v_wh IS NULL OR NEW.warehouse_ref IS NULL OR v_wh = NEW.warehouse_ref THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.role_id = OLD.role_id THEN
    SELECT r.id INTO v_same FROM uklad.roles r
    WHERE r.org_id = NEW.org_id AND r.warehouse_ref = NEW.warehouse_ref
      AND r.name = v_name AND r.deleted_at IS NULL LIMIT 1;
    IF v_same IS NOT NULL THEN NEW.role_id := v_same; RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'team:role_warehouse';
END $$;

CREATE TRIGGER members_role_warehouse
  BEFORE INSERT OR UPDATE OF role_id, warehouse_ref ON uklad.members
  FOR EACH ROW EXECUTE FUNCTION uklad.member_role_warehouse();

CREATE FUNCTION uklad.desk_role_warehouse() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE v_wh text; v_staff text;
BEGIN
  IF NEW.role_id IS NULL THEN RETURN NEW; END IF;
  SELECT r.warehouse_ref INTO v_wh FROM uklad.roles r
  WHERE r.org_id = NEW.org_id AND r.id = NEW.role_id;
  IF v_wh IS NULL THEN RETURN NEW; END IF;
  v_staff := uklad.staff_warehouse(NEW.org_id, NEW.staff_ref);
  -- Сотрудника ещё нет в базе (карточка в этой же записи) — не судим.
  IF v_staff IS NULL OR v_staff = v_wh THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'team:role_warehouse';
END $$;

CREATE TRIGGER desk_staff_roles_role_warehouse
  BEFORE INSERT OR UPDATE OF role_id ON uklad.desk_staff_roles
  FOR EACH ROW EXECUTE FUNCTION uklad.desk_role_warehouse();

-- Склад роли — склад вошедшего: руководитель склада трогает только роли своего
-- (как и сервер, база на него не полагается — правило 023). Владельцу и тому,
-- у кого склада нет, — любой.
CREATE FUNCTION auth.assert_role_place(p_warehouse text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_place text := (SELECT warehouse_ref FROM auth.actor_place());
BEGIN
  IF 'org.manage' = ANY (auth.actor_permissions()) OR v_place IS NULL THEN RETURN; END IF;
  IF p_warehouse IS DISTINCT FROM v_place THEN RAISE EXCEPTION 'team:not_found'; END IF;
END $$;

-- Своя роль склада: новая — на складе `p_warehouse`. Стандартные роли склада
-- теперь правятся; роли компании (владелец, продавец) — нет.
CREATE FUNCTION auth.save_role(p_role uuid, p_name text, p_perms text[], p_warehouse text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_id uuid := p_role;
  v_old text[];
  v_default boolean;
  v_name text;
  v_wh text;
BEGIN
  PERFORM auth.assert_staff();
  IF length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'team:bad_name'; END IF;
  -- Название — слова: буквы, пробел, дефис, косая черта, скобки, точка,
  -- запятая. Цифр в названии роли нет (Кирилл 22.11).
  IF trim(p_name) !~ '^[[:alpha:] /().,-]+$' OR trim(p_name) !~ '[[:alpha:]]' THEN
    RAISE EXCEPTION 'team:role_name';
  END IF;
  IF 'org.manage' = ANY (p_perms) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF NOT (p_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF v_id IS NULL THEN
    PERFORM auth.assert_role_place(p_warehouse);
    IF NOT EXISTS (SELECT 1 FROM uklad.warehouses w
                   WHERE w.org_id = uklad.current_org() AND w.ref = p_warehouse
                     AND w.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'team:no_warehouse';
    END IF;
    INSERT INTO uklad.roles (org_id, name, permissions, warehouse_ref)
    VALUES (uklad.current_org(), trim(p_name), p_perms, p_warehouse)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT r.permissions, r.is_default, r.name, r.warehouse_ref INTO v_old, v_default, v_name, v_wh
  FROM uklad.roles r
  WHERE r.id = v_id AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF v_wh IS NOT NULL THEN PERFORM auth.assert_role_place(v_wh); END IF;
  IF uklad.company_role(v_old, v_default, v_name) THEN RAISE EXCEPTION 'team:default_role'; END IF;
  IF NOT (v_old <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m WHERE m.id = auth.actor_member() AND m.role_id = v_id) THEN
    RAISE EXCEPTION 'team:self';
  END IF;
  IF cardinality(p_perms) > 0 AND EXISTS (
    SELECT 1 FROM uklad.members m
    WHERE m.role_id = v_id AND m.org_id = uklad.current_org()
      AND m.partner_ref IS NOT NULL AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'team:role_not_allowed';
  END IF;
  UPDATE uklad.roles SET name = trim(p_name), permissions = p_perms WHERE id = v_id;
  RETURN v_id;
END $$;

-- Удалить роль склада. Сотрудник у стола, которого уже нет ни на одном
-- складе, роль не держит: его хвост снимается. Занята живыми — отказ, а кто
-- держит — скажет сервер (`team.js`).
CREATE OR REPLACE FUNCTION auth.delete_role(p_role uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[]; v_default boolean; v_name text; v_wh text;
BEGIN
  PERFORM auth.assert_staff();
  SELECT r.permissions, r.is_default, r.name, r.warehouse_ref INTO v_perms, v_default, v_name, v_wh
  FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF v_wh IS NOT NULL THEN PERFORM auth.assert_role_place(v_wh); END IF;
  IF uklad.company_role(v_perms, v_default, v_name) THEN RAISE EXCEPTION 'team:default_role'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  DELETE FROM uklad.desk_staff_roles d
  WHERE d.org_id = uklad.current_org() AND d.role_id = p_role
    AND uklad.staff_warehouse(d.org_id, d.staff_ref) IS NULL;
  IF EXISTS (SELECT 1 FROM uklad.members m
             WHERE m.role_id = p_role AND m.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM uklad.desk_staff_roles d
                WHERE d.org_id = uklad.current_org() AND d.role_id = p_role) THEN
    RAISE EXCEPTION 'team:role_in_use';
  END IF;
  UPDATE uklad.roles SET deleted_at = now() WHERE id = p_role;
END $$;

REVOKE EXECUTE ON FUNCTION auth.assert_role_place(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION auth.save_role(uuid, text, text[], text),
  uklad.staff_warehouse(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.save_role(uuid, text, text[], text),
  uklad.staff_warehouse(uuid, text) TO uklad_app;
GRANT EXECUTE ON FUNCTION uklad.company_role(text[], boolean, text),
  uklad.only_warehouse(uuid) TO uklad_app;

ALTER TABLE uklad.staff FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_staff_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.members FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;
