#!/usr/bin/env sh
# Выкладка новой версии: забрать код, собрать образы с тегом коммита, поднять.
#
#   ./deploy.sh
#
# Каждая выкладка дописывает свой тег в `.deploy-tags`. По нему `rollback.sh`
# возвращает предыдущую версию за полминуты, без сборки и без git.
set -eu
cd "$(dirname "$0")"

# Какой коммит выкладывать. Автовыкладка (.github/workflows/staging.yml)
# передаёт через SSH ровно тот коммит, что прошёл CI; руками — свежий main.
# Принимается только полный хэш, и только если он уже в origin/main.
TARGET=${SSH_ORIGINAL_COMMAND:-}
git -C .. fetch --quiet origin main
if [ -n "$TARGET" ]; then
  case "$TARGET" in *[!0-9a-f]*) echo "Не хэш коммита: отказ"; exit 1 ;; esac
  [ ${#TARGET} -eq 40 ] || { echo "Не хэш коммита: отказ"; exit 1; }
  git -C .. merge-base --is-ancestor "$TARGET" origin/main \
    || { echo "Коммита $TARGET нет в main: отказ"; exit 1; }
  git -C .. merge --ff-only "$TARGET"
else
  git -C .. merge --ff-only origin/main
fi
TAG=$(git -C .. rev-parse --short HEAD)

# Пароли базы кабинета: каких нет в .env — генерируются здесь, на сервере, и
# никуда не уходят. Уже заданные не трогаются: роли в базе созданы с ними.
# Без перевода строки в конце .env пароль приклеился бы к последней строке.
[ -z "$(tail -c1 .env)" ] || echo >> .env
chmod 600 .env
for v in SUPERUSER OWNER APP NOTIFIER; do
  grep -q "^PG_${v}_PASSWORD=." .env || echo "PG_${v}_PASSWORD=$(openssl rand -hex 32)" >> .env
done

# Копия базы перед выкладкой: новая версия может поменять её схему.
[ -f data/uklad.db ] && ./backup.sh

UKLAD_TAG=$TAG docker compose build
UKLAD_TAG=$TAG docker compose up -d
echo "$TAG" >> .deploy-tags

# Ждём, пока сервер ответит. Не ответил — сразу говорим, как откатиться.
for _ in $(seq 1 30); do
  if docker compose exec -T api wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo "Версия $TAG работает."
    # Помним последние пять выкладок — на них и можно откатиться.
    tail -n 5 .deploy-tags > .deploy-tags.tmp && mv .deploy-tags.tmp .deploy-tags
    exit 0
  fi
  sleep 2
done
echo "Версия $TAG не отвечает. Откат: ./rollback.sh"
exit 1
