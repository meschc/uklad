-- Стол привязывает руководитель, который здесь и сейчас (Кирилл 20.11).
--
-- До этой миграции стол привязывала любая живая сессия руководителя: вошёл
-- утром на складском компьютере, отошёл — и кто угодно за этим компьютером
-- превращал его в стол. Теперь сервер (`desks.js`, `open`) привязывает,
-- только если руководитель подтвердил себя только что: вошёл паролем не
-- раньше 10 минут назад, или в самом запросе — его пароль, или бейдж
-- сотрудника с правом на персонал. Так же устроено «подтвердите пароль» перед
-- опасным действием у GitHub (sudo mode) и привязка терминала у Square.
--
-- Отсюда — свежесть входа по паролю. Вход по коду из письма (подтверждение
-- почты, сброс пароля) тоже свежий: код знает только владелец почты.

CREATE FUNCTION auth.session_fresh(p_token bytea, p_within interval)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.token_hash = p_token AND s.kind = 'password' AND s.revoked_at IS NULL
      AND s.expires_at > now() AND s.created_at > now() - p_within
  );
$$;

REVOKE EXECUTE ON FUNCTION auth.session_fresh(bytea, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.session_fresh(bytea, interval) TO uklad_app;
