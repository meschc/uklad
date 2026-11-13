-- Списание подтверждает начальник склада.
--
-- Кирилл 13.11: «списание контролирует начальник склада, то есть старший
-- может списать, но начальник должен подтверждать подобный класс действий».
-- До этого списание проходило по общему праву решений по товару
-- (`goods.decide`, 024) и правилу четырёх глаз: нашёл один, списал другой.
-- Второй глаз мог быть таким же старшим смены.
--
-- Теперь у списания своё право `goods.writeoff`. Кто решает по товару, но
-- без него, — списание только просит: спорное ждёт подтверждения
-- (`writeOffRequest` в строке спорного). Подтверждает тот, у кого право есть,
-- и не тот, кто просил (`server/api/src/cabinet/deskShip.js`).
INSERT INTO uklad.permissions (code, title) VALUES
  ('goods.writeoff', 'Списание товара: подтверждение');

-- Уже заведённые роли по умолчанию: владелец и начальник склада (по правам,
-- не по имени — роль могли переименовать; как в 024–025).
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
UPDATE uklad.roles SET permissions = permissions || ARRAY['goods.writeoff']
  WHERE is_default
    AND ('org.manage' = ANY (permissions) OR 'staff.manage' = ANY (permissions))
    AND NOT ('goods.writeoff' = ANY (permissions));
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION uklad.create_default_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO uklad.roles (org_id, name, permissions, is_default)
  SELECT NEW.id, 'Владелец', array_agg(code), true FROM uklad.permissions;
  IF NEW.has_warehouse THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Начальник склада', ARRAY['staff.manage','contracts.manage','plan.edit','products.edit',
        'stock.view','stock.move','receiving.do','picking.do','packing.do','shipping.do','chat.use',
        'goods.decide','goods.writeoff','inventory.count'], true),
      (NEW.id, 'Кладовщик', ARRAY['stock.view','stock.move','receiving.do','picking.do','packing.do',
        'shipping.do','inventory.count'], true),
      (NEW.id, 'Приёмщик', ARRAY['stock.view','receiving.do'], true),
      (NEW.id, 'Сборщик', ARRAY['stock.view','picking.do'], true),
      (NEW.id, 'Упаковщик', ARRAY['stock.view','packing.do'], true);
  END IF;
  IF NEW.has_seller THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Менеджер селлера', ARRAY['products.edit','stock.view','seller.requests','chat.use'], true);
  END IF;
  RETURN NEW;
END $$;
