-- Подключения к площадкам (WB, Ozon, Яндекс Маркет) через сервер.
--
-- Ключ селлера в браузере не живёт: кабинет отдаёт его серверу один раз, сервер
-- хранит его зашифрованным (AES-256-GCM, ключ шифрования — в окружении
-- `CONNECTOR_SECRET_KEY`, не в базе) и сам ходит к площадке по белому списку
-- путей (`server/api/src/cabinet/connectors.js`). В базе — только шифротекст;
-- копия базы без ключа окружения ключей селлеров не раскрывает.
--
-- Право `integrations.manage`: заводить и удалять подключения и ходить через
-- них к площадке. Владельцу и начальнику склада — сразу.

INSERT INTO uklad.permissions (code, title) VALUES
  ('integrations.manage', 'Интеграции с площадками: подключать и обмениваться')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
UPDATE uklad.roles SET permissions = permissions || ARRAY['integrations.manage']
WHERE NOT ('integrations.manage' = ANY (permissions))
  AND ('org.manage' = ANY (permissions) OR (is_default AND 'staff.manage' = ANY (permissions)));
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

CREATE TABLE uklad.connector_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  system text NOT NULL CHECK (system IN ('wildberries', 'ozon', 'yandex-market')),
  -- Подпись для людей: чей это магазин («ИП Иванов, WB»).
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 100),
  -- Не секретные параметры: Client-Id Ozon, campaignId Маркета.
  params jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(params) = 'object'),
  -- iv (12) | tag (16) | шифротекст. Расшифровка — только в сервере.
  secret bytea NOT NULL CHECK (length(secret) BETWEEN 29 AND 8192),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Корзина: «удалить» — поставить дату; ключ при этом стирается.
  deleted_at timestamptz
);
CREATE INDEX connector_accounts_live ON uklad.connector_accounts (org_id, system)
  WHERE deleted_at IS NULL;

ALTER TABLE uklad.connector_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.connector_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY connector_accounts_own ON uklad.connector_accounts
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
GRANT SELECT, INSERT, UPDATE ON uklad.connector_accounts TO uklad_app;

-- Удаление компании (миграция 009) стирает её снимок — вместе с ним стираются
-- и ключи площадок, как строки кабинета в 021.
CREATE FUNCTION uklad.drop_connector_accounts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', OLD.org_id::text, true);
  DELETE FROM uklad.connector_accounts WHERE org_id = OLD.org_id;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION uklad.drop_connector_accounts() FROM PUBLIC;
CREATE TRIGGER connector_accounts_drop AFTER DELETE ON uklad.cabinet_snapshots
  FOR EACH ROW EXECUTE FUNCTION uklad.drop_connector_accounts();
