-- Подкачка заказов площадок на сервере (шаг 2 `docs/domain/fbs.md`).
--
-- До этой миграции заказы Ozon, WB и Маркета спрашивал браузер руководителя
-- (#203): кабинет закрыт — заказы не приходят, а столы ждут работу. Теперь
-- сервер сам, круглые сутки, раз в полторы минуты на подключение спрашивает
-- площадку и заводит новые заказы заявками склада (`cabinet/orderPull.js`).
--
-- Подкачка одна на весь сервер, сессии у неё нет, поэтому ей нужно найти
-- подключение, которому пора, поверх изоляции компаний. Это делает одна
-- функция `auth.connector_pull_claim()`, и отдаёт она только компанию, номер
-- и площадку — без ключа и параметров. Ключ сервер читает уже под компанией
-- этого подключения (`auth.connector_pull_enter`), обычным правилом RLS.
--
-- Правило чтения поверх компаний — как у рассылки (миграция 007): только роли
-- владельца и только пока функция сама поставила `app.order_pull`.
-- Приложение (uklad_app) под это правило не попадает, даже поставив флаг.

ALTER TABLE uklad.connector_accounts
  -- Когда подкачка последний раз взяла подключение (взяла, а не преуспела).
  ADD COLUMN pulled_at timestamptz,
  -- Итог последней подкачки для экрана «Интеграции»: когда, сколько заведено,
  -- номера с незнакомым товаром, причина отказа. Ключа и ответа площадки нет.
  ADD COLUMN pull_result jsonb
    CHECK (pull_result IS NULL OR jsonb_typeof(pull_result) = 'object');

CREATE INDEX connector_accounts_pull ON uklad.connector_accounts (pulled_at NULLS FIRST)
  WHERE deleted_at IS NULL;

CREATE FUNCTION auth.order_pull_on() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.order_pull', true), '') = 'on'
$$;

CREATE POLICY order_pull_read ON uklad.connector_accounts FOR SELECT TO uklad_owner
  USING (auth.order_pull_on());
CREATE POLICY order_pull_mark ON uklad.connector_accounts FOR UPDATE TO uklad_owner
  USING (auth.order_pull_on()) WITH CHECK (auth.order_pull_on());

-- Одно подключение, которому пора: живое, не брали дольше `p_every`. Берёт
-- его (`pulled_at = now()`) той же транзакцией, поэтому два процесса сервера
-- одно подключение не возьмут (`SKIP LOCKED`). Нет такого — пусто.
CREATE FUNCTION auth.connector_pull_claim(p_every interval)
RETURNS TABLE (org_id uuid, id uuid, system text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('app.order_pull', 'on', true);
  SELECT a.id INTO v_id FROM uklad.connector_accounts a
  WHERE a.deleted_at IS NULL
    AND (a.pulled_at IS NULL OR a.pulled_at < now() - greatest(p_every, interval '30 seconds'))
  ORDER BY a.pulled_at NULLS FIRST
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  IF v_id IS NOT NULL THEN
    RETURN QUERY
      UPDATE uklad.connector_accounts a SET pulled_at = now()
      WHERE a.id = v_id
      RETURNING a.org_id, a.id, a.system;
  END IF;
  PERFORM set_config('app.order_pull', '', true);
END $$;
REVOKE EXECUTE ON FUNCTION auth.connector_pull_claim(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.connector_pull_claim(interval) TO uklad_app;

-- Компания для прохода подкачки. Приложение `app.org_id` само не ставит
-- (проверка CI): компанию ставит эта функция — ту, чьё это живое
-- подключение, и только её. Нет подключения — пусто, компании нет.
CREATE FUNCTION auth.connector_pull_enter(p_account uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  v_org uuid;
BEGIN
  PERFORM set_config('app.order_pull', 'on', true);
  SELECT a.org_id INTO v_org FROM uklad.connector_accounts a
  WHERE a.id = p_account AND a.deleted_at IS NULL;
  PERFORM set_config('app.order_pull', '', true);
  IF v_org IS NOT NULL THEN
    PERFORM set_config('app.org_id', v_org::text, true);
  END IF;
  RETURN v_org;
END $$;
REVOKE EXECUTE ON FUNCTION auth.connector_pull_enter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.connector_pull_enter(uuid) TO uklad_app;
