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
grep -qx "$TARGET" .deploy-tags || { echo "Тега $TARGET нет в .deploy-tags"; exit 1; }

docker image inspect "uklad-api:$TARGET" >/dev/null 2>&1 \
  || { echo "Образа версии $TARGET нет на диске"; exit 1; }

UKLAD_TAG=$TARGET docker compose up -d --no-build
# Список — стопка: всё новее TARGET снимается. Так повторный `./rollback.sh`
# идёт дальше назад, а не возвращает на версию, с которой только что ушли.
awk -v t="$TARGET" '{ print } $0 == t { exit }' .deploy-tags > .deploy-tags.tmp
mv .deploy-tags.tmp .deploy-tags
echo "Откатились с $CURRENT на $TARGET."
