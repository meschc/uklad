-- Подкачка заказов площадок на сервере (шаг 2 `docs/domain/fbs.md`).
--
-- До этой миграции заказы Ozon, WB и Маркета спрашивал браузер руководителя
-- (#203): кабинет закрыт — заказы не приходят, а столы ждут работу. Теперь
-- сервер сам, круглые сутки, раз в полторы минуты на подключение спрашивает
-- площадку и заводит новые заказы заявками склада (`cabinet/orderPull.js`).
--
-- Подкачка одна на весь сервер, сессии у неё нет, поэтому ей нужно найти
-- подключение, которому пора, поверх изоляции компаний. Это делает одна
-- функция `auth.connector_pull_claim()`, и отдаёт она только компанию, номер,
-- площадку и одноразовый билет — без ключа и параметров. Ключ сервер читает
-- уже под компанией этого подключения: её ставит `auth.connector_pull_enter`
-- только по билету. Номер подключения без билета в компанию не пускает:
-- иначе любой запрос приложения (в том числе через инъекцию) мог бы войти в
-- чужую компанию двумя вызовами. Кнопке в кабинете билет выдаёт
-- `auth.connector_pull_ticket` под сессией — только для своей компании.
-- Удалённая компания (`orgs.deleted_at`, срок до стирания) не подкачивается.
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
    CHECK (pull_result IS NULL OR jsonb_typeof(pull_result) = 'object'),
  -- Билет прохода: хэш случайной строки и срок. Сам билет знает только
  -- сервер, который его получил; проход заканчивается — билет стирается.
  ADD COLUMN pull_ticket bytea,
  ADD COLUMN pull_ticket_until timestamptz;

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
-- Удалена ли компания подключения.
CREATE POLICY order_pull_read ON uklad.orgs FOR SELECT TO uklad_owner
  USING (auth.order_pull_on());

-- Новый билет подключения `p_id` на две минуты. Только из функций ниже.
CREATE FUNCTION auth.connector_pull_issue(p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  v_ticket text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
  UPDATE uklad.connector_accounts
  SET pull_ticket = sha256(convert_to(v_ticket, 'UTF8')),
      pull_ticket_until = now() + interval '2 minutes'
  WHERE id = p_id;
  RETURN v_ticket;
END $$;
REVOKE EXECUTE ON FUNCTION auth.connector_pull_issue(uuid) FROM PUBLIC;

-- Одно подключение, которому пора: живое, компания не удалена, не брали
-- дольше `p_every`. Берёт его (`pulled_at = now()`) той же транзакцией,
-- поэтому два процесса сервера одно подключение не возьмут (`SKIP LOCKED`).
-- Нет такого — пусто.
CREATE FUNCTION auth.connector_pull_claim(p_every interval)
RETURNS TABLE (org_id uuid, id uuid, system text, ticket text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('app.order_pull', 'on', true);
  SELECT a.id INTO v_id FROM uklad.connector_accounts a
  JOIN uklad.orgs o ON o.id = a.org_id AND o.deleted_at IS NULL
  WHERE a.deleted_at IS NULL
    AND (a.pulled_at IS NULL OR a.pulled_at < now() - greatest(p_every, interval '30 seconds'))
  ORDER BY a.pulled_at NULLS FIRST
  LIMIT 1
  FOR UPDATE OF a SKIP LOCKED;
  IF v_id IS NOT NULL THEN
    UPDATE uklad.connector_accounts a SET pulled_at = now() WHERE a.id = v_id;
    RETURN QUERY
      SELECT a.org_id, a.id, a.system, auth.connector_pull_issue(a.id)
      FROM uklad.connector_accounts a WHERE a.id = v_id;
  END IF;
  PERFORM set_config('app.order_pull', '', true);
END $$;
REVOKE EXECUTE ON FUNCTION auth.connector_pull_claim(interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.connector_pull_claim(interval) TO uklad_app;

-- Билет для кнопки «Загрузить заказы»: под сессией, только подключению своей
-- компании (`current_org()` ставит вход). Чужое или удалённое — пусто.
CREATE FUNCTION auth.connector_pull_ticket(p_account uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  v_org uuid := uklad.current_org();
  v_id uuid;
BEGIN
  IF v_org IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('app.order_pull', 'on', true);
  SELECT a.id INTO v_id FROM uklad.connector_accounts a
  JOIN uklad.orgs o ON o.id = a.org_id AND o.deleted_at IS NULL
  WHERE a.id = p_account AND a.org_id = v_org AND a.deleted_at IS NULL;
  PERFORM set_config('app.order_pull', '', true);
  IF v_id IS NULL THEN RETURN NULL; END IF;
  RETURN auth.connector_pull_issue(v_id);
END $$;
REVOKE EXECUTE ON FUNCTION auth.connector_pull_ticket(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.connector_pull_ticket(uuid) TO uklad_app;

-- Компания для прохода подкачки. Приложение `app.org_id` само не ставит
-- (проверка CI): компанию ставит эта функция — ту, чьё это живое
-- подключение, и только по его неистёкшему билету. Иначе пусто.
CREATE FUNCTION auth.connector_pull_enter(p_account uuid, p_ticket text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = uklad, pg_temp AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_ticket IS NULL OR length(p_ticket) <> 64 THEN RETURN NULL; END IF;
  PERFORM set_config('app.order_pull', 'on', true);
  SELECT a.org_id INTO v_org FROM uklad.connector_accounts a
  JOIN uklad.orgs o ON o.id = a.org_id AND o.deleted_at IS NULL
  WHERE a.id = p_account AND a.deleted_at IS NULL
    AND a.pull_ticket = sha256(convert_to(p_ticket, 'UTF8'))
    AND a.pull_ticket_until > now();
  PERFORM set_config('app.order_pull', '', true);
  IF v_org IS NOT NULL THEN
    PERFORM set_config('app.org_id', v_org::text, true);
  END IF;
  RETURN v_org;
END $$;
REVOKE EXECUTE ON FUNCTION auth.connector_pull_enter(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.connector_pull_enter(uuid, text) TO uklad_app;
