#!/usr/bin/env sh
# Сторож: раз в 5 минут из cron проверяет сайт и диск и пишет в Telegram,
# если что-то не так. Внешняя проверка (UptimeRobot) остаётся: сторож на
# самом сервере молчит, когда сервер выключен целиком.
#
#   */5 * * * * /home/kir/uklad/deploy/watchdog.sh
#
# В `.env`: TG_BOT_TOKEN (бот от @BotFather) и TG_CHAT_ID (ваш чат с ботом).
set -eu
cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f .env ] && . ./.env

DISK_LIMIT=${DISK_ALERT_PERCENT:-80}
STATE=.watchdog-state
problems=""

if ! health=$(curl -fsS -m 10 "https://${SITE_DOMAIN}/api/health" 2>/dev/null); then
  problems="${problems}Сайт не отвечает: https://${SITE_DOMAIN}/api/health\n"
elif echo "$health" | grep -q '"reportsCapped":true'; then
  # Сервер упёрся в суточный потолок обращений (REPORTS_PER_DAY /
  # REPORTS_MB_PER_DAY): это или наплыв ошибок, или кто-то льёт мусор.
  problems="${problems}Обращения в поддержку не принимаются: суточный потолок\n"
fi

used=$(df -P / | awk 'NR==2 { gsub("%", "", $5); print $5 }')
if [ "$used" -ge "$DISK_LIMIT" ]; then
  problems="${problems}Диск занят на ${used}% (порог ${DISK_LIMIT}%)\n"
fi

# Пишем только при смене состояния: одна тревога и одно «всё снова в порядке»,
# а не сообщение каждые 5 минут.
prev=$(cat "$STATE" 2>/dev/null || echo ok)
now=$([ -n "$problems" ] && echo bad || echo ok)
[ "$prev" = "$now" ] && exit 0
echo "$now" > "$STATE"

text=$([ "$now" = bad ] && printf "Уклад: проблема\n%b" "$problems" || echo "Уклад: снова в порядке")
if [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ]; then
  # Адрес с токеном идёт через stdin (`-K -`), а не аргументом: аргументы
  # видны всем пользователям сервера в `ps`.
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TG_BOT_TOKEN" |
    curl -fsS -m 10 -K - --data-urlencode "chat_id=${TG_CHAT_ID}" \
      --data-urlencode "text=${text}" >/dev/null
else
  echo "$text"
fi
