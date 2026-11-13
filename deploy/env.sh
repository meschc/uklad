# shellcheck shell=sh
# Чтение `.env` для скриптов сервера (backup.sh, watchdog.sh).
#
# `.env` — файл docker compose, а не скрипт оболочки: в нём бывают значения с
# пробелами и кавычками без экранирования (реквизиты: `PAYEE_BANK=АО „ОЗОН
# Банк"`). `. ./.env` выполнял бы такую строку как команду и ронял выкладку
# (13.11: «./.env: „ОЗОН: not found»). Здесь строка `КЛЮЧ=значение` только
# присваивается, ничего не выполняется; парные кавычки вокруг значения
# снимаются, как это делает compose.
load_env() {
  [ -f "$1" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      '' | '#'*) continue ;;
      *=*) ;;
      *) continue ;;
    esac
    key=${line%%=*}
    case "$key" in
      '' | [0-9]* | *[!A-Za-z0-9_]*) continue ;;
    esac
    value=${line#*=}
    case "$value" in
      \"*\") value=${value#\"}; value=${value%\"} ;;
      \'*\') value=${value#\'}; value=${value%\'} ;;
    esac
    export "$key=$value"
  done < "$1"
}
