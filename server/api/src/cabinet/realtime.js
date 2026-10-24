/**
 * Доставка в реальном времени через Centrifugo (решение 21.10, MIT, ставится
 * одной программой рядом с сервером).
 *
 * Centrifugo здесь только «звонок в дверь»: в канал уходит, ЧТО изменилось
 * (`{ type, conversationId }`), а не текст сообщения. Кабинет, услышав звонок,
 * перечитывает ленту обычным запросом к API — и видит ровно то, что ему
 * разрешает RLS. Так права решает одно место, а не два, и в Centrifugo нет
 * переписки, которую пришлось бы защищать и стирать отдельно.
 *
 * Канал у каждого сотрудника свой: `personal:#<memberId>`. Решётка в имени —
 * правило Centrifugo «подписаться может только этот пользователь», поэтому
 * чужой канал не откроешь, даже зная его имя.
 *
 * Без настроек (`CENTRIFUGO_API_URL` пуст) модуль молчит, а кабинет
 * перечитывает ленту сам раз в несколько секунд: чат работает, только медленнее.
 */
/* global require, module, fetch, Buffer, AbortSignal */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHmac } = require("node:crypto");

// Подключение живёт сутки; кабинет просит новый токен сам, когда старый истёк.
const TOKEN_TTL_S = 24 * 3600;

const b64url = (v) =>
  Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

/** Канал сотрудника. Одна строка на весь сервер, чтобы имя не разъехалось. */
const personalChannel = (memberId) => `personal:#${memberId}`;

function createRealtime({ apiUrl, apiKey, tokenSecret, log, now = () => Date.now() }) {
  const enabled = Boolean(apiUrl && apiKey && tokenSecret);

  /**
   * Токен подключения к Centrifugo (JWT HS256). `sub` — сотрудник: по нему
   * Centrifugo пускает в личный канал. Компании в токене нет: её решает API.
   */
  function connectionToken(memberId) {
    if (!enabled) return null;
    const exp = Math.floor(now() / 1000) + TOKEN_TTL_S;
    const head = b64url({ alg: "HS256", typ: "JWT" });
    const body = b64url({ sub: memberId, exp });
    const sig = createHmac("sha256", tokenSecret).update(`${head}.${body}`).digest("base64url");
    return { token: `${head}.${body}.${sig}`, expiresAt: exp * 1000 };
  }

  /**
   * Позвонить участникам. Сбой Centrifugo не отменяет отправку: сообщение уже
   * в базе, а кабинет всё равно перечитает ленту при следующем открытии.
   */
  async function notify(memberIds, data) {
    if (!enabled || memberIds.length === 0) return;
    try {
      const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/api/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify({ channels: memberIds.map(personalChannel), data }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) log.error(`[uklad] centrifugo: ${res.status}`);
    } catch (err) {
      log.error("[uklad] centrifugo недоступен:", err.message);
    }
  }

  return { enabled, connectionToken, notify };
}

module.exports = { createRealtime, personalChannel };
