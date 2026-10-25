-- Уведомления о сообщениях вне кабинета: Телеграм-бот и письмо о
-- непрочитанном (план чата к запуску, Кирилл 24.10: «Согласен с тобой»).
--
-- Push на телефон и ТСД придёт после запуска, а до того человека, ушедшего
-- от экрана, достают два канала:
--   - Телеграм — почти сразу (через минуту, если сообщение не прочитали в
--     кабинете), по одному уведомлению на диалог за раз;
--   - письмо — если непрочитанное лежит час, и не чаще раза в шесть часов.
--
-- Всё лежит в закрытой схеме `auth`: номер чата в Телеграме и почта — это
-- данные человека, приложению их таблицы недоступны. Приложение вызывает
-- только функции ниже.
--
-- `auth.chat_due` — единственное место, которое читает переписку поверх
-- изоляции компаний: рассылка идёт одна на весь сервер, сессии у неё нет.
-- Поэтому функция отдаёт ровно то, что уйдёт в уведомление, и не больше:
-- последнее сообщение диалога и только тем, кто в нём участвует, не выключил
-- уведомления диалога и сам сообщение не прочитал. Текст — только если
-- человек не выключил его показ (`members.notify_preview`, 006).

-- ---- Чтение поверх компаний для рассылки ----

-- Функции рассылки работают от владельца таблиц, а RLS у таблиц FORCE —
-- без отдельного правила владелец видел бы столько же, сколько приложение
-- без компании, то есть ничего. Правило ниже открывает чтение только роли
-- владельца (`TO uklad_owner`) и только пока функция рассылки сама поставила
-- `app.notifier`. Приложение (uklad_app) под это правило не попадает, даже
-- если поставит флаг: оно не владелец.
CREATE FUNCTION auth.notifier_on() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.notifier', true), '') = 'on'
$$;
CREATE POLICY notifier_read ON uklad.members FOR SELECT TO uklad_owner USING (auth.notifier_on());
CREATE POLICY notifier_read ON uklad.orgs FOR SELECT TO uklad_owner USING (auth.notifier_on());
CREATE POLICY notifier_read ON uklad.conversations FOR SELECT TO uklad_owner USING (auth.notifier_on());
CREATE POLICY notifier_read ON uklad.conversation_members FOR SELECT TO uklad_owner USING (auth.notifier_on());
CREATE POLICY notifier_read ON uklad.messages FOR SELECT TO uklad_owner USING (auth.notifier_on());

-- ---- Телеграм: привязка ----

-- Одноразовый код из ссылки t.me/<бот>?start=<код>. В базе — хэш: утёкшая
-- копия не привяжет чужой Телеграм. Живёт десять минут.
CREATE TABLE auth.telegram_codes (
  code_hash bytea PRIMARY KEY,
  org_id uuid NOT NULL,
  member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id)
);

-- Куда слать. Один Телеграм может получать уведомления нескольких карточек
-- (человек в двух компаниях), но у карточки Телеграм один.
CREATE TABLE auth.telegram_links (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  org_id uuid NOT NULL,
  member_id uuid NOT NULL,
  chat_id bigint NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id)
);
CREATE UNIQUE INDEX telegram_links_one ON auth.telegram_links (member_id) WHERE revoked_at IS NULL;
CREATE INDEX telegram_links_chat ON auth.telegram_links (chat_id) WHERE revoked_at IS NULL;

-- Код для текущего сотрудника (сессию проверил `auth.resolve`).
CREATE FUNCTION auth.telegram_code(p_hash bytea, p_ttl interval) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE v_exp timestamptz := now() + p_ttl;
BEGIN
  IF uklad.current_member() IS NULL THEN
    RAISE EXCEPTION 'no member' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Новый код гасит прежние: в чате бота может висеть старая ссылка.
  UPDATE auth.telegram_codes SET used_at = now()
  WHERE member_id = uklad.current_member() AND used_at IS NULL;
  INSERT INTO auth.telegram_codes (code_hash, org_id, member_id, expires_at)
  VALUES (p_hash, uklad.current_org(), uklad.current_member(), v_exp);
  RETURN v_exp;
