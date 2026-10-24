-- Склады, договоры склад ↔ селлер, товары, остатки, брони, журнал остатков.
--
-- Главное правило (5а, правило 6): владельца товара назначает склад. Склад
-- сначала заключает договор с селлером, потом отмечает в своих товарах, чьи
-- они (`seller_org_id`). Селлер видит только свой товар и только пока договор
-- активен. Товар без владельца не видит ни один селлер. Это делает база, а не
-- фильтр в экране.

CREATE TABLE uklad.warehouses (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  -- Режимы работы флажками (раздел 1): экран спрашивает «включён ли режим»,
  -- а не «какой тип склада».
  modes text[] NOT NULL DEFAULT '{storage}'
    CHECK (modes <@ ARRAY['storage', 'fbo', 'fbs', 'crossdock', 'own']),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);

CREATE TABLE uklad.contracts (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  -- Владелец записи — склад: он заключает и закрывает договор.
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  warehouse_id uuid NOT NULL,
  seller_org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, warehouse_id) REFERENCES uklad.warehouses (org_id, id),
  -- Со своим же складом договор не нужен (режим own).
  CHECK (seller_org_id <> org_id),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX contracts_one_active ON uklad.contracts (warehouse_id, seller_org_id)
  WHERE status = 'active' AND deleted_at IS NULL;

-- Активен ли договор между складом и селлером. Функция обычная (не SECURITY
-- DEFINER): договоры она видит через их же RLS, то есть только сторона
-- договора может узнать, что он есть.
CREATE FUNCTION uklad.has_active_contract(wh_org uuid, seller uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM uklad.contracts c
    WHERE c.org_id = wh_org AND c.seller_org_id = seller
      AND c.status = 'active' AND c.deleted_at IS NULL)
$$;

CREATE TABLE uklad.products (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  -- Карточку ведёт склад.
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Чей товар. NULL — ещё не назначен, своего селлера у товара нет.
  -- Равен org_id — свой товар склада.
  seller_org_id uuid REFERENCES uklad.orgs (id),
  sku text NOT NULL CHECK (length(sku) BETWEEN 1 AND 100),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id)
);
CREATE UNIQUE INDEX products_sku ON uklad.products (org_id, sku) WHERE deleted_at IS NULL;

CREATE TABLE uklad.stock (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL,
  -- Адрес ячейки в формате кабинета (formatAddress). Таблица ячеек придёт с
  -- модулем плана; пока адрес — строка, как на ярлыке.
  cell text NOT NULL CHECK (length(cell) BETWEEN 1 AND 50),
  qty integer NOT NULL CHECK (qty >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= qty),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, warehouse_id) REFERENCES uklad.warehouses (org_id, id),
  FOREIGN KEY (org_id, product_id) REFERENCES uklad.products (org_id, id)
);

CREATE TABLE uklad.reservations (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  stock_id uuid NOT NULL,
  qty integer NOT NULL CHECK (qty > 0),
  -- Повтор запроса (обрыв связи, двойной клик) с тем же ключом вернёт ту же
  -- бронь, а не вторую.
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 100),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, id),
  UNIQUE (org_id, idempotency_key),
  FOREIGN KEY (org_id, stock_id) REFERENCES uklad.stock (org_id, id)
);

-- Журнал остатков и движений (решение 23.10: на старте журналим только их).
-- Пишет его только триггер; у роли приложения права записи нет.
CREATE TABLE uklad.stock_log (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT', 'UPDATE')),
  old_row jsonb,
  new_row jsonb NOT NULL,
  member_id uuid,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_log_row ON uklad.stock_log (org_id, row_id, at);

-- SECURITY DEFINER: пишет от имени владельца таблиц, поэтому приложению право
-- INSERT в журнал не нужно и подделать запись оно не может. search_path задан
-- жёстко — иначе чужая функция с тем же именем подменила бы нашу.
CREATE FUNCTION uklad.log_stock_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
BEGIN
  INSERT INTO uklad.stock_log (org_id, table_name, row_id, op, old_row, new_row, member_id)
  VALUES (NEW.org_id, TG_TABLE_NAME, NEW.id, TG_OP,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW),
          uklad.current_member());
  RETURN NEW;
END $$;
CREATE TRIGGER stock_log AFTER INSERT OR UPDATE ON uklad.stock
  FOR EACH ROW EXECUTE FUNCTION uklad.log_stock_change();
CREATE TRIGGER reservations_log AFTER INSERT OR UPDATE ON uklad.reservations
  FOR EACH ROW EXECUTE FUNCTION uklad.log_stock_change();

