-- Человек компании — всегда на складе (Кирилл 24.11: «как человек будет не
-- закреплён ни за каким складом, если приглашение из конкретного склада?»).
--
-- Было: приглашение без `warehouse_ref` проходило (034), и такой человек
-- работал, пока склад в компании один (`placeRef`). Завёл владелец второй
-- склад — человек получал «склад не назначен» на каждом экране, а в «Доступе»
-- висел блок «Не закреплены». Теперь склад обязателен всем, кроме владельца
-- (`org.manage`, роль компании): API не пускает приглашение без склада
-- (`team.js`, `invite`), а записи без склада здесь переводятся на склад.
--
-- Удалили склад — его люди отключаются сразу (`status = 'disabled'`): вход
-- паролем и бейджем гаснет (`auth.can_enter`), ссылки приглашений и бейджи
-- отзываются, как у `auth.set_member_disabled`. Раньше они оставались
-- «живыми» людьми несуществующего склада: входили и упирались в отказ.
-- Вернувшийся из удалённых склад людей обратно не включает — это делает
-- владелец в «Доступе», осознанно.

ALTER TABLE uklad.members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;

-- Старые записи без склада: склад их роли (058), иначе первый живой склад
-- компании. Живых компаний до запуска нет, это тестовые строки staging.
-- На живых данных так не переносить («Безопасность продукта» 24.11): первый
-- склад даёт человеку доступ, которого ему не выдавали; там — отключить и
-- попросить владельца назначить склад.
UPDATE uklad.members m SET warehouse_ref = coalesce(
  (SELECT r.warehouse_ref FROM uklad.roles r WHERE r.org_id = m.org_id AND r.id = m.role_id),
  (SELECT w.ref FROM uklad.warehouses w
   WHERE w.org_id = m.org_id AND w.deleted_at IS NULL AND w.card IS NOT NULL AND NOT w.placeholder
   ORDER BY w.position, w.ref LIMIT 1))
WHERE m.warehouse_ref IS NULL AND m.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM uklad.roles r
                  WHERE r.org_id = m.org_id AND r.id = m.role_id
                    AND 'org.manage' = ANY (r.permissions));

-- Люди уже удалённых складов — отключить.
UPDATE uklad.members m SET status = 'disabled'
FROM uklad.warehouses w
WHERE w.org_id = m.org_id AND w.ref = m.warehouse_ref AND w.deleted_at IS NOT NULL
  AND m.deleted_at IS NULL AND m.status <> 'disabled';

ALTER TABLE uklad.members FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.warehouses FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;

-- Склад удалён — его люди отключены. Владелец (роль компании, без склада)
-- сюда не попадает.
CREATE FUNCTION uklad.warehouse_members_gone() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, auth, pg_temp AS $$
DECLARE
  gone uuid[];
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    WITH off AS (
      UPDATE uklad.members SET status = 'disabled'
      WHERE org_id = NEW.org_id AND warehouse_ref = NEW.ref
        AND deleted_at IS NULL AND status <> 'disabled'
      RETURNING id
    )
    SELECT coalesce(array_agg(id), '{}') INTO gone FROM off;
    IF cardinality(gone) = 0 THEN RETURN NEW; END IF;
    UPDATE auth.invitations SET revoked_at = now()
    WHERE accepted_at IS NULL AND revoked_at IS NULL
      AND (member_id = ANY (gone) OR invited_by = ANY (gone));
    UPDATE auth.badges SET revoked_at = now()
    WHERE revoked_at IS NULL AND member_id = ANY (gone);
    UPDATE auth.sessions SET revoked_at = now()
    WHERE revoked_at IS NULL AND member_id = ANY (gone);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER warehouse_members_gone AFTER UPDATE OF deleted_at ON uklad.warehouses
  FOR EACH ROW EXECUTE FUNCTION uklad.warehouse_members_gone();
