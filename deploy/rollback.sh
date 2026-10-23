#!/usr/bin/env sh
# Откат на предыдущую выкладку одной командой.
#
#   ./rollback.sh          # на версию до текущей
#   ./rollback.sh a1b2c3d  # на конкретный тег из .deploy-tags
#
# Образы прошлых версий лежат на диске (тег = коммит), поэтому откат не
# собирает ничего заново. База не откатывается: если новая версия испортила
# данные, восстановите копию через restore.sh — её сделал deploy.sh.
set -eu
cd "$(dirname "$0")"

[ -f .deploy-tags ] || { echo "Нет .deploy-tags: выкладок через deploy.sh ещё не было"; exit 1; }
CURRENT=$(tail -n 1 .deploy-tags)
TARGET=${1:-$(tail -n 2 .deploy-tags | head -n 1)}
[ "$TARGET" != "$CURRENT" ] || { echo "Откатываться некуда: $CURRENT — единственная версия"; exit 1; }

docker image inspect "uklad-api:$TARGET" >/dev/null 2>&1 \
  || { echo "Образа версии $TARGET нет на диске"; exit 1; }

UKLAD_TAG=$TARGET docker compose up -d --no-build
echo "$TARGET" >> .deploy-tags
echo "Откатились с $CURRENT на $TARGET."
