-- Основа: схемы, ID, компания из транзакции.
--
-- Все таблицы с данными клиентов живут в схеме `uklad`, и у каждой есть
-- `org_id NOT NULL`, ENABLE + FORCE ROW LEVEL SECURITY. Это проверяет тест
-- `schema.test.js`: новая таблица без них роняет CI. Исключения — только
-- справочники из списка в этом тесте.
--
-- Схема `auth` (учётные записи для входа) роли приложения не видна вовсе:
-- вход будет проверять отдельная функция, а не запрос экрана.

CREATE SCHEMA uklad;
CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
GRANT USAGE ON SCHEMA uklad TO uklad_app;

-- UUIDv7: угадать нельзя, по времени сортируется — индексы не пухнут, как от
-- случайного UUIDv4. В Postgres 16 своей функции нет (появится в 18).
CREATE FUNCTION uklad.uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
        PLACING substring(int8send((extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
        FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;

-- Компания текущего запроса. Сервер ставит её в каждой транзакции:
--   SELECT set_config('app.org_id', '<uuid из сессии>', true)  -- true = LOCAL
-- Не задана — NULL, и ни одна политика не пропустит ни строки.
-- `SET` без LOCAL запрещён: через пул соединений компания утекла бы в чужой
-- запрос (раздел 5а, правило 4).
CREATE FUNCTION uklad.current_org() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- Кто из сотрудников действует — для журнала. Не для прав: права решает
-- сервер по сессии, это поле только подписывает запись.
CREATE FUNCTION uklad.current_member() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.member_id', true), '')::uuid
$$;
