#!/usr/bin/env sh
# Резервные копии: база заявок (SQLite) и база кабинета (Postgres) → gzip →
# (по желанию) шифрование, другая машина и S3. Запускается cron'ом раз в сутки, см. README.md, шаг «Бэкапы».
#
# Коды выхода: 0 — всё сделано; 3 — копии сделаны, но в S3 не ушли (выкладка
# из-за этого не останавливается, ночная обёртка шлёт письмо); прочие — сбой.
#
# Снимок делается через `VACUUM INTO`, а не копированием файла: база в режиме
# WAL, и простой `cp` во время записи может унести половину транзакции.
set -eu

cd "$(dirname "$0")"
# shellcheck disable=SC1091
. ./env.sh
load_env .env

BACKUP_DIR=${BACKUP_DIR:-/var/backups/uklad}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-30}
STAMP=$(date +%Y-%m-%d-%H%M)
NAME="uklad-$STAMP.db"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# --- S3 (второе место копий, аудит запуска п.5) ---
# Ключ — в отдельном файле вне репозитория и вне .env (права 600):
# S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY. Файла нет —
# шаг пропускается. Нужен curl ≥ 7.75 (--aws-sigv4), ставить ничего не надо.
# Ключ передаётся curl через stdin: в списке процессов его не видно.
S3_CONFIG=${S3_CONFIG:-$HOME/.uklad-s3}
[ -f "$S3_CONFIG" ] && load_env "$S3_CONFIG"
S3_FAILED=0
s3_put() {
  [ -n "${S3_BUCKET:-}" ] || return 0
  # Открытую копию в чужое облако не отдаём: только зашифрованную.
  case "$1" in *.age) ;; *) echo "S3: $1 не зашифрован, не отправлен" >&2; S3_FAILED=1; return 0 ;; esac
  url="${S3_ENDPOINT%/}/$S3_BUCKET/backups/$(basename "$1")"
  for try in 1 2 3; do
    if printf 'user = "%s:%s"\n' "$S3_ACCESS_KEY" "$S3_SECRET_KEY" |
      curl -sS -f -K - --aws-sigv4 "aws:amz:$S3_REGION:s3" --retry 2 \
        -T "$1" "$url" -o /dev/null; then
      echo "S3: отправлено $(basename "$1") ($(wc -c < "$1") байт)"
      return 0
    fi
    [ "$try" -lt 3 ] && sleep 30
  done
  echo "S3: $(basename "$1") не ушёл после 3 попыток" >&2
  S3_FAILED=1
}

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
s3_put "$FILE"

# Старые копии — только свои, по имени, и только в папке копий.
find "$BACKUP_DIR" -maxdepth 1 -name 'uklad-*.db.gz*' -mtime +"$BACKUP_KEEP_DAYS" -delete

# --- База кабинета (Postgres) ---
# pg_dump внутри контейнера db: снимок целостный, писать в базу он не мешает.
# Нет сервиса db (кабинет ещё не включён) — пропускаем.
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  # В копии кабинета — почты, имена и хэши паролей всех компаний. На другую
  # машину она уходит только зашифрованной.
  if [ -n "${BACKUP_REMOTE:-}" ] && [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
    echo "Копия кабинета не отправлена: задан BACKUP_REMOTE, но нет BACKUP_AGE_RECIPIENT" >&2
    exit 1
  fi
  # Сначала в файл, потом gzip: в конвейере `pg_dump | gzip` сбой дампа
  # потерялся бы, и в копиях лежал бы обрезанный файл.
  PG_FILE="$BACKUP_DIR/uklad-pg-$STAMP.sql"
  docker compose exec -T db pg_dump -U postgres uklad > "$PG_FILE"
  gzip -9 "$PG_FILE"
  PG_FILE="$PG_FILE.gz"
  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    age -r "$BACKUP_AGE_RECIPIENT" -o "$PG_FILE.age" "$PG_FILE"
    rm -f "$PG_FILE"
    PG_FILE="$PG_FILE.age"
  fi
  chmod 600 "$PG_FILE"
  echo "Копия кабинета: $PG_FILE"
  if [ -n "${BACKUP_REMOTE:-}" ]; then
    rsync -a "$PG_FILE" "$BACKUP_REMOTE/"
  fi
  s3_put "$PG_FILE"
  find "$BACKUP_DIR" -maxdepth 1 -name 'uklad-pg-*.sql.gz*' -mtime +"$BACKUP_KEEP_DAYS" -delete
fi

# Старые копии в S3 удаляет правило жизненного цикла бакета (30 дней),
# не этот скрипт: у ключа на сервере должно быть как можно меньше власти.
[ "$S3_FAILED" -eq 0 ] || exit 3
