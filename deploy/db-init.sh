#!/bin/sh
# Первый запуск Postgres: роли uklad_owner / uklad_app / uklad_notifier и база
# uklad (server/db/init.sql). Образ postgres выполняет этот файл сам, один раз,
# пока том с данными пуст. Пароли приходят из .env через compose и в журнал
# не пишутся.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$PG_OWNER_PASSWORD" \
  -v app_pw="$PG_APP_PASSWORD" \
  -v notifier_pw="$PG_NOTIFIER_PASSWORD" \
  -f /uklad/init.sql