END $$;

-- Бот получил /start <код>: привязать чат к карточке. Вернёт, кого привязали,
-- — бот так и ответит. Код неверный, истёк или использован — пусто.
CREATE FUNCTION auth.telegram_bind(p_hash bytea, p_chat bigint)
RETURNS TABLE (member_name text, org_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE c auth.telegram_codes;
BEGIN
  SELECT * INTO c FROM auth.telegram_codes x
  WHERE x.code_hash = p_hash AND x.used_at IS NULL AND x.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE auth.telegram_codes SET used_at = now() WHERE code_hash = p_hash;
  UPDATE auth.telegram_links SET revoked_at = now()
  WHERE member_id = c.member_id AND revoked_at IS NULL;
  INSERT INTO auth.telegram_links (org_id, member_id, chat_id) VALUES (c.org_id, c.member_id, p_chat);
  PERFORM set_config('app.notifier', 'on', true);
  RETURN QUERY
  SELECT m.display_name, o.name FROM uklad.members m JOIN uklad.orgs o ON o.id = m.org_id
  WHERE m.org_id = c.org_id AND m.id = c.member_id;
  PERFORM set_config('app.notifier', '', true);
END $$;

-- Привязан ли Телеграм у текущего сотрудника.
CREATE FUNCTION auth.telegram_linked() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM auth.telegram_links
                 WHERE member_id = uklad.current_member() AND revoked_at IS NULL)
$$;

-- Отвязать из кабинета.
CREATE FUNCTION auth.telegram_unbind() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE auth.telegram_links SET revoked_at = now()
  WHERE member_id = uklad.current_member() AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Человек написал боту /stop или заблокировал его: чат больше не трогаем.
CREATE FUNCTION auth.telegram_forget(p_chat bigint) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE auth.telegram_links SET revoked_at = now() WHERE chat_id = p_chat AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- ---- Рассылка ----

-- До какого сообщения человеку уже сказали о диалоге в этом канале. Без
-- этого каждый проход рассылки повторял бы одно и то же.
CREATE TABLE auth.chat_notified (
  org_id uuid NOT NULL,
  member_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES uklad.conversations (id),
  channel text NOT NULL CHECK (channel IN ('telegram', 'email')),
  notified_upto timestamptz NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, conversation_id, channel),
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id)
);
CREATE INDEX chat_notified_recent ON auth.chat_notified (member_id, channel, notified_at);

