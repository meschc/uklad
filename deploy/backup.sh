#!/usr/bin/env sh
# Резервная копия базы заявок: снимок SQLite → gzip → (по желанию) на другую
# машину. Запускается cron'ом раз в сутки, см. README.md, шаг «Бэкапы».
#
# Снимок делается через `VACUUM INTO`, а не копированием файла: база в режиме
# WAL, и простой `cp` во время записи может унести половину транзакции.
set -eu

cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f .env ] && . ./.env

BACKUP_DIR=${BACKUP_DIR:-/var/backups/uklad}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
STAMP=$(date +%Y-%m-%d-%H%M)
NAME="uklad-$STAMP.db"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Снимок внутри контейнера (там есть Node с SQLite), в его же том /data.
docker compose exec -T api node -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync('/data/uklad.db');
  db.exec(\"VACUUM INTO '/data/$NAME'\");
  db.close();
"
mv "data/$NAME" "$BACKUP_DIR/$NAME"
gzip -9 "$BACKUP_DIR/$NAME"
FILE="$BACKUP_DIR/$NAME.gz"
# В копии персональные данные: если задан ключ, шифруем, и открытый файл
# не остаётся ни здесь, ни на удалённой машине.
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$FILE.age" "$FILE"
  rm -f "$FILE"
  FILE="$FILE.age"
fi
chmod 600 "$FILE"
echo "Копия: $FILE"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a "$FILE" "$BACKUP_REMOTE/"
  echo "Отправлено: $BACKUP_REMOTE"
fi

# Старые копии — только свои, по имени, и только в папке копий.
find "$BACKUP_DIR" -maxdepth 1 -name 'uklad-*.db.gz*' -mtime +"$BACKUP_KEEP_DAYS" -delete
