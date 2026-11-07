-- Работа склада строками (ADR 0010, «Потолок снимка»). Заявки, поставки,
-- приёмка, тара, рейсы, задания, спорное, документы, короба отгрузки и
-- журнал смен растут с каждым заказом; в документе компании они упирались
-- в лимит записи через недели работы. Теперь каждая запись — своя строка,
-- а в документе на её месте остаётся метка `{"$rows": n}`
-- (`server/api/src/cabinet/records.js`). Сервер собирает документ обратно
-- при чтении: кабинет получает тот же JSON, что прислал.
--
-- Данные не переносятся: старый документ читается как есть и раскладывается
-- при первой записи.

CREATE TABLE uklad.cabinet_records (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Склад кабинета (`warehouse.id`); пустая строка — список всей компании
  -- (журнал смен).
  warehouse_ref text NOT NULL CHECK (length(warehouse_ref) <= 200),
  -- Какой список: `requests`, `staffEvents`… Набор решает сервер.
  domain text NOT NULL CHECK (domain ~ '^[A-Za-z]{1,40}$'),
  -- id записи в кабинете.
  ref text NOT NULL CHECK (length(ref) BETWEEN 1 AND 200),
  -- Место в списке кабинета.
  position integer NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Корзина: пропавшая из списка запись не удаляется.
  deleted_at timestamptz,
  PRIMARY KEY (org_id, warehouse_ref, domain, ref)
);
CREATE INDEX cabinet_records_live ON uklad.cabinet_records (org_id, warehouse_ref, domain, position)
  WHERE deleted_at IS NULL;

ALTER TABLE uklad.cabinet_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.cabinet_records FORCE ROW LEVEL SECURITY;
CREATE POLICY cabinet_records_own ON uklad.cabinet_records
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
GRANT SELECT, INSERT, UPDATE ON uklad.cabinet_records TO uklad_app;

-- Удаление компании (миграция 009) стирает её снимок — вместе с ним уходят
-- и строки: в них адреса получателей и журнал смен. FORCE действует и на
-- владельца, поэтому компания для политики ставится явно (на случай, если
-- снимок стирают без неё), а прежняя возвращается.
CREATE FUNCTION uklad.drop_cabinet_records() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  was text := current_setting('app.org_id', true);
BEGIN
  PERFORM set_config('app.org_id', OLD.org_id::text, true);
  DELETE FROM uklad.cabinet_records WHERE org_id = OLD.org_id;
  PERFORM set_config('app.org_id', coalesce(was, ''), true);
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION uklad.drop_cabinet_records() FROM PUBLIC;
CREATE TRIGGER cabinet_records_drop AFTER DELETE ON uklad.cabinet_snapshots
  FOR EACH ROW EXECUTE FUNCTION uklad.drop_cabinet_records();
