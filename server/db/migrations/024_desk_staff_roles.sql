-- Права у стола — по роли, а не по должности.
--
-- До этого сервер решал «старший или нет» по тексту должности в снимке
-- («старш», «бригадир», «начальник»…): переименовал должность — получил
-- право списывать. Теперь у сотрудника стола (строка `warehouse.staff`,
-- вход по бейджу) есть роль из той же модели прав, что у входа по почте
-- (миграции 002, 023), и стол спрашивает права роли.
--
-- Без назначенной роли у стола работают как раньше, но решений по товару
-- (списание, брак, недостача, излишек) не принимает никто, пока руководитель
-- не назначит роль. Так безопаснее, чем угадывать по должности.

INSERT INTO uklad.permissions (code, title) VALUES
  ('goods.decide', 'Решения по товару: брак, недостача, списание');

-- Новое право — владельцу и начальнику склада в уже заведённых компаниях
-- (роли по умолчанию с `staff.manage`; имя роли могли переименовать).
-- Роли закрыты RLS даже от владельца таблиц (FORCE): на время правки защита
-- снята, как в 013.
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
UPDATE uklad.roles SET permissions = permissions || ARRAY['goods.decide']
WHERE is_default AND 'staff.manage' = ANY (permissions)
  AND NOT ('goods.decide' = ANY (permissions));
ALTER TABLE uklad.roles FORCE ROW LEVEL SECURITY;

-- И в новых компаниях: начальник склада получает его сразу (владелец — и так
-- все права через array_agg).
CREATE OR REPLACE FUNCTION uklad.create_default_roles() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO uklad.roles (org_id, name, permissions, is_default)
  SELECT NEW.id, 'Владелец', array_agg(code), true FROM uklad.permissions;
  IF NEW.has_warehouse THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Начальник склада', ARRAY['staff.manage','contracts.manage','plan.edit','products.edit',
        'stock.view','stock.move','receiving.do','picking.do','packing.do','shipping.do','chat.use',
        'goods.decide'], true),
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

-- Роль сотрудника стола. Ключ — id строки персонала в снимке (`staff_ref`,
-- как у бейджа в 010): персонал пока живёт в снимке. Строк не удаляем:
-- «снять роль» — `role_id = NULL`.
CREATE TABLE uklad.desk_staff_roles (
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  staff_ref text NOT NULL CHECK (length(staff_ref) BETWEEN 1 AND 100),
  role_id uuid,
  set_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, staff_ref),
  FOREIGN KEY (org_id, role_id) REFERENCES uklad.roles (org_id, id)
);
ALTER TABLE uklad.desk_staff_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.desk_staff_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY desk_staff_roles_own ON uklad.desk_staff_roles
  USING (org_id = uklad.current_org()) WITH CHECK (org_id = uklad.current_org());
-- Читают стол и руководитель; пишет только функция ниже.
GRANT SELECT ON uklad.desk_staff_roles TO uklad_app;

-- Назначить роль сотруднику стола: те же правила, что в 023 — право
-- `staff.manage`, и роль не выше своих прав. Роль `null` снимает назначение;
-- снять или сменить роль выше своей тоже нельзя.
CREATE FUNCTION auth.set_desk_staff_role(p_staff_ref text, p_role uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[]; v_old text[];
BEGIN
  PERFORM auth.assert_staff();
  IF p_staff_ref IS NULL OR length(p_staff_ref) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'team:not_found';
  END IF;
  SELECT r.permissions INTO v_old FROM uklad.desk_staff_roles d
  JOIN uklad.roles r ON r.org_id = d.org_id AND r.id = d.role_id
  WHERE d.org_id = uklad.current_org() AND d.staff_ref = p_staff_ref;
  IF FOUND AND NOT (v_old <@ auth.actor_permissions()) THEN
    RAISE EXCEPTION 'team:role_not_allowed';
  END IF;
  IF p_role IS NOT NULL THEN
    SELECT r.permissions INTO v_perms FROM uklad.roles r
    WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
    IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  END IF;
  INSERT INTO uklad.desk_staff_roles (org_id, staff_ref, role_id, set_by)
  VALUES (uklad.current_org(), p_staff_ref, p_role, auth.actor_member())
  ON CONFLICT (org_id, staff_ref)
  DO UPDATE SET role_id = EXCLUDED.role_id, set_by = EXCLUDED.set_by, updated_at = now();
  -- Копия кода могла остаться у того, кто выпускал бейдж. Новая роль не
  -- должна достаться ему через неё: гаснет живой бейдж, если у выпустившего
  -- (или он уже отключён) нет всех прав новой роли. Бейдж от владельца или
  -- равного остаётся, остальным перевыпустит тот, кто повысил.
  IF p_role IS NOT NULL THEN
    UPDATE uklad.desk_badges b SET revoked_at = now(), revoked_by = auth.actor_member()
    WHERE b.org_id = uklad.current_org() AND b.staff_ref = p_staff_ref AND b.revoked_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM uklad.members m
        JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
        WHERE m.org_id = b.org_id AND m.id = b.issued_by
          AND m.deleted_at IS NULL AND m.status <> 'disabled'
          AND v_perms <@ r.permissions
      );
  END IF;
END $$;

-- Роль, которую носит сотрудник стола, не удалить — как и роль члена команды.
CREATE OR REPLACE FUNCTION auth.delete_role(p_role uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[]; v_default boolean;
BEGIN
  PERFORM auth.assert_staff();
  SELECT r.permissions, r.is_default INTO v_perms, v_default FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF v_default THEN RAISE EXCEPTION 'team:default_role'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m
             WHERE m.role_id = p_role AND m.deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM uklad.desk_staff_roles d
                WHERE d.org_id = uklad.current_org() AND d.role_id = p_role) THEN
    RAISE EXCEPTION 'team:role_in_use';
  END IF;
  UPDATE uklad.roles SET deleted_at = now() WHERE id = p_role;
END $$;

-- Бейдж — это вход за стол с правами роли строки. Выпустить или погасить
-- его может только тот, у кого все права этой роли: иначе руководитель без
-- `goods.decide` выпустил бы себе бейдж на строку начальника и списывал бы
-- за столом, а один человек с двумя бейджами обошёл бы «четыре глаза».
CREATE FUNCTION auth.may_badge(p_staff_ref text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM uklad.desk_staff_roles d
    JOIN uklad.roles r ON r.org_id = d.org_id AND r.id = d.role_id
    WHERE d.org_id = uklad.current_org() AND d.staff_ref = p_staff_ref
      AND NOT (r.permissions <@ auth.actor_permissions())
  )
$$;

-- Права сотрудников стола одним запросом: `staff_ref → права`. Удалённая
-- роль прав не даёт.
CREATE FUNCTION uklad.desk_staff_permissions(p_refs text[])
RETURNS TABLE (staff_ref text, permissions text[])
LANGUAGE sql STABLE AS $$
  SELECT d.staff_ref, r.permissions FROM uklad.desk_staff_roles d
  JOIN uklad.roles r ON r.org_id = d.org_id AND r.id = d.role_id AND r.deleted_at IS NULL
  WHERE d.org_id = uklad.current_org() AND d.staff_ref = ANY (p_refs)
$$;

REVOKE EXECUTE ON FUNCTION auth.set_desk_staff_role(text, uuid), auth.may_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.set_desk_staff_role(text, uuid), auth.may_badge(text) TO uklad_app;
GRANT EXECUTE ON FUNCTION uklad.desk_staff_permissions(text[]) TO uklad_app;
