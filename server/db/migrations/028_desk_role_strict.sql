-- Стол без роли — без прав (Кирилл 13.11: «включи сразу»).
--
-- До этой миграции сотрудник без роли у стола (024) работал как раньше:
-- принимал, собирал, паковал, отгружал и пересчитывал, не решая только
-- спорное. Теперь каждая операция стола требует права роли
-- (`deskOps.js`). Чтобы склады, где роли ещё не назначили, не встали
-- утром, каждому, у кого есть живой бейдж и нет действующей роли,
-- назначаем роль компании по умолчанию «Кладовщик» — ровно то, что он
-- мог до сих пор: вся работа, без решений по товару. Новый бейдж без роли
-- получает её же при выпуске (`deskBadges.js`).

ALTER TABLE uklad.desk_staff_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_badges NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;

INSERT INTO uklad.desk_staff_roles (org_id, staff_ref, role_id, set_by)
SELECT DISTINCT ON (b.org_id, b.staff_ref) b.org_id, b.staff_ref, r.id, NULL::uuid
FROM uklad.desk_badges b
JOIN uklad.roles r
  ON r.org_id = b.org_id AND r.is_default AND r.name = 'Кладовщик' AND r.deleted_at IS NULL
WHERE b.revoked_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM uklad.desk_staff_roles d
    JOIN uklad.roles x ON x.org_id = d.org_id AND x.id = d.role_id AND x.deleted_at IS NULL
    WHERE d.org_id = b.org_id AND d.staff_ref = b.staff_ref
  )
ORDER BY b.org_id, b.staff_ref, r.id
ON CONFLICT (org_id, staff_ref)
DO UPDATE SET role_id = EXCLUDED.role_id, set_by = NULL, updated_at = now();

ALTER TABLE uklad.desk_staff_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_badges FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;
