-- Компании, роли, сотрудники (data-architecture.md, разделы 1, 3, 4).
--
-- Человек живёт внутри своей компании: карточка сотрудника (`members`) с
-- именем и фото лежит в базе компании. Вход (`auth.accounts`) — отдельно, и
-- у сотрудника склада его может не быть вовсе: он входит по QR-бейджу.
-- Рабочие записи ссылаются на `members.id`, имён в них нет.

CREATE TABLE uklad.orgs (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  -- У компании владелец — она сама. Колонка нужна, чтобы правило «в каждой
  -- таблице есть org_id» не знало исключений.
  org_id uuid GENERATED ALWAYS AS (id) STORED NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  -- Ветки компании: склад, селлер или обе (свой склад продавца).
  has_warehouse boolean NOT NULL DEFAULT false,
  has_seller boolean NOT NULL DEFAULT false,
  -- Шаблон демо: один на всех, правки посетителя остаются в его браузере.
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (has_warehouse OR has_seller)
);

-- Справочник прав. Роль — набор этих кодов, а не строка вроде "admin":
-- склад собирает свою роль («старший смены») из тех же прав.
CREATE TABLE uklad.permissions (
  code text PRIMARY KEY,
  title text NOT NULL
);
INSERT INTO uklad.permissions (code, title) VALUES
  ('org.manage', 'Компания: настройки, оплата, удаление'),
  ('billing.view', 'Счета и оплата'),
  ('staff.manage', 'Сотрудники и роли'),
  ('contracts.manage', 'Договоры склад ↔ селлер'),
  ('plan.edit', 'План склада'),
  ('products.edit', 'Товары'),
  ('stock.view', 'Остатки'),
  ('stock.move', 'Перемещение товара'),
  ('receiving.do', 'Приёмка'),
  ('picking.do', 'Сборка'),
  ('packing.do', 'Упаковка'),
  ('shipping.do', 'Отгрузка'),
  ('seller.requests', 'Заявки и поставки селлера'),
  ('chat.use', 'Чат');

CREATE TABLE uklad.roles (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  permissions text[] NOT NULL DEFAULT '{}',
  -- Роль из набора по умолчанию: её можно переименовать, но не стереть.
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);

-- Массив нельзя связать внешним ключом, поэтому коды прав сверяет триггер:
-- опечатка в коде права иначе молча дала бы роль без права.
CREATE FUNCTION uklad.check_role_permissions() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE bad text;
BEGIN
  SELECT p INTO bad FROM unnest(NEW.permissions) AS p
  WHERE p NOT IN (SELECT code FROM uklad.permissions) LIMIT 1;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'unknown permission: %', bad USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER roles_check_permissions BEFORE INSERT OR UPDATE OF permissions ON uklad.roles
  FOR EACH ROW EXECUTE FUNCTION uklad.check_role_permissions();

-- Новая компания сразу получает роли по умолчанию под свои ветки.
CREATE FUNCTION uklad.create_default_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO uklad.roles (org_id, name, permissions, is_default)
  SELECT NEW.id, 'Владелец', array_agg(code), true FROM uklad.permissions;
  IF NEW.has_warehouse THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Начальник склада', ARRAY['staff.manage','contracts.manage','plan.edit','products.edit',
        'stock.view','stock.move','receiving.do','picking.do','packing.do','shipping.do','chat.use'], true),
      (NEW.id, 'Кладовщик', ARRAY['stock.view','stock.move','receiving.do','picking.do','packing.do','shipping.do'], true),
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
CREATE TRIGGER orgs_default_roles AFTER INSERT ON uklad.orgs
  FOR EACH ROW EXECUTE FUNCTION uklad.create_default_roles();

-- Вход по почте и паролю. Таблица не в схеме `uklad` и роли приложения не
-- доступна: читать её будет только функция входа.
CREATE TABLE auth.accounts (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND position('@' IN email) > 1),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);

CREATE TABLE uklad.members (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Нет у тех, кто входит только по бейджу.
  account_id uuid REFERENCES auth.accounts (id),
  role_id uuid NOT NULL,
  -- Имя и фото — только здесь. Стёрли по просьбе человека — история склада
  -- цела, вместо имени «Удалённый сотрудник».
  display_name text CHECK (length(display_name) <= 200),
  photo_url text,
  -- Пять статусов текучки (раздел 4): приглашён → активен ⇄ спит,
  -- приглашение истекло, отключён руководителем.
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'sleeping', 'expired', 'disabled')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  -- Составной ключ: роль чужой компании назначить нельзя (5а, правило 5).
  FOREIGN KEY (org_id, role_id) REFERENCES uklad.roles (org_id, id)
);
-- Один человек — одна карточка в компании.
CREATE UNIQUE INDEX members_account_once ON uklad.members (org_id, account_id)
  WHERE account_id IS NOT NULL;

-- RLS: своя компания — и только она. Политики разделены на чтение и запись,
-- потому что дальше (003) чтение расширится партнёрами по договору, а запись нет.
ALTER TABLE uklad.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.orgs FORCE ROW LEVEL SECURITY;
CREATE POLICY orgs_own_read ON uklad.orgs FOR SELECT USING (id = uklad.current_org());
CREATE POLICY orgs_own_insert ON uklad.orgs FOR INSERT WITH CHECK (id = uklad.current_org());
CREATE POLICY orgs_own_update ON uklad.orgs FOR UPDATE
  USING (id = uklad.current_org()) WITH CHECK (id = uklad.current_org());

ALTER TABLE uklad.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_own ON uklad.roles
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

ALTER TABLE uklad.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.members FORCE ROW LEVEL SECURITY;
CREATE POLICY members_own ON uklad.members
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

-- Права роли приложения. DELETE нет нигде: «удалить» — это `deleted_at`,
-- корзина 30 дней (раздел 5, п.1).
GRANT SELECT ON uklad.permissions TO uklad_app;
GRANT SELECT, INSERT, UPDATE ON uklad.orgs, uklad.roles, uklad.members TO uklad_app;
