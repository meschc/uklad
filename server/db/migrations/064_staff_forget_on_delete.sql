-- Удалённый сотрудник забывается сразу (Кирилл 23.11, 152-ФЗ): корзины для
-- личных данных нет. Было: пропавший из списка сотрудник уходил в корзину
-- (`deleted_at`, 054) вместе с именем, телефоном, почтой и фото — бессрочно.
--
-- Теперь при удалении строка остаётся (на неё по `ref` ссылаются журнал
-- смен, операции столов, выработка и бейджи), но без личного: имя пустое, в
-- карточке — только id, должность и ставка. Отчёты за прошлый период
-- сходятся; кабинет удалённых и раньше не показывал по имени.
-- Удаление пишется в журнал действий (`staff.delete`, только id).
--
-- Удалили склад — его сотрудники удаляются с ним: раньше они так и лежали
-- живыми строками удалённого склада.
--
-- Вернуть сотрудника можно, добавив его заново: кабинет пришлёт карточку,
-- `save_staff` поднимет строку из удалённых.

-- Уже лежащее в корзине — обезличить, сотрудников удалённых складов —
-- удалить. До триггеров: журнал действий пишется только под компанией.
-- Живых компаний до запуска нет, это тестовые строки staging.
ALTER TABLE uklad.staff NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
UPDATE uklad.staff s SET deleted_at = now(), updated_at = now()
FROM uklad.warehouses w
WHERE w.org_id = s.org_id AND w.ref = s.warehouse_ref
  AND w.deleted_at IS NOT NULL AND s.deleted_at IS NULL;
UPDATE uklad.staff SET name = NULL,
  card = jsonb_strip_nulls(jsonb_build_object(
    'id', ref, 'role', card->'role', 'hourlyRate', card->'hourlyRate'))
WHERE deleted_at IS NOT NULL;
ALTER TABLE uklad.staff FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;

CREATE FUNCTION uklad.staff_forget() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    NEW.name := NULL;
    NEW.card := jsonb_strip_nulls(jsonb_build_object(
      'id', NEW.ref, 'role', NEW.card->'role', 'hourlyRate', NEW.card->'hourlyRate'));
    INSERT INTO uklad.audit_events (org_id, warehouse_ref, source, action, target)
    VALUES (NEW.org_id, NEW.warehouse_ref,
      CASE WHEN uklad.current_member() IS NULL THEN 'system' ELSE 'cabinet' END,
      'staff.delete', NEW.ref);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER staff_forget BEFORE UPDATE OF deleted_at ON uklad.staff
  FOR EACH ROW EXECUTE FUNCTION uklad.staff_forget();

CREATE FUNCTION uklad.warehouse_staff_gone() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, uklad, pg_temp AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE uklad.staff SET deleted_at = now(), updated_at = now()
    WHERE org_id = NEW.org_id AND warehouse_ref = NEW.ref AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER warehouse_staff_gone AFTER UPDATE OF deleted_at ON uklad.warehouses
  FOR EACH ROW EXECUTE FUNCTION uklad.warehouse_staff_gone();
