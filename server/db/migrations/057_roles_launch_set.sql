-- Набор ролей по умолчанию к запуску (Кирилл 22.11).
--
-- Было девять шаблонов, часть из них — должности, а не права: «Приёмщик»,
-- «Сборщик», «Упаковщик» отличались только тем, какой стол им открыт, а
-- участок человека и так меняется сам по журналу. Остаётся:
--
--   Владелец             — один, у того, кто завёл компанию; другому его не
--                          дать (передача владения — через поддержку).
--   Начальник склада     — всё, кроме удаления склада, компании и владельца.
--   Старший смены        — операции, решения по товару, персонал на чтение.
--   Старший участка      — новая: операции и решения по товару, без персонала
--                          и выработки.
--   Кладовщик / оператор — работа с товаром без решений.
--   Продавец             — без прав (039); «Менеджер селлера» теперь тоже
--                          «Продавец».
--
-- Убранные шаблоны остаются там, где их уже дали человеку или сотруднику у
-- стола: снять роль молча значило бы оставить человека без прав. Где роль
-- никому не дана — она гаснет (`deleted_at`), как удалённая своя роль.

-- Роли, люди и роли у стола под RLS; владельцу миграций их видно, пока снят FORCE.
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_staff_roles NO FORCE ROW LEVEL SECURITY;

-- «Менеджер селлера» → «Продавец». Где «Продавец» уже есть (у компании и
-- склад, и продавец), имя не трогаем: двух ролей с одним именем быть не должно.
UPDATE uklad.roles r SET name = 'Продавец'
WHERE r.is_default AND r.deleted_at IS NULL AND r.name = 'Менеджер селлера'
  AND NOT EXISTS (
    SELECT 1 FROM uklad.roles x
    WHERE x.org_id = r.org_id AND x.name = 'Продавец' AND x.deleted_at IS NULL
  );

UPDATE uklad.roles SET name = 'Кладовщик / оператор'
WHERE is_default AND deleted_at IS NULL AND name = 'Кладовщик';

-- «Старший участка» уже заведённым складам. Склад узнаём, как в 032 и 039, по
-- начальнику склада по умолчанию.
INSERT INTO uklad.roles (org_id, name, permissions, is_default)
SELECT DISTINCT r.org_id, 'Старший участка', ARRAY['plan.view','products.view','stock.view',
  'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
  'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
  'goods.view','goods.decide','chat.use'], true
FROM uklad.roles r
WHERE r.is_default AND r.deleted_at IS NULL
  AND 'staff.manage' = ANY (r.permissions) AND NOT ('org.manage' = ANY (r.permissions))
  AND NOT EXISTS (
    SELECT 1 FROM uklad.roles x
    WHERE x.org_id = r.org_id AND x.name = 'Старший участка' AND x.deleted_at IS NULL
  );

-- Убранные шаблоны, которые никому не даны, гаснут.
UPDATE uklad.roles r SET deleted_at = now()
WHERE r.is_default AND r.deleted_at IS NULL AND r.name IN ('Приёмщик', 'Сборщик', 'Упаковщик')
  AND NOT EXISTS (
    SELECT 1 FROM uklad.members m
    WHERE m.org_id = r.org_id AND m.role_id = r.id AND m.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM uklad.desk_staff_roles d WHERE d.org_id = r.org_id AND d.role_id = r.id
  );

ALTER TABLE uklad.desk_staff_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.members FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;

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
  RETURN NEW;
END $$;

-- Роль владельца (`org.manage`) из кабинета не дать никому: ни приглашением,
-- ни сменой роли, ни ролью у стола. Раньше владелец мог сделать владельцем
-- другого — и тот снял бы его самого. Правило — триггером на строках, а не в
-- каждой функции: новый путь к роли его не обойдёт. Без вошедшего
-- (`app.member_id` пуст) — это регистрация компании или поддержка.
CREATE FUNCTION uklad.owner_role_locked() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, auth, pg_temp AS $$
BEGIN
  IF NEW.role_id IS NULL OR auth.actor_member() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.role_id IS NOT DISTINCT FROM OLD.role_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM uklad.roles r
             WHERE r.id = NEW.role_id AND r.org_id = NEW.org_id
               AND 'org.manage' = ANY (r.permissions)) THEN
    RAISE EXCEPTION 'team:owner_role';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER members_owner_role_locked
  BEFORE INSERT OR UPDATE OF role_id ON uklad.members
  FOR EACH ROW EXECUTE FUNCTION uklad.owner_role_locked();
CREATE TRIGGER desk_staff_roles_owner_role_locked
  BEFORE INSERT OR UPDATE OF role_id ON uklad.desk_staff_roles
  FOR EACH ROW EXECUTE FUNCTION uklad.owner_role_locked();