-- Бронь коробки. Одна функция, чтобы порядок «ключ → замок → остаток» нельзя
-- было нарушить в коде модуля: 20 параллельных броней последней штуки дают
-- ровно одну удачную (5а, тест 5).
CREATE FUNCTION uklad.reserve(p_stock uuid, p_qty integer, p_key text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  rid uuid;
  free integer;
BEGIN
  SELECT id INTO rid FROM uklad.reservations
  WHERE org_id = uklad.current_org() AND idempotency_key = p_key;
  IF rid IS NOT NULL THEN RETURN rid; END IF;

  -- Замок на строку остатка: параллельные брони встают в очередь здесь.
  SELECT qty - reserved INTO free FROM uklad.stock
  WHERE org_id = uklad.current_org() AND id = p_stock FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stock not found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Пока ждали замок, тот же ключ мог успеть записать соседний запрос.
  -- Новый запрос в READ COMMITTED видит его — возвращаем ту же бронь.
  SELECT id INTO rid FROM uklad.reservations
  WHERE org_id = uklad.current_org() AND idempotency_key = p_key;
  IF rid IS NOT NULL THEN RETURN rid; END IF;

  IF free < p_qty THEN
    RAISE EXCEPTION 'not enough stock' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE uklad.stock SET reserved = reserved + p_qty, updated_at = now()
  WHERE org_id = uklad.current_org() AND id = p_stock;
  INSERT INTO uklad.reservations (org_id, stock_id, qty, idempotency_key, created_by)
  VALUES (uklad.current_org(), p_stock, p_qty, p_key, uklad.current_member())
  RETURNING id INTO rid;
  RETURN rid;
END $$;

-- ---- RLS ----

-- Партнёр по договору видит название компании-партнёра (только чтение).
CREATE POLICY orgs_partner_read ON uklad.orgs FOR SELECT USING (
  uklad.has_active_contract(id, uklad.current_org())
  OR uklad.has_active_contract(uklad.current_org(), id));

ALTER TABLE uklad.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
CREATE POLICY warehouses_own ON uklad.warehouses
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
-- Селлер видит склады, с которыми у него активный договор.
CREATE POLICY warehouses_seller_read ON uklad.warehouses FOR SELECT USING (
  EXISTS (SELECT 1 FROM uklad.contracts c
          WHERE c.warehouse_id = warehouses.id AND c.seller_org_id = uklad.current_org()
            AND c.status = 'active' AND c.deleted_at IS NULL));

ALTER TABLE uklad.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY contracts_read ON uklad.contracts FOR SELECT
  USING (org_id = uklad.current_org() OR seller_org_id = uklad.current_org());
CREATE POLICY contracts_insert ON uklad.contracts FOR INSERT
  WITH CHECK (org_id = uklad.current_org());
CREATE POLICY contracts_update ON uklad.contracts FOR UPDATE
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

-- Товар: склад видит свои карточки, но товар селлера — только пока с ним
-- активный договор; селлер — только свой товар и только по активному договору.
ALTER TABLE uklad.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.products FORCE ROW LEVEL SECURITY;
CREATE POLICY products_read ON uklad.products FOR SELECT USING (
  (org_id = uklad.current_org()
    AND (seller_org_id IS NULL OR seller_org_id = org_id
         OR uklad.has_active_contract(org_id, seller_org_id)))
  OR (seller_org_id = uklad.current_org()
    AND uklad.has_active_contract(org_id, seller_org_id)));
-- Писать — только склад, и назначить владельцем можно только селлера с
-- активным договором.
CREATE POLICY products_insert ON uklad.products FOR INSERT WITH CHECK (
  org_id = uklad.current_org()
  AND (seller_org_id IS NULL OR seller_org_id = org_id
       OR uklad.has_active_contract(org_id, seller_org_id)));
CREATE POLICY products_update ON uklad.products FOR UPDATE
  USING (org_id = uklad.current_org()
    AND (seller_org_id IS NULL OR seller_org_id = org_id
         OR uklad.has_active_contract(org_id, seller_org_id)))
  WITH CHECK (org_id = uklad.current_org()
    AND (seller_org_id IS NULL OR seller_org_id = org_id
         OR uklad.has_active_contract(org_id, seller_org_id)));

-- Остаток виден тому, кому виден его товар: подзапрос к products идёт через
-- RLS товаров, правило в одном месте.
ALTER TABLE uklad.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.stock FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_read ON uklad.stock FOR SELECT USING (
  EXISTS (SELECT 1 FROM uklad.products p WHERE p.org_id = stock.org_id AND p.id = stock.product_id));
CREATE POLICY stock_insert ON uklad.stock FOR INSERT WITH CHECK (
  org_id = uklad.current_org()
  AND EXISTS (SELECT 1 FROM uklad.products p WHERE p.org_id = stock.org_id AND p.id = stock.product_id));
CREATE POLICY stock_update ON uklad.stock FOR UPDATE
  USING (org_id = uklad.current_org()
    AND EXISTS (SELECT 1 FROM uklad.products p WHERE p.org_id = stock.org_id AND p.id = stock.product_id))
  WITH CHECK (org_id = uklad.current_org());

ALTER TABLE uklad.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY reservations_own ON uklad.reservations
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());

ALTER TABLE uklad.stock_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.stock_log FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_log_read ON uklad.stock_log FOR SELECT USING (org_id = uklad.current_org());
-- Запись — только триггером (он работает от владельца таблиц, а FORCE
-- распространяет RLS и на владельца). Своя компания и здесь.
CREATE POLICY stock_log_write ON uklad.stock_log FOR INSERT WITH CHECK (org_id = uklad.current_org());

GRANT SELECT, INSERT, UPDATE
  ON uklad.warehouses, uklad.contracts, uklad.products, uklad.stock, uklad.reservations
  TO uklad_app;
GRANT SELECT ON uklad.stock_log TO uklad_app;
