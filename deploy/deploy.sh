#!/usr/bin/env sh
# Выкладка новой версии: забрать код, собрать образы с тегом коммита, поднять.
#
#   ./deploy.sh
#
# Каждая выкладка дописывает свой тег в `.deploy-tags`. По нему `rollback.sh`
# возвращает предыдущую версию за полминуты, без сборки и без git.
set -eu
cd "$(dirname "$0")"

git -C .. pull --ff-only
TAG=$(git -C .. rev-parse --short HEAD)

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
