-- Человек из приглашения закреплён за складом и карточкой сотрудника.
--
-- Кирилл 14.11: пригласил «Старшего смены» с карточки на «Складской 5», а
-- вошедший увидел «Логопарк Шереметьево». Приглашение (023) знало только
-- компанию и роль. Смотрящему (роль без «Персонала») сервер отдавал склад,
-- открытый сейчас у руководителя: переключился руководитель — переключился
-- и он. Карточку сотрудника со входом связывала только почта: поменяли почту
-- в карточке — вход «потерялся», а повторно пригласить нельзя.
--
-- Теперь у человека в компании есть склад (`warehouse_ref`, id склада из
-- кабинета) и карточка (`staff_ref`, id сотрудника этого склада). Их ставит
-- приглашение, меняет руководитель (`auth.set_member_place`), а снимок
-- смотрящего сервер собирает по ним (`viewerPlace.js`). Склада нет — нет и
-- кабинета, а не «какой открыт у начальника».

ALTER TABLE uklad.members
  ADD COLUMN warehouse_ref text CHECK (length(warehouse_ref) BETWEEN 1 AND 100),
  ADD COLUMN staff_ref text CHECK (length(staff_ref) BETWEEN 1 AND 100);
-- Одна карточка — один человек: два входа не делят одного «Константина».
CREATE UNIQUE INDEX members_staff_once ON uklad.members (org_id, staff_ref)
  WHERE staff_ref IS NOT NULL AND deleted_at IS NULL;

-- Уже принятые приглашения: склад и карточку находим по почте входа среди
-- карточек сотрудников в снимке компании. Только однозначное совпадение;
-- остальным склад назначит руководитель, открыв карточку.
ALTER TABLE uklad.members NO FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.cabinet_snapshots NO FORCE ROW LEVEL SECURITY;
WITH wh AS (
  SELECT s.org_id, w.value AS w
  FROM uklad.cabinet_snapshots s,
       LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(s.data->'warehouse') = 'object'
              THEN jsonb_build_array(s.data->'warehouse') ELSE '[]'::jsonb END
         || CASE WHEN jsonb_typeof(s.data->'otherWarehouses') = 'array'
                 THEN s.data->'otherWarehouses' ELSE '[]'::jsonb END) w
  WHERE jsonb_typeof(w.value) = 'object'
    AND coalesce(w.value->>'placeholder', 'false') <> 'true'
), cards AS (
  SELECT wh.org_id, wh.w->>'id' AS warehouse_ref, p.value->>'id' AS staff_ref,
         lower(trim(p.value->>'email')) AS email
  FROM wh, LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(wh.w->'staff') = 'array' THEN wh.w->'staff' ELSE '[]'::jsonb END) p
  WHERE jsonb_typeof(p.value) = 'object'
    AND coalesce(p.value->>'email', '') <> ''
    AND length(p.value->>'id') BETWEEN 1 AND 100
    AND length(wh.w->>'id') BETWEEN 1 AND 100
), hit AS (
  SELECT m.id, m.org_id, min(c.warehouse_ref) AS warehouse_ref, min(c.staff_ref) AS staff_ref
  FROM uklad.members m
  JOIN auth.accounts a ON a.id = m.account_id
  JOIN cards c ON c.org_id = m.org_id AND c.email = a.email
  WHERE m.deleted_at IS NULL AND m.warehouse_ref IS NULL
  GROUP BY m.id, m.org_id HAVING count(*) = 1
), uniq AS (
  -- Одна карточка — одному человеку, даже если почта совпала у двоих.
  SELECT h.* FROM hit h
  WHERE (SELECT count(*) FROM hit x WHERE x.org_id = h.org_id AND x.staff_ref = h.staff_ref) = 1
)
UPDATE uklad.members m SET warehouse_ref = u.warehouse_ref, staff_ref = u.staff_ref
FROM uniq u
WHERE m.id = u.id
  AND NOT EXISTS (SELECT 1 FROM uklad.members x
                  WHERE x.org_id = m.org_id AND x.staff_ref = u.staff_ref AND x.deleted_at IS NULL);
