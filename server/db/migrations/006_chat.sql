-- Чат: диалоги, участники, сообщения (решение Кирилла 24.10, узел карты
-- cab-chat-server). Доставку в реальном времени делает Centrifugo, но хранит
-- и решает «кто что видит» только эта схема.
--
-- Диалог — это участники и сообщения, а не пара «склад ↔ селлер». Поэтому
-- общий чат старшего смены, оператора, начальника склада и селлера устроен
-- так же, как разговор вдвоём, и отдельной переделки под группы не будет.
--
-- Изоляция в два слоя:
--   1. компания: диалог видят только компании из `org_ids` — своя и, для
--      диалога по договору, вторая сторона договора;
--   2. человек: внутри компании сообщения видит только участник диалога.
-- Оба слоя — политики RLS. `app.member_id`, как и `app.org_id`, ставит
-- только `auth.resolve` из сессии (004), поэтому здесь он решает права.
--
-- Имён в таблицах чата нет: участник — это `members.id`, имя берётся из
-- карточки сотрудника его компании (data-architecture.md, раздел 3).

CREATE TABLE uklad.conversations (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  -- Кто завёл диалог. Править название и закрывать может только он.
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  -- Компании-участницы: одна (внутренний чат) или две стороны договора.
  org_ids uuid[] NOT NULL CHECK (cardinality(org_ids) BETWEEN 1 AND 2),
  -- Диалог по договору склад ↔ селлер. Пусто — внутренний чат компании.
  contract_id uuid REFERENCES uklad.contracts (id),
  -- support — разговор с Укладом (поддержка), появится вместе с админкой.
  kind text NOT NULL DEFAULT 'group' CHECK (kind IN ('group', 'support')),
  title text CHECK (length(title) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  CHECK (org_id = ANY (org_ids)),
  CHECK ((cardinality(org_ids) = 2) = (contract_id IS NOT NULL))
);
CREATE INDEX conversations_orgs ON uklad.conversations USING gin (org_ids);

CREATE TABLE uklad.conversation_members (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  -- Компания участника: своих людей в диалог добавляет только своя компания.
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  conversation_id uuid NOT NULL REFERENCES uklad.conversations (id),
  member_id uuid NOT NULL,
  added_by uuid,
  joined_at timestamptz NOT NULL DEFAULT now(),
  -- Вышел или убран. История остаётся, новых сообщений он не видит.
  left_at timestamptz,
  -- Прочитано всё до этого момента включительно: одна отметка на человека,
  -- а не строка на каждое сообщение.
  last_read_at timestamptz,
  -- Без уведомлений об этом диалоге (счётчик непрочитанных остаётся).
  muted boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, member_id) REFERENCES uklad.members (org_id, id)
);
CREATE UNIQUE INDEX conversation_members_once ON uklad.conversation_members (conversation_id, member_id)
  WHERE left_at IS NULL;
CREATE INDEX conversation_members_by_member ON uklad.conversation_members (org_id, member_id)
  WHERE left_at IS NULL;

CREATE TABLE uklad.messages (
  id uuid PRIMARY KEY DEFAULT uklad.uuid_v7(),
  -- Компания автора.
  org_id uuid NOT NULL REFERENCES uklad.orgs (id),
  conversation_id uuid NOT NULL REFERENCES uklad.conversations (id),
  author_member_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) <= 4000),
  reply_to uuid REFERENCES uklad.messages (id),
  -- Прикреплённая запись склада: товар, партия, отправка (узел cab-chat-context).
  -- Только ссылка: что за ней, покажет RLS той таблицы — чужому ничего.
  ref_type text CHECK (ref_type IN ('product', 'batch', 'shipment', 'request')),
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  -- Удалено автором: текст стирается, пометка остаётся, чтобы ответы не повисли.
  deleted_at timestamptz,
  UNIQUE (org_id, id),
  FOREIGN KEY (org_id, author_member_id) REFERENCES uklad.members (org_id, id),
  CHECK ((ref_type IS NULL) = (ref_id IS NULL)),
  CHECK (deleted_at IS NULL OR body = '')
);
-- Лента читается с конца: последние N сообщений диалога.
CREATE INDEX messages_feed ON uklad.messages (conversation_id, created_at DESC);

