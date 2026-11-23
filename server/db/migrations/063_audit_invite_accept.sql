-- Журнал действий: человек принял приглашение (Кирилл 22.11: «все действия»).
--
-- У принятия нет сессии компании: человек входит по ссылке, компанию ставит
-- сама `auth.accept_invite`. Поэтому строку журнала пишет она же, в той же
-- транзакции: не принял — строки нет. Кто — сам принявший (`member_id`),
-- склад — его карточки, только id, без почты. Принять одну ссылку дважды
-- нельзя (`accepted_at` под `FOR UPDATE`), поэтому и строка одна, даже если
-- ссылку открыли в двух вкладках одновременно.
CREATE OR REPLACE FUNCTION auth.accept_invite(p_token bytea, p_account uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE i auth.invitations; v_place text;
BEGIN
  SELECT * INTO i FROM auth.invitations x
  WHERE x.token_hash = p_token AND x.accepted_at IS NULL AND x.revoked_at IS NULL
    AND x.expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.accounts a
                 WHERE a.id = p_account AND a.email = i.email AND a.disabled_at IS NULL) THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.org_id', i.org_id::text, true);
  IF NOT auth.inviter_still_may(i.invited_by, (SELECT m.role_id FROM uklad.members m WHERE m.id = i.member_id)) THEN
    PERFORM set_config('app.org_id', '', true);
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM uklad.members m
             WHERE m.org_id = i.org_id AND m.account_id = p_account AND m.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'team:already_member';
  END IF;
  UPDATE uklad.members SET account_id = p_account, status = 'active', last_seen_at = now()
  WHERE id = i.member_id AND org_id = i.org_id AND status = 'invited' AND deleted_at IS NULL
  RETURNING warehouse_ref INTO v_place;
  IF NOT FOUND THEN
    PERFORM set_config('app.org_id', '', true);
    RETURN NULL;
  END IF;
  UPDATE auth.invitations SET accepted_at = now() WHERE id = i.id;
  -- Политика журнала сверяет `member_id` с сессией: на время записи сессия —
  -- сам принявший.
  PERFORM set_config('app.member_id', i.member_id::text, true);
  INSERT INTO uklad.audit_events (org_id, warehouse_ref, member_id, action, target, source, at)
  VALUES (i.org_id, v_place, i.member_id, 'member.accept', i.member_id::text, 'cabinet',
          clock_timestamp());
  PERFORM set_config('app.member_id', '', true);
  PERFORM set_config('app.org_id', '', true);
  RETURN i.org_id;
END $$;