-- Склад у компании один — он и есть склад тех, кому его ещё не назначили.
UPDATE uklad.members m SET warehouse_ref = s.data->'warehouse'->>'id'
FROM uklad.cabinet_snapshots s
WHERE s.org_id = m.org_id AND m.warehouse_ref IS NULL AND m.deleted_at IS NULL
  AND jsonb_typeof(s.data->'warehouse') = 'object'
  AND coalesce(s.data->'warehouse'->>'placeholder', 'false') <> 'true'
  AND (jsonb_typeof(s.data->'otherWarehouses') IS DISTINCT FROM 'array'
       OR jsonb_array_length(s.data->'otherWarehouses') = 0)
  AND length(s.data->'warehouse'->>'id') BETWEEN 1 AND 100;
ALTER TABLE uklad.cabinet_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE uklad.members FORCE ROW LEVEL SECURITY;

-- Список команды — со складом и карточкой каждого.
DROP FUNCTION auth.team_list();
CREATE FUNCTION auth.team_list()
RETURNS TABLE (member_id uuid, name text, email text, role_id uuid, role_name text,
               status text, has_login boolean, has_badge boolean,
               last_seen_at timestamptz, invite_expires_at timestamptz,
               warehouse_ref text, staff_ref text)
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
         m.warehouse_ref, m.staff_ref
  FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  LEFT JOIN auth.accounts a ON a.id = m.account_id
  WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
  ORDER BY m.created_at
$$;

-- Пригласить: почта, роль и место — склад и (необязательно) карточка.
-- Склад обязателен роли без «Персонала»: ей кабинет показывается только
-- по нему. Повторное приглашение на ту же почту или на ту же карточку
-- заменяет прежнее: старая ссылка гаснет (поменяли почту в карточке —
-- письмо уходит на новую, старая ссылка мертва). Карточка, у которой уже
-- есть вход, второго не получает.
DROP FUNCTION auth.invite_member(text, uuid, text, bytea, interval);
CREATE FUNCTION auth.invite_member(p_email text, p_role uuid, p_name text, p_token bytea,
                                   p_ttl interval, p_warehouse text, p_staff text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_wh text := nullif(trim(coalesce(p_warehouse, '')), '');
  v_staff text := nullif(trim(coalesce(p_staff, '')), '');
  v_perms text[];
  v_member uuid;
  v_stale uuid[];
BEGIN
  PERFORM auth.assert_staff();
  SELECT r.permissions INTO v_perms FROM uklad.roles r
  WHERE r.id = p_role AND r.org_id = uklad.current_org() AND r.deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'team:not_found'; END IF;
  IF NOT (v_perms <@ auth.actor_permissions()) THEN RAISE EXCEPTION 'team:role_not_allowed'; END IF;
  IF v_staff IS NOT NULL AND v_wh IS NULL THEN RAISE EXCEPTION 'team:no_warehouse'; END IF;
  IF v_wh IS NULL AND NOT ('staff.manage' = ANY (v_perms)) THEN
    RAISE EXCEPTION 'team:no_warehouse';
  END IF;
  -- Письма уходят с нашего домена: суточный потолок на компанию (023).
  IF (SELECT count(*) FROM auth.invitations i
      WHERE i.org_id = uklad.current_org() AND i.created_at > now() - interval '1 day') >= 50 THEN
    RAISE EXCEPTION 'team:too_many_invites';
  END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m JOIN auth.accounts a ON a.id = m.account_id
             WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL AND a.email = v_email) THEN
    RAISE EXCEPTION 'team:already_member';
  END IF;
  IF v_staff IS NOT NULL AND EXISTS (
       SELECT 1 FROM uklad.members m
       WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
         AND m.staff_ref = v_staff AND m.account_id IS NOT NULL) THEN
    RAISE EXCEPTION 'team:card_taken';
  END IF;
  -- Ждущая карточка: сначала та, что на этой карточке сотрудника, потом —
  -- на этой почте.
  SELECT m.id INTO v_member FROM uklad.members m
  WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL AND m.status = 'invited'
    AND m.account_id IS NULL AND v_staff IS NOT NULL AND m.staff_ref = v_staff
  LIMIT 1;
  IF v_member IS NULL THEN
    SELECT i.member_id INTO v_member FROM auth.invitations i
    JOIN uklad.members m ON m.id = i.member_id AND m.deleted_at IS NULL AND m.account_id IS NULL
    WHERE i.org_id = uklad.current_org() AND i.email = v_email
      AND i.accepted_at IS NULL AND i.revoked_at IS NULL
    ORDER BY i.created_at DESC LIMIT 1;
  END IF;
  -- Другие ждущие на эту почту или эту карточку гаснут вместе со ссылками:
  -- одна почта и одна карточка — одно живое приглашение.
  SELECT coalesce(array_agg(DISTINCT m.id), '{}') INTO v_stale FROM uklad.members m
  WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL AND m.status = 'invited'
    AND m.account_id IS NULL AND m.id IS DISTINCT FROM v_member
    AND ((v_staff IS NOT NULL AND m.staff_ref = v_staff)
         OR EXISTS (SELECT 1 FROM auth.invitations i
                    WHERE i.member_id = m.id AND i.email = v_email
                      AND i.accepted_at IS NULL AND i.revoked_at IS NULL));
  UPDATE auth.invitations SET revoked_at = now()
  WHERE member_id = ANY (v_stale) AND accepted_at IS NULL AND revoked_at IS NULL;
  UPDATE uklad.members SET status = 'expired', deleted_at = now()
  WHERE id = ANY (v_stale) AND org_id = uklad.current_org();
  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM uklad.members m
        WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
          AND m.account_id IS NULL AND m.status = 'invited') >= 20 THEN
      RAISE EXCEPTION 'team:too_many_invites';
    END IF;
    INSERT INTO uklad.members (org_id, role_id, display_name, status, warehouse_ref, staff_ref)
    VALUES (uklad.current_org(), p_role, nullif(trim(p_name), ''), 'invited', v_wh, v_staff)
    RETURNING id INTO v_member;
  ELSE
    UPDATE uklad.members SET role_id = p_role,
      display_name = coalesce(nullif(trim(p_name), ''), display_name), status = 'invited',
      warehouse_ref = v_wh, staff_ref = v_staff
    WHERE id = v_member;
    UPDATE auth.invitations SET revoked_at = now()
    WHERE member_id = v_member AND accepted_at IS NULL AND revoked_at IS NULL;
  END IF;
  INSERT INTO auth.invitations (org_id, member_id, email, token_hash, invited_by, expires_at)
  VALUES (uklad.current_org(), v_member, v_email, p_token, auth.actor_member(), now() + p_ttl);
  RETURN v_member;
