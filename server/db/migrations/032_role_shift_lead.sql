-- Стандартная роль «Старший смены».
--
-- Кирилл 14.11: «добавляю сотрудника, должность — старший смены, роль у него
-- должна быть как у старшего, а стандартной роли нет». Между начальником
-- склада и кладовщиком не было ступени: старший решает по товару (спорное,
-- брак, недостача — `goods.decide`), но списание только просит, подтверждает
-- начальник (`goods.writeoff`, 030). Персонал и договоры не трогает.
--
-- Уже заведённым складам роль добавляем: склад узнаём по роли начальника
-- склада по умолчанию (по правам, не по имени — её могли переименовать).
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
INSERT INTO uklad.roles (org_id, name, permissions, is_default)
SELECT DISTINCT r.org_id, 'Старший смены',
  ARRAY['stock.view','stock.move','receiving.do','picking.do','packing.do','shipping.do',
    'inventory.count','goods.decide','chat.use'], true
FROM uklad.roles r
WHERE r.is_default AND r.deleted_at IS NULL
  AND 'staff.manage' = ANY (r.permissions) AND NOT ('org.manage' = ANY (r.permissions))
  AND NOT EXISTS (
    SELECT 1 FROM uklad.roles x
    WHERE x.org_id = r.org_id AND x.name = 'Старший смены' AND x.deleted_at IS NULL
  );
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
      (NEW.id, 'Старший смены', ARRAY['stock.view','stock.move','receiving.do','picking.do',
        'packing.do','shipping.do','inventory.count','goods.decide','chat.use'], true),
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
