-- Продавец входит в кабинет склада по приглашению и видит только своё.
--
-- Кирилл 15.11: «не забудь сделать приглашение для продавца». Продавец — это
-- партнёр склада из кабинета (`warehouse.partners`, товар помечен
-- `partnerId`). Отдельной компании-продавца с договором (002–003) кабинет не
-- заводит, и до запуска не заведёт: кабинет продавца входит в тариф склада.
-- Поэтому продавец — человек в компании склада, закреплённый за складом
-- (`warehouse_ref`, 034) и за партнёром (`partner_ref`).
--
-- Кто продавец, сервер решает по `partner_ref`, а не по роли: роль можно
-- поменять в «Доступе», а партнёр у человека остаётся, и он по-прежнему
-- видит только свой товар (уже, а не шире). Роль «Продавец» без прав: все
-- маршруты, кроме своего снимка, отвечают ему отказом сами.

ALTER TABLE uklad.members
  ADD COLUMN partner_ref text CHECK (length(partner_ref) BETWEEN 1 AND 100);

-- Роль «Продавец» уже заведённым складам и новым. Склад узнаём, как в 032,
-- по роли начальника склада по умолчанию: компании под RLS владельцу
-- миграций не видны, а роли — видны, пока снят FORCE.
ALTER TABLE uklad.roles NO FORCE ROW LEVEL SECURITY;
INSERT INTO uklad.roles (org_id, name, permissions, is_default)
SELECT DISTINCT r.org_id, 'Продавец', '{}'::text[], true
FROM uklad.roles r
WHERE r.is_default AND r.deleted_at IS NULL
  AND 'staff.manage' = ANY (r.permissions) AND NOT ('org.manage' = ANY (r.permissions))
  AND NOT EXISTS (
    SELECT 1 FROM uklad.roles x
    WHERE x.org_id = r.org_id AND x.name = 'Продавец' AND x.deleted_at IS NULL
  );
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
      (NEW.id, 'Упаковщик', ARRAY['products.view','stock.view','packing.view','packing.do'], true),
      (NEW.id, 'Продавец', '{}'::text[], true);
  END IF;
  IF NEW.has_seller THEN
    INSERT INTO uklad.roles (org_id, name, permissions, is_default) VALUES
      (NEW.id, 'Менеджер селлера', ARRAY['products.view','products.edit','stock.view',
        'seller.requests','chat.use'], true);
  END IF;
  RETURN NEW;
END $$;

-- Закрепить человека за продавцом или снять закрепление. Закрепить может
-- только тот, кто ведёт договоры (`contracts.manage`), и только человека
-- без «Персонала»: руководитель, ставший «продавцом», потерял бы кабинет.
CREATE FUNCTION auth.set_member_partner(p_member uuid, p_partner text) RETURNS void
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
                 AND 'staff.manage' = ANY (r.permissions)) THEN
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

-- Место того, кто вошёл, — с продавцом.
DROP FUNCTION auth.actor_place();
CREATE FUNCTION auth.actor_place()
RETURNS TABLE (warehouse_ref text, staff_ref text, name text, role_name text, partner_ref text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT m.warehouse_ref, m.staff_ref, m.display_name, r.name, m.partner_ref
  FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  WHERE m.id = auth.actor_member() AND m.org_id = uklad.current_org() AND m.deleted_at IS NULL
$$;

-- Список команды — с продавцом каждого (карточка продавца показывает, позван ли он).
DROP FUNCTION auth.team_list();
CREATE FUNCTION auth.team_list()
RETURNS TABLE (member_id uuid, name text, email text, role_id uuid, role_name text,
               status text, has_login boolean, has_badge boolean,
               last_seen_at timestamptz, invite_expires_at timestamptz,
               warehouse_ref text, staff_ref text, partner_ref text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT m.id, m.display_name,
         coalesce(a.email, (SELECT i.email FROM auth.invitations i
                            WHERE i.member_id = m.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
                            ORDER BY i.created_at DESC LIMIT 1)),
         m.role_id, r.name, m.status, m.account_id IS NOT NULL,
         EXISTS (SELECT 1 FROM auth.badges b WHERE b.member_id = m.id AND b.revoked_at IS NULL),
         m.last_seen_at,
         (SELECT i.expires_at FROM auth.invitations i
          WHERE i.member_id = m.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
          ORDER BY i.created_at DESC LIMIT 1),
         m.warehouse_ref, m.staff_ref, m.partner_ref
  FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  LEFT JOIN auth.accounts a ON a.id = m.account_id
  WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
  ORDER BY m.created_at
$$;

-- Компании вошедшего — с продавцом: при входе кабинет ещё не знает компанию
-- и спрашивает «кто я» без неё, а открыться должен сразу ролью продавца.
DROP FUNCTION auth.my_orgs(bytea);
CREATE FUNCTION auth.my_orgs(p_token bytea)
RETURNS TABLE (org_id uuid, name text, has_warehouse boolean, has_seller boolean, role_name text,
               partner_ref text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_account uuid;
BEGIN
  SELECT x.account_id INTO v_account FROM auth.sessions x
  JOIN auth.accounts a ON a.id = x.account_id AND a.disabled_at IS NULL
  WHERE x.token_hash = p_token AND x.kind = 'password' AND x.revoked_at IS NULL
    AND x.expires_at > now();
  IF v_account IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.account_id', v_account::text, true);
  RETURN QUERY
  SELECT o.id, o.name, o.has_warehouse, o.has_seller, r.name, m.partner_ref
  FROM uklad.members m
  JOIN uklad.orgs o ON o.id = m.org_id AND o.deleted_at IS NULL
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  WHERE m.account_id = v_account AND auth.can_enter(m.status, m.deleted_at)
  ORDER BY o.name;
  PERFORM set_config('app.account_id', '', true);
END $$;

REVOKE EXECUTE ON FUNCTION auth.team_list(), auth.actor_place(), auth.my_orgs(bytea),
  auth.set_member_partner(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.team_list(), auth.actor_place(), auth.my_orgs(bytea),
  auth.set_member_partner(uuid, text) TO uklad_app;