END $$;

-- Перевести человека на другой склад или привязать к карточке. Те же
-- правила, что у смены роли: не себя и не того, у кого прав больше.
CREATE FUNCTION auth.set_member_place(p_member uuid, p_warehouse text, p_staff text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE
  v_wh text := nullif(trim(coalesce(p_warehouse, '')), '');
  v_staff text := nullif(trim(coalesce(p_staff, '')), '');
BEGIN
  PERFORM auth.assert_may_touch(p_member);
  IF v_wh IS NULL THEN RAISE EXCEPTION 'team:no_warehouse'; END IF;
  IF v_staff IS NOT NULL AND EXISTS (
       SELECT 1 FROM uklad.members m
       WHERE m.org_id = uklad.current_org() AND m.deleted_at IS NULL
         AND m.staff_ref = v_staff AND m.id <> p_member) THEN
    RAISE EXCEPTION 'team:card_taken';
  END IF;
  UPDATE uklad.members SET warehouse_ref = v_wh, staff_ref = v_staff
  WHERE id = p_member AND org_id = uklad.current_org();
END $$;

-- Склад и карточка того, кто сейчас действует: по ним сервер собирает
-- кабинет смотрящего.
CREATE FUNCTION auth.actor_place()
RETURNS TABLE (warehouse_ref text, staff_ref text, name text, role_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT m.warehouse_ref, m.staff_ref, m.display_name, r.name
  FROM uklad.members m
  JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
  WHERE m.id = auth.actor_member() AND m.org_id = uklad.current_org() AND m.deleted_at IS NULL
$$;

REVOKE EXECUTE ON FUNCTION auth.team_list(),
  auth.invite_member(text, uuid, text, bytea, interval, text, text),
  auth.set_member_place(uuid, text, text),
  auth.actor_place() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.team_list(),
  auth.invite_member(text, uuid, text, bytea, interval, text, text),
  auth.set_member_place(uuid, text, text),
  auth.actor_place() TO uklad_app;