-- Уведомления (решение 24.10): показывать ли текст сообщения во всплывающем
-- уведомлении или только «новое сообщение от …». Настройка человека, а не
-- компании: на общем экране склада её выключают, на своём телефоне — нет.
ALTER TABLE uklad.members ADD COLUMN notify_preview boolean NOT NULL DEFAULT true;

-- Может ли текущий сотрудник пользоваться чатом: право `chat.use` в его роли.
CREATE FUNCTION uklad.can_chat() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM uklad.members m JOIN uklad.roles r ON r.org_id = m.org_id AND r.id = m.role_id
    WHERE m.org_id = uklad.current_org() AND m.id = uklad.current_member()
      AND m.deleted_at IS NULL AND m.status IN ('active', 'sleeping')
      AND 'chat.use' = ANY (r.permissions))
$$;

-- Участвует ли текущий сотрудник в диалоге сейчас. Обычная функция (не
-- SECURITY DEFINER): строку участника она видит через RLS участников.
CREATE FUNCTION uklad.chat_joined(conv uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM uklad.conversation_members cm
    WHERE cm.conversation_id = conv AND cm.org_id = uklad.current_org()
      AND cm.member_id = uklad.current_member() AND cm.left_at IS NULL)
$$;

-- Можно ли писать в диалог: он не закрыт, а диалог по договору — пока договор
-- активен. После закрытия договора история читается, новых сообщений нет.
CREATE FUNCTION uklad.chat_open(conv uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM uklad.conversations v
    LEFT JOIN uklad.contracts k ON k.id = v.contract_id
    WHERE v.id = conv AND v.deleted_at IS NULL
      AND (v.contract_id IS NULL
           OR (k.status = 'active' AND k.deleted_at IS NULL)))
$$;

ALTER TABLE uklad.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY conversations_read ON uklad.conversations FOR SELECT
  USING (uklad.current_org() = ANY (org_ids));
-- Завести диалог: своя компания — всегда; по договору — только сторона этого
-- договора, и вторая компания в `org_ids` — ровно вторая сторона.
CREATE POLICY conversations_insert ON uklad.conversations FOR INSERT WITH CHECK (
  org_id = uklad.current_org() AND uklad.can_chat()
  AND (
    (contract_id IS NULL AND org_ids = ARRAY[org_id])
    OR EXISTS (
      SELECT 1 FROM uklad.contracts k
      WHERE k.id = contract_id AND k.status = 'active' AND k.deleted_at IS NULL
        AND uklad.current_org() IN (k.org_id, k.seller_org_id)
        -- Ровно две стороны договора, без третьих: «содержит» и «содержится».
        AND org_ids @> ARRAY[k.org_id, k.seller_org_id]
        AND org_ids <@ ARRAY[k.org_id, k.seller_org_id]
        AND cardinality(org_ids) = 2)));
CREATE POLICY conversations_update ON uklad.conversations FOR UPDATE
  USING (org_id = uklad.current_org())
  WITH CHECK (org_id = uklad.current_org());

ALTER TABLE uklad.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.conversation_members FORCE ROW LEVEL SECURITY;
-- Состав виден обеим компаниям диалога: «кто ещё в чате» — часть разговора.
CREATE POLICY conversation_members_read ON uklad.conversation_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM uklad.conversations v WHERE v.id = conversation_id));
-- Добавить можно только человека своей компании, в открытый диалог, где
-- своя компания участвует. Первого участника (заводящего) — самого себя.
CREATE POLICY conversation_members_insert ON uklad.conversation_members FOR INSERT WITH CHECK (
  org_id = uklad.current_org() AND uklad.can_chat()
  AND uklad.chat_open(conversation_id)
  AND EXISTS (SELECT 1 FROM uklad.conversations v
              WHERE v.id = conversation_id AND uklad.current_org() = ANY (v.org_ids))
  AND (member_id = uklad.current_member() OR uklad.chat_joined(conversation_id)));
