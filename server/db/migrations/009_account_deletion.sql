-- Удаление аккаунта по просьбе человека и выход на других устройствах.
--
-- Как у Google и Telegram: удаление не мгновенное, а через 30 дней. Всё это
-- время человек может войти и отменить его, ошибка или угнанная сессия не
-- стирают компанию сразу. Через 30 дней `auth.purge_deleted` обезличивает
-- аккаунт: почта и пароль заменяются заглушкой, имя и фото в карточках
-- стираются, а компания, где не осталось ни одного руководителя с паролем,
-- гаснет вместе со снимком кабинета. История других компаний (сообщения, приёмки) остаётся,
-- автором в ней будет «Удалённый сотрудник» (002, members).
--
-- Это единственное место, где строки удаляются физически: срок хранения
-- персональных данных после отзыва согласия — закон (152-ФЗ, ст. 21), и
-- корзина на 30 дней его не нарушает, а продлевать её нельзя.

ALTER TABLE auth.accounts ADD COLUMN delete_requested_at timestamptz;

-- Аккаунт по живой сессии пароля. Внутренний помощник, приложению не выдаётся.
CREATE FUNCTION auth.session_account(p_token bytea) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT x.account_id FROM auth.sessions x
  JOIN auth.accounts a ON a.id = x.account_id AND a.disabled_at IS NULL
  WHERE x.token_hash = p_token AND x.kind = 'password' AND x.revoked_at IS NULL
    AND x.expires_at > now()
$$;

