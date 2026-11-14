-- Права по разделам: у каждого раздела «смотреть» и «делать».
--
-- Кирилл 14.11: «чтение, чтение и запись — в этом суть прав». До этого
-- «смотреть» было одно на весь кабинет (`stock.view` открывал снимок для
-- просмотра целиком), а «делать» — по работам. На экране ролей разделы
-- выходили «выборочно», а чтение раздела ничего не значило.
--
-- Теперь у раздела своё право чтения. Сервер отдаёт смотрящему работу только
-- тех разделов, что ему открыты (`viewer.js`), а кабинет прячет закрытые
-- экраны. «Делать» без «смотреть» не бывает: сохранение роли на экране
-- добавляет чтение само, а уже заведённым ролям — эта миграция.
--
-- Чат, кабинет продавца и списание отдельного чтения не получают: читать чат
-- и не отвечать незачем, а смотреть списания — это чтение спорного товара.
-- «Счета и оплата» (`billing.view`) остаётся чтением договоров и счетов.

INSERT INTO uklad.permissions (code, title) VALUES
  ('products.view', 'Товары: смотреть'),
  ('plan.view', 'План склада: смотреть'),
  ('receiving.view', 'Приёмка: смотреть'),
  ('picking.view', 'Сборка: смотреть'),
  ('packing.view', 'Упаковка: смотреть'),
  ('shipping.view', 'Отгрузка: смотреть'),
  ('inventory.view', 'Инвентаризация: смотреть'),
  ('goods.view', 'Спорный товар: смотреть'),
  ('staff.view', 'Персонал: смотреть')
ON CONFLICT (code) DO NOTHING;
UPDATE uklad.permissions SET title = 'Остатки: смотреть' WHERE code = 'stock.view';

-- «Делать» без «смотреть» не бывает: функция добавляет чтение к каждому
-- «делать». Ею же сервер приводит роль при сохранении (`team.js`).
CREATE OR REPLACE FUNCTION uklad.with_view_perms(p text[]) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY(SELECT DISTINCT x FROM unnest(
    p
    -- «Делать» без «смотреть» — добавить «смотреть».
    || CASE WHEN 'products.edit' = ANY (p) THEN ARRAY['products.view'] ELSE '{}' END
    || CASE WHEN 'stock.move' = ANY (p) THEN ARRAY['stock.view'] ELSE '{}' END
    || CASE WHEN 'plan.edit' = ANY (p) THEN ARRAY['plan.view'] ELSE '{}' END
    || CASE WHEN 'receiving.do' = ANY (p) THEN ARRAY['receiving.view'] ELSE '{}' END
    || CASE WHEN 'picking.do' = ANY (p) THEN ARRAY['picking.view'] ELSE '{}' END
    || CASE WHEN 'packing.do' = ANY (p) THEN ARRAY['packing.view'] ELSE '{}' END
    || CASE WHEN 'shipping.do' = ANY (p) THEN ARRAY['shipping.view'] ELSE '{}' END
    || CASE WHEN 'inventory.count' = ANY (p) THEN ARRAY['inventory.view'] ELSE '{}' END
    || CASE WHEN 'goods.decide' = ANY (p) THEN ARRAY['goods.view'] ELSE '{}' END
    || CASE WHEN 'staff.manage' = ANY (p) THEN ARRAY['staff.view'] ELSE '{}' END
  ) AS x ORDER BY x)
$$;

ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
-- Владелец — все права.
UPDATE uklad.roles SET permissions = (SELECT array_agg(code ORDER BY code) FROM uklad.permissions)
  WHERE 'org.manage' = ANY (permissions);
-- Остальные: «смотреть» к каждому «делать». Раньше `stock.view` открывал на
-- просмотр весь склад: роль с ним ничего не теряет, руководитель потом закроет
-- лишнее на экране. У продавца (`seller.requests`) остатки — свои, склада он
-- так не видит.
UPDATE uklad.roles SET permissions = uklad.with_view_perms(permissions)
  WHERE NOT ('org.manage' = ANY (permissions));
UPDATE uklad.roles SET permissions = ARRAY(SELECT DISTINCT x FROM unnest(permissions || ARRAY[
    'products.view','plan.view','receiving.view','picking.view','packing.view','shipping.view',
    'inventory.view','goods.view']) AS x ORDER BY x)
  WHERE 'stock.view' = ANY (permissions)
    AND NOT (permissions && ARRAY['org.manage','seller.requests']);
-- Стандартные роли рабочих склада сужаем до своего (узнаём по правам, а не по
-- имени — их могли переименовать): сборщику — сборка, а не весь склад.
UPDATE uklad.roles SET permissions = ARRAY['products.view','stock.view','plan.view',
    'receiving.view','receiving.do']
  WHERE is_default AND permissions @> ARRAY['receiving.do'] AND NOT (permissions && ARRAY[
    'picking.do','packing.do','shipping.do','stock.move','staff.manage','org.manage']);
UPDATE uklad.roles SET permissions = ARRAY['products.view','stock.view','plan.view',
    'picking.view','picking.do']
  WHERE is_default AND permissions @> ARRAY['picking.do'] AND NOT (permissions && ARRAY[
    'receiving.do','packing.do','shipping.do','stock.move','staff.manage','org.manage']);
UPDATE uklad.roles SET permissions = ARRAY['products.view','stock.view',
    'packing.view','packing.do']
  WHERE is_default AND permissions @> ARRAY['packing.do'] AND NOT (permissions && ARRAY[
    'receiving.do','picking.do','shipping.do','stock.move','staff.manage','org.manage']);
-- Старший смены видит персонал: печатает бейдж потерявшему, смотрит смены.
UPDATE uklad.roles SET permissions = uklad.with_view_perms(permissions) || ARRAY['staff.view']
  WHERE is_default AND 'goods.decide' = ANY (permissions)
    AND NOT (permissions && ARRAY['staff.manage','org.manage'])
    AND NOT ('staff.view' = ANY (permissions));
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
        'goods.decide','goods.writeoff','chat.use'], true),
      (NEW.id, 'Старший смены', ARRAY['staff.view','plan.view','products.view','stock.view',
        'stock.move','receiving.view','receiving.do','picking.view','picking.do','packing.view',
        'packing.do','shipping.view','shipping.do','inventory.view','inventory.count',
        'goods.view','goods.decide','chat.use'], true),
      (NEW.id, 'Кладовщик', ARRAY['plan.view','products.view','stock.view','stock.move',
        'receiving.view','receiving.do','picking.view','picking.do','packing.view','packing.do',
        'shipping.view','shipping.do','inventory.view','inventory.count','goods.view'], true),
      (NEW.id, 'Приёмщик', ARRAY['products.view','stock.view','plan.view','receiving.view',
        'receiving.do'], true),
      (NEW.id, 'Сборщик', ARRAY['products.view','stock.view','plan.view','picking.view',
        'picking.do'], true),
      (NEW.id, 'Упаковщик', ARRAY['products.view','stock.view','packing.view','packing.do'], true);
  END IF;
  IF NEW.has_seller THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Менеджер селлера', ARRAY['products.view','products.edit','stock.view',
        'seller.requests','chat.use'], true);
  END IF;
  RETURN NEW;
END $$;