-- Отметку о прочтении, «без звука» и выход правит своя компания и только у
-- своих людей; чужая компания не может выкинуть участника.
CREATE POLICY conversation_members_update ON uklad.conversation_members FOR UPDATE
  USING (org_id = uklad.current_org())
  WITH CHECK (org_id = uklad.current_org());

ALTER TABLE uklad.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE uklad.messages FORCE ROW LEVEL SECURITY;
-- Читать — только участнику. Компания диалога, но не участник (кладовщик,
-- которого не добавили), не видит ничего.
CREATE POLICY messages_read ON uklad.messages FOR SELECT
  USING (uklad.chat_joined(conversation_id));
CREATE POLICY messages_insert ON uklad.messages FOR INSERT WITH CHECK (
  org_id = uklad.current_org() AND author_member_id = uklad.current_member()
  AND uklad.can_chat() AND uklad.chat_joined(conversation_id)
  AND uklad.chat_open(conversation_id) AND deleted_at IS NULL AND edited_at IS NULL);
-- Править и удалять — только своё.
CREATE POLICY messages_update ON uklad.messages FOR UPDATE
  USING (org_id = uklad.current_org() AND author_member_id = uklad.current_member())
  WITH CHECK (org_id = uklad.current_org() AND author_member_id = uklad.current_member());

-- Политики UPDATE проверяют компанию, но не то, КУДА переносится строка:
-- без этого триггера участник «переехал» бы в чужой диалог своей компании,
-- а сообщение — в другую переписку. Связи строки после вставки не меняются.
-- Три функции, а не одна с проверкой TG_TABLE_NAME: plpgsql разбирает поля
-- NEW целиком и падает на колонке, которой в этой таблице нет.
CREATE FUNCTION uklad.chat_member_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_id <> OLD.conversation_id OR NEW.member_id <> OLD.member_id
     OR NEW.org_id <> OLD.org_id OR NEW.joined_at <> OLD.joined_at
     OR (OLD.left_at IS NOT NULL AND NEW.left_at IS DISTINCT FROM OLD.left_at) THEN
    RAISE EXCEPTION 'conversation member links are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION uklad.chat_message_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_id <> OLD.conversation_id OR NEW.author_member_id <> OLD.author_member_id
     OR NEW.org_id <> OLD.org_id OR NEW.created_at <> OLD.created_at
     OR NEW.reply_to IS DISTINCT FROM OLD.reply_to
     OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    RAISE EXCEPTION 'message links are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION uklad.chat_conversation_frozen() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_ids <> OLD.org_ids OR NEW.contract_id IS DISTINCT FROM OLD.contract_id
     OR NEW.org_id <> OLD.org_id THEN
    RAISE EXCEPTION 'conversation parties are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER conversations_frozen BEFORE UPDATE ON uklad.conversations
  FOR EACH ROW EXECUTE FUNCTION uklad.chat_conversation_frozen();
CREATE TRIGGER conversation_members_frozen BEFORE UPDATE ON uklad.conversation_members
  FOR EACH ROW EXECUTE FUNCTION uklad.chat_member_frozen();
CREATE TRIGGER messages_frozen BEFORE UPDATE ON uklad.messages
  FOR EACH ROW EXECUTE FUNCTION uklad.chat_message_frozen();

-- Имя собеседника из другой компании. Карточка сотрудника видна чужой
-- компании, только пока он участник диалога, в котором участвую и я.
CREATE POLICY members_chat_read ON uklad.members FOR SELECT USING (
  EXISTS (SELECT 1 FROM uklad.conversation_members cm
          WHERE cm.org_id = members.org_id AND cm.member_id = members.id
            AND cm.left_at IS NULL AND uklad.chat_joined(cm.conversation_id)));

GRANT SELECT, INSERT, UPDATE
  ON uklad.conversations, uklad.conversation_members, uklad.messages TO uklad_app;
