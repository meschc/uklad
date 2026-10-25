#!/usr/bin/env sh
# Восстановление базы из копии.
#
#   ./restore.sh /var/backups/uklad/uklad-2026-11-01-0300.db.gz
#
# Текущая база не стирается: она переименовывается рядом с отметкой времени,
# и откатить восстановление можно, вернув её имя обратно.
set -eu

cd "$(dirname "$0")"
SRC=${1:?укажите файл копии: ./restore.sh путь/uklad-....db.gz}
[ -f "$SRC" ] || { echo "Нет файла $SRC"; exit 1; }

STAMP=$(date +%Y-%m-%d-%H%M%S)
printf 'Сервер заявок остановится на минуту. Текущая база сохранится как data/uklad.db.before-%s. Продолжить? [y/N] ' "$STAMP"
read -r ok
[ "$ok" = "y" ] || { echo "Отменено"; exit 1; }

docker compose stop api
[ -f data/uklad.db ] && mv data/uklad.db "data/uklad.db.before-$STAMP"
rm -f data/uklad.db-wal data/uklad.db-shm
gunzip -c "$SRC" > data/uklad.db
# Сервер в контейнере работает от пользователя node (uid 1000), не от root.
chown 1000:1000 data/uklad.db
docker compose start api
echo "Готово. Проверьте: curl -s https://\$SITE_DOMAIN/api/health"