-- Кому и о чём пора сказать. По строке на (человек, диалог): число
-- непрочитанных, кто написал последним и, если можно, что.
--   p_min_age — сколько сообщение должно пролежать непрочитанным;
--   p_quiet   — сколько молчать после прошлого уведомления этого канала
--               человеку о любом диалоге (письмо не чаще раза в 6 часов).
CREATE FUNCTION auth.chat_due(p_channel text, p_min_age interval, p_quiet interval, p_limit integer)
RETURNS TABLE (
  org_id uuid, member_id uuid, conversation_id uuid, target text,
  title text, author text, body text, unread integer, upto timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = auth, uklad, pg_temp AS $$
BEGIN
  PERFORM set_config('app.notifier', 'on', true);
  RETURN QUERY
  SELECT cm.org_id, cm.member_id, cm.conversation_id,
         CASE p_channel WHEN 'telegram' THEN tl.chat_id::text ELSE a.email END,
         c.title, coalesce(am.display_name, ''),
         CASE WHEN m.notify_preview THEN last.body END,
         agg.n, agg.upto
  FROM uklad.conversation_members cm
  JOIN uklad.members m ON m.org_id = cm.org_id AND m.id = cm.member_id
    AND m.deleted_at IS NULL AND m.status IN ('active', 'sleeping')
  JOIN uklad.conversations c ON c.id = cm.conversation_id AND c.deleted_at IS NULL
  LEFT JOIN auth.telegram_links tl ON p_channel = 'telegram'
    AND tl.member_id = cm.member_id AND tl.revoked_at IS NULL
  LEFT JOIN auth.accounts a ON p_channel = 'email'
    AND a.id = m.account_id AND a.disabled_at IS NULL AND a.email_verified_at IS NOT NULL
  LEFT JOIN auth.chat_notified n ON n.member_id = cm.member_id
    AND n.conversation_id = cm.conversation_id AND n.channel = p_channel
  CROSS JOIN LATERAL (
    SELECT count(*)::integer AS n, max(x.created_at) AS upto
    FROM uklad.messages x
    WHERE x.conversation_id = cm.conversation_id AND x.deleted_at IS NULL
      AND x.author_member_id <> cm.member_id
      AND x.created_at >= cm.joined_at
      AND x.created_at > coalesce(cm.last_read_at, '-infinity')
      AND x.created_at > coalesce(n.notified_upto, '-infinity')
      AND x.created_at <= now() - p_min_age
  ) agg
  CROSS JOIN LATERAL (
    SELECT x.body, x.org_id AS author_org, x.author_member_id
    FROM uklad.messages x
    WHERE x.conversation_id = cm.conversation_id AND x.deleted_at IS NULL
      AND x.author_member_id <> cm.member_id AND x.created_at <= agg.upto
    ORDER BY x.created_at DESC LIMIT 1
  ) last
  LEFT JOIN uklad.members am ON am.org_id = last.author_org AND am.id = last.author_member_id
  WHERE cm.left_at IS NULL AND NOT cm.muted AND agg.n > 0
    AND (CASE p_channel WHEN 'telegram' THEN tl.chat_id IS NOT NULL ELSE a.email IS NOT NULL END)
    AND NOT EXISTS (
      SELECT 1 FROM auth.chat_notified q
      WHERE q.member_id = cm.member_id AND q.channel = p_channel
        AND q.notified_at > now() - p_quiet
    )
  ORDER BY agg.upto
  LIMIT p_limit;
  PERFORM set_config('app.notifier', '', true);
END $$;

-- Уведомление ушло (или канал недоступен навсегда): больше о сообщениях
-- до `p_upto` в этом диалоге не говорить.
CREATE FUNCTION auth.chat_noticed(p_channel text, p_org uuid, p_member uuid, p_conv uuid, p_upto timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  INSERT INTO auth.chat_notified (org_id, member_id, conversation_id, channel, notified_upto)
  VALUES (p_org, p_member, p_conv, p_channel, p_upto)
  ON CONFLICT (member_id, conversation_id, channel)
  DO UPDATE SET notified_upto = greatest(auth.chat_notified.notified_upto, excluded.notified_upto),
                notified_at = now()
$$;

-- Уборка: истёкшие коды. Отметки рассылки живут, пока жив диалог.
CREATE FUNCTION auth.chat_purge() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = auth, pg_temp AS $$
  DELETE FROM auth.telegram_codes WHERE expires_at < now() - interval '1 day'
$$;

-- Права. Привязку из кабинета (код, «привязан ли», отвязать) зовёт
-- приложение под сессией. Всё, что работает без сессии и поверх компаний, —
-- рассылка и вебхук бота — только у роли `uklad_notifier` (init.sql): у
-- приложения этих функций нет, и SQL-инъекция в маршруте кабинета не
-- выгрузит чужую переписку, почты и чаты Телеграма.
REVOKE EXECUTE ON FUNCTION
  auth.notifier_on(),
  auth.telegram_code(bytea, interval),
  auth.telegram_bind(bytea, bigint),
  auth.telegram_linked(),
  auth.telegram_unbind(),
  auth.telegram_forget(bigint),
  auth.chat_due(text, interval, interval, integer),
  auth.chat_noticed(text, uuid, uuid, uuid, timestamptz),
  auth.chat_purge()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  auth.telegram_code(bytea, interval),
  auth.telegram_linked(),
  auth.telegram_unbind()
TO uklad_app;
GRANT USAGE ON SCHEMA auth TO uklad_notifier;
GRANT EXECUTE ON FUNCTION
  auth.telegram_bind(bytea, bigint),
  auth.telegram_forget(bigint),
  auth.chat_due(text, interval, interval, integer),
  auth.chat_noticed(text, uuid, uuid, uuid, timestamptz),
  auth.chat_purge()
TO uklad_notifier;
