-- Инвентаризация операцией: слепой пересчёт тары на полке (`inv_count`,
-- `server/api/src/cabinet/deskInventory.js`). Сервер сам сравнивает счёт с
-- учётом и заводит спорное по расхождению; числа учёта стол не знает.
ALTER TABLE uklad.desk_ops DROP CONSTRAINT desk_ops_kind_check;
ALTER TABLE uklad.desk_ops ADD CONSTRAINT desk_ops_kind_check
  CHECK (kind IN ('shift_mark', 'shift_undo', 'pack_event', 'pack_done', 'pick_unit', 'pick_done',
                  'recv_open', 'recv_unit', 'recv_place', 'recv_attach', 'recv_close',
                  'ship_run', 'dispute_resolve', 'recv_cargo', 'inv_count'));

-- Право пересчитывать (поверх ролей 023–024). Правка учёта по итогам —
-- общее право решений по товару `goods.decide`: отдельного не заводим.
INSERT INTO uklad.permissions (code, title) VALUES
  ('inventory.count', 'Инвентаризация: пересчёт');

-- Уже заведённые роли по умолчанию: владелец, начальник склада и кладовщик считают.
UPDATE uklad.roles SET permissions = permissions || ARRAY['inventory.count']
  WHERE is_default AND name IN ('Владелец', 'Начальник склада', 'Кладовщик')
    AND NOT ('inventory.count' = ANY (permissions));

CREATE OR REPLACE FUNCTION uklad.create_default_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO uklad.roles (org_id, name, permissions, is_default)
  SELECT NEW.id, 'Владелец', array_agg(code), true FROM uklad.permissions;
  IF NEW.has_warehouse THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Начальник склада', ARRAY['staff.manage','contracts.manage','plan.edit','products.edit',
        'stock.view','stock.move','receiving.do','picking.do','packing.do','shipping.do','chat.use',
        'goods.decide','inventory.count'], true),
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
