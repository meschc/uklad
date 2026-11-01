#!/usr/bin/env bash
# Админка Уклада через SSH-туннель (deploy/README.md, «Админка»).
#
# В интернет админка не выходит: на сервере её порт слушает только 127.0.0.1.
# Скрипт пробрасывает его на этот компьютер и открывает в браузере. Пускает
# SSH-ключ, а не IP, поэтому работает из любой сети.
#
#   deploy/admin-tunnel.sh [хост]   открыть (хост — псевдоним из ~/.ssh/config, по умолчанию uklad)
#   deploy/admin-tunnel.sh --close  закрыть туннель
set -euo pipefail

PORT=8081
URL="http://localhost:${PORT}/"
FORWARD="${PORT}:127.0.0.1:${PORT}"

if [ "${1:-}" = "--close" ]; then
  pkill -f "ssh .*-L ${FORWARD}" && echo "Туннель закрыт." || echo "Туннель не был открыт."
  exit 0
fi

HOST="${1:-uklad}"
if lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Порт ${PORT} уже слушается — туннель, похоже, открыт."
else
  # -f -N: уйти в фон после входа, без команды на сервере.
  # ExitOnForwardFailure: не делать вид, что всё хорошо, если порт не пробросился.
  ssh -f -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L "${FORWARD}" "${HOST}"
  echo "Туннель к ${HOST} открыт. Закрыть: $0 --close"
fi

if command -v open >/dev/null 2>&1; then
  open "${URL}"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "${URL}" >/dev/null 2>&1
else
  echo "Откройте ${URL}"
fi
