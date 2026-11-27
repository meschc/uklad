-- Смена своей почты кодом на новый адрес (Кирилл 24.11: «почему смена почты
-- не настоящая?»). До этого экран профиля менял почту только в браузере.
--
-- Как у Google и Telegram:
-- 1. Человек вошёл, вводит новый адрес и свой пароль (пароль проверяет
--    сервер: украденная сессия не должна уводить аккаунт на чужую почту).
-- 2. Код из шести цифр уходит на НОВЫЙ адрес: так видно, что адрес его.
-- 3. Верный код меняет почту, остальные сессии гаснут, на старый адрес
--    уходит письмо «почту сменили» — если это были не вы, видно сразу.
--
-- Код — та же `auth.email_codes` (005): 15 минут, пять попыток, двадцать
-- неудач в сутки на аккаунт, не больше пяти писем в час и десяти в сутки.
-- Новый адрес лежит рядом с кодом, а не в аккаунте: пока код не введён,
-- вход по-прежнему по старой почте.

ALTER TABLE auth.email_codes DROP CONSTRAINT email_codes_purpose_check;
ALTER TABLE auth.email_codes
  ADD CONSTRAINT email_codes_purpose_check
  CHECK (purpose IN ('verify', 'reset', 'email_change'));
ALTER TABLE auth.email_codes
  ADD COLUMN new_email text
  CHECK (new_email IS NULL OR (new_email = lower(new_email) AND position('@' IN new_email) > 1));

-- Выдать код смены почты. Ответ: 'ok'; 'same' — это и так ваша почта;
-- 'taken' — адрес занят другим аккаунтом; 'limit' — писем слишком много;
-- NULL — сессии нет. Хэш кода считает сервер (sha256 «id аккаунта:код»).
--
-- 'taken' раскрывает, что адрес занят. Узнать это может только вошедший,
-- только что ввёл верный пароль, и не чаще пяти раз в час (лимит писем
-- считается и по отказам 'taken' — см. ниже), так что перебором почт это не
-- пройти.
CREATE FUNCTION auth.request_email_change(p_token bytea, p_new text, p_hash bytea, p_ttl interval)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE
  v_account uuid := auth.session_account(p_token);
  v_new text := lower(trim(p_new));
  v_old text;
BEGIN
  IF v_account IS NULL THEN RETURN NULL; END IF;
  SELECT a.email INTO v_old FROM auth.accounts a WHERE a.id = v_account;
  IF v_new = v_old THEN RETURN 'same'; END IF;
  IF (SELECT count(*) FROM auth.email_codes c
      WHERE c.account_id = v_account AND c.purpose = 'email_change'
        AND c.created_at > now() - interval '1 hour') >= 5
     OR (SELECT count(*) FROM auth.email_codes c
         WHERE c.account_id = v_account AND c.purpose = 'email_change'
           AND c.created_at > now() - interval '1 day') >= 10 THEN
    RETURN 'limit';
  END IF;
  -- Прежний код гаснет в любом случае; попытка с занятым адресом тоже
  -- оставляет строку (уже погашенную) — так она считается в лимит.
  UPDATE auth.email_codes SET used_at = now()
  WHERE account_id = v_account AND purpose = 'email_change' AND used_at IS NULL;
  IF EXISTS (SELECT 1 FROM auth.accounts a WHERE a.email = v_new) THEN
    INSERT INTO auth.email_codes (account_id, purpose, code_hash, expires_at, new_email, used_at)
    VALUES (v_account, 'email_change', p_hash, now(), v_new, now());
    RETURN 'taken';
  END IF;
  INSERT INTO auth.email_codes (account_id, purpose, code_hash, expires_at, new_email)
  VALUES (v_account, 'email_change', p_hash, now() + p_ttl, v_new);
  RETURN 'ok';
END $$;

-- Ввести код. status: 'ok' — почта сменена; 'bad' — кода нет, не тот или
-- истёк (неверный тратит попытку); 'taken' — пока шло письмо, адрес занял
-- кто-то другой. Остальные сессии аккаунта гаснут, эта остаётся.
CREATE FUNCTION auth.confirm_email_change(p_token bytea, p_hash bytea)
RETURNS TABLE (status text, old_email text, new_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE
  v_account uuid := auth.session_account(p_token);
  v auth.email_codes;
  v_old text;
BEGIN
  IF v_account IS NULL THEN
    RETURN QUERY SELECT 'bad'::text, NULL::text, NULL::text; RETURN;
  END IF;
  SELECT * INTO v FROM auth.email_codes c
  WHERE c.account_id = v_account AND c.purpose = 'email_change' AND c.used_at IS NULL
    AND c.expires_at > now() AND c.attempts < 5
  ORDER BY c.created_at DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'bad'::text, NULL::text, NULL::text; RETURN;
  END IF;
  IF (SELECT coalesce(sum(c.attempts), 0) FROM auth.email_codes c
      WHERE c.account_id = v_account AND c.created_at > now() - interval '1 day') >= 20 THEN
    RETURN QUERY SELECT 'bad'::text, NULL::text, NULL::text; RETURN;
  END IF;
  IF v.code_hash <> p_hash THEN
    UPDATE auth.email_codes SET attempts = attempts + 1 WHERE id = v.id;
    RETURN QUERY SELECT 'bad'::text, NULL::text, NULL::text; RETURN;
  END IF;
  UPDATE auth.email_codes SET used_at = now() WHERE id = v.id;
  SELECT a.email INTO v_old FROM auth.accounts a WHERE a.id = v_account;
  BEGIN
    UPDATE auth.accounts SET email = v.new_email, email_verified_at = now()
    WHERE id = v_account;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'taken'::text, v_old, v.new_email; RETURN;
  END;
  UPDATE auth.sessions SET revoked_at = now()
  WHERE account_id = v_account AND revoked_at IS NULL AND token_hash <> p_token;
  RETURN QUERY SELECT 'ok'::text, v_old, v.new_email;
END $$;

REVOKE EXECUTE ON FUNCTION
  auth.request_email_change(bytea, text, bytea, interval),
  auth.confirm_email_change(bytea, bytea)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.request_email_change(bytea, text, bytea, interval),
  auth.confirm_email_change(bytea, bytea)
TO uklad_app;