-- Кто вошёл: почта, хэш пароля (удаление подтверждается паролем) и дата,
-- на которую назначено удаление.
CREATE FUNCTION auth.my_account(p_token bytea)
RETURNS TABLE (account_id uuid, email text, password_hash text, delete_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT a.id, a.email, a.password_hash, a.delete_requested_at + interval '30 days'
  FROM auth.accounts a WHERE a.id = auth.session_account(p_token)
$$;

-- Назначить удаление. Все сессии гаснут, и эта тоже: вернуться можно только
-- паролем, то есть тот, кто просто сидит за чужим компьютером, отменить
-- удаление не сможет.
CREATE FUNCTION auth.request_deletion(p_token bytea) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE v_account uuid := auth.session_account(p_token);
DECLARE v_at timestamptz;
BEGIN
  IF v_account IS NULL THEN RETURN NULL; END IF;
  UPDATE auth.accounts SET delete_requested_at = coalesce(delete_requested_at, now())
  WHERE id = v_account RETURNING delete_requested_at + interval '30 days' INTO v_at;
  UPDATE auth.sessions SET revoked_at = now()
  WHERE account_id = v_account AND revoked_at IS NULL;
  RETURN v_at;
END $$;

-- Передумал: вошёл паролем и отменил.
CREATE FUNCTION auth.cancel_deletion(p_token bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE v_account uuid := auth.session_account(p_token);
BEGIN
  IF v_account IS NULL THEN RETURN false; END IF;
  UPDATE auth.accounts SET delete_requested_at = NULL WHERE id = v_account;
  RETURN true;
END $$;

-- Выйти на всех устройствах, кроме этого. Сколько сессий закрыто.
CREATE FUNCTION auth.revoke_other_sessions(p_token bytea) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE v_account uuid := auth.session_account(p_token);
DECLARE v_n integer;
BEGIN
  IF v_account IS NULL THEN RETURN 0; END IF;
  UPDATE auth.sessions SET revoked_at = now()
  WHERE account_id = v_account AND revoked_at IS NULL AND token_hash <> p_token;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- Сколько у аккаунта открытых сессий, кроме этой: показать до кнопки.
CREATE FUNCTION auth.other_sessions(p_token bytea) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT count(*)::integer FROM auth.sessions
  WHERE account_id = auth.session_account(p_token) AND revoked_at IS NULL
    AND expires_at > now() AND token_hash <> p_token
$$;

-- Ежесуточно: аккаунты, у которых вышли 30 дней, обезличиваются.
--
-- Каждый аккаунт — своя подтранзакция: одна неожиданная строка (внешний
-- ключ, данные старой версии) не должна откатывать всех остальных, иначе
-- никого не обезличат ни этой ночью, ни следующей, а срок по закону идёт.
-- Ошибка уходит в журнал сервера (WARNING), остальные продолжаются.
--
-- Строку аккаунта берём `FOR UPDATE SKIP LOCKED` и проверяем срок ещё раз
-- уже под блокировкой: человек, нажавший «Отменить удаление» в эту секунду,
-- либо успевает (строка занята — пропускаем, срок снят — пропускаем), либо
-- ждёт конца чистки и получает «сессии нет». Обезличить того, кто успел
-- отменить, нельзя.
--
-- Компания гаснет, когда в ней не осталось ни одного живого человека с
-- паролем и правом «Сотрудники и роли»: управлять ею больше некому.
-- Бейдж-сотрудники такой компании обезличиваются вместе с ней — их имена
-- тоже персональные данные, а снимок кабинета с персоналом и ставками
-- стирается.
--
-- Два экземпляра сервера не чистят одновременно: advisory-lock на время
-- транзакции, второй просто уходит с нулём.
CREATE FUNCTION auth.purge_deleted() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_account uuid;
DECLARE v_org uuid;
DECLARE v_n integer := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('uklad.purge_deleted')) THEN
    RETURN 0;
  END IF;
  FOR v_account IN SELECT id FROM auth.accounts
    WHERE delete_requested_at < now() - interval '30 days' AND disabled_at IS NULL
  LOOP
    BEGIN
      PERFORM 1 FROM auth.accounts
      WHERE id = v_account AND disabled_at IS NULL
        AND delete_requested_at < now() - interval '30 days'
      FOR UPDATE SKIP LOCKED;
      CONTINUE WHEN NOT FOUND;

      PERFORM set_config('app.account_id', v_account::text, true);
      FOR v_org IN SELECT m.org_id FROM uklad.members m WHERE m.account_id = v_account LOOP
        PERFORM set_config('app.org_id', v_org::text, true);
        DELETE FROM auth.telegram_links l USING uklad.members m
        WHERE l.org_id = v_org AND l.member_id = m.id AND m.account_id = v_account;
        DELETE FROM auth.telegram_codes t USING uklad.members m
        WHERE t.org_id = v_org AND t.member_id = m.id AND m.account_id = v_account;
        UPDATE uklad.members
        SET deleted_at = coalesce(deleted_at, now()), status = 'disabled',
            display_name = NULL, photo_url = NULL
        WHERE org_id = v_org AND account_id = v_account;
        IF NOT EXISTS (
          SELECT 1 FROM uklad.members m
          JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
          JOIN auth.accounts a ON a.id = m.account_id
          WHERE m.org_id = v_org AND m.deleted_at IS NULL AND a.disabled_at IS NULL
            AND a.delete_requested_at IS NULL AND 'staff.manage' = ANY (r.permissions)
        ) THEN
          UPDATE uklad.members
          SET deleted_at = coalesce(deleted_at, now()), status = 'disabled',
              display_name = NULL, photo_url = NULL
          WHERE org_id = v_org AND account_id IS NULL;
          UPDATE uklad.orgs SET deleted_at = coalesce(deleted_at, now()) WHERE id = v_org;
          DELETE FROM uklad.cabinet_snapshots WHERE org_id = v_org;
        END IF;
      END LOOP;
      PERFORM set_config('app.org_id', '', true);
      DELETE FROM auth.email_codes WHERE account_id = v_account;
      DELETE FROM auth.sessions WHERE account_id = v_account;
      -- Сама строка остаётся: заглушка вместо почты и дата `disabled_at`
      -- и есть след того, что и когда обезличено.
      UPDATE auth.accounts
      SET email = 'deleted-' || id || '@deleted.invalid', password_hash = '!',
          email_verified_at = NULL, disabled_at = now()
      WHERE id = v_account;
      PERFORM set_config('app.account_id', '', true);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'purge_deleted: аккаунт % пропущен: %', v_account, SQLERRM;
    END;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION
  auth.session_account(bytea),
  auth.my_account(bytea),
  auth.request_deletion(bytea),
  auth.cancel_deletion(bytea),
  auth.revoke_other_sessions(bytea),
  auth.other_sessions(bytea),
  auth.purge_deleted()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.my_account(bytea),
  auth.request_deletion(bytea),
  auth.cancel_deletion(bytea),
  auth.revoke_other_sessions(bytea),
  auth.other_sessions(bytea),
  auth.purge_deleted()
TO uklad_app;
