-- Продавцу — только роль без прав.
--
-- В 039 продавец — человек склада с `partner_ref`, и сервер решает «кто
-- продавец» по нему, а не по роли. Но роль ему можно было сменить в
-- «Доступе»: продавец с ролью «Начальник склада» видел свой снимок
-- по-прежнему узко, а маршруты на права (команда с почтами, хранение всех
-- продавцов, история) отвечали ему 200. Здесь — то же правило, что в
-- `set_member_partner`, в обратную сторону, и строже: у продавца роль без
-- единого права, и закрепить продавцом можно только человека без прав.
-- Второй слой — на сервере (`auth.js`, `sellerMay`): продавцу закрыты все
-- маршруты кабинета, кроме входа и своего снимка.

CREATE OR REPLACE FUNCTION auth.change_role(p_member uuid, p_role uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_perms text[];
BEGIN
  PERFORM auth.assert_may_touch(p_member);
  SELECT r.permissions INTO v_perms FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  -- Продавцу — только роль без прав (045).
  IF cardinality(v_perms) > 0 AND EXISTS (
    SELECT 1 FROM uklad.members m
    WHERE m.id = p_member AND m.org_id = uklad.current_org() AND m.partner_ref IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'team:role_not_allowed';
  END IF;
  UPDATE uklad.members SET role_id = p_role WHERE id = p_member;
  -- Права человека изменились — его неоткрытые приглашения устарели.
  UPDATE auth.invitations SET revoked_at = now()
  WHERE invited_by = p_member AND accepted_at IS NULL AND revoked_at IS NULL;
END $$;

-- Своя роль склада. Права — не больше своих; `org.manage` (владелец) в
-- свою роль не входит. Роли по умолчанию не правятся. Роль, которая стоит у
-- продавца, прав не получает (045).
CREATE OR REPLACE FUNCTION auth.save_role(p_role uuid, p_name text, p_perms text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_id uuid := p_role;
  v_old text[];
  v_default boolean;
BEGIN
  PERFORM auth.assert_staff();
  IF length(trim(p_name)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'team:bad_name'; END IF;
  IF 'org.manage' = ANY (p_perms) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF NOT (p_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO uklad.roles (org_id, name, permissions) VALUES (uklad.current_org(), trim(p_name), p_perms)
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  SELECT r.permissions, r.is_default INTO v_old, v_default FROM uklad.roles r
  WHERE r.id = v_id AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF v_default THEN RAISE EXCEPTION 'team:default_role'; END IF;
  -- Роль с правами выше своих не правят, как и человека.
  IF NOT (v_old <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  -- Свою собственную роль не расширяют и не сужают: иначе можно отрезать себя.
  IF EXISTS (SELECT 1 FROM uklad.members m WHERE m.id = auth.actor_member() AND m.role_id = v_id) THEN
    RAISE EXCEPTION 'team:self';
  END IF;
  IF cardinality(p_perms) > 0 AND EXISTS (
    SELECT 1 FROM uklad.members m
    WHERE m.role_id = v_id AND m.org_id = uklad.current_org()
      AND m.partner_ref IS NOT NULL AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'team:role_not_allowed';
  END IF;
  UPDATE uklad.roles SET name = trim(p_name), permissions = p_perms WHERE id = v_id;
  RETURN v_id;
END $$;

-- Закрепить человека за продавцом или снять закрепление. Закрепить может
-- только тот, кто ведёт договоры (`contracts.manage`), и только человека с
-- ролью без прав: иначе продавец ушёл бы в маршруты склада (045; в 039
-- проверялось только «Персонал»).
CREATE OR REPLACE FUNCTION auth.set_member_partner(p_member uuid, p_partner text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_partner text := nullif(trim(coalesce(p_partner, '')), '');
BEGIN
  PERFORM auth.assert_may_touch(p_member);
  IF v_partner IS NOT NULL THEN
    IF NOT ('contracts.manage' = ANY (auth.actor_permissions())) THEN
      RAISE EXCEPTION 'team:role_not_allowed';
    END IF;
    IF EXISTS (SELECT 1 FROM uklad.members m
               JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
               WHERE m.id = p_member AND m.org_id = uklad.current_org()
                 AND cardinality(r.permissions) > 0) THEN
      RAISE EXCEPTION 'team:role_not_allowed';
    END IF;
    IF (SELECT warehouse_ref FROM uklad.members
        WHERE id = p_member AND org_id = uklad.current_org()) IS NULL THEN
      RAISE EXCEPTION 'team:no_warehouse';
    END IF;
  END IF;
  UPDATE uklad.members SET partner_ref = v_partner
  WHERE id = p_member AND org_id = uklad.current_org();
END $$;
