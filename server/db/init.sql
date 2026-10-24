-- Разовая подготовка кластера Postgres под Уклад. Запускает суперпользователь
-- один раз при развёртывании, до первой миграции:
--
--   psql -v owner_pw="…" -v app_pw="…" -f server/db/init.sql
--
-- Пароли приходят переменными psql из .env на сервере, в репозитории их нет.
--
-- Две роли, а не одна (раздел 5а, правило 3):
--   uklad_owner — владеет таблицами, под ней идут только миграции;
--   uklad_app   — роль приложения: не владелец, без BYPASSRLS, без DELETE.
-- Так ошибка в коде приложения не может ни обойти RLS, ни стереть запись.

SELECT 'CREATE ROLE uklad_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uklad_owner') \gexec
SELECT 'CREATE ROLE uklad_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uklad_app') \gexec

ALTER ROLE uklad_owner LOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS PASSWORD :'owner_pw';
ALTER ROLE uklad_app LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS PASSWORD :'app_pw';

SELECT 'CREATE DATABASE uklad OWNER uklad_owner'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'uklad') \gexec

\connect uklad
REVOKE ALL ON DATABASE uklad FROM PUBLIC;
GRANT CONNECT ON DATABASE uklad TO uklad_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
