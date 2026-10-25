/**
 * Телеграм-бот уведомлений о сообщениях (план чата к запуску: бот вместо
 * push, пока нет приложения на телефон и ТСД).
 *
 * Привязка без ввода номеров и кодов руками:
 *   1. в кабинете «Подключить Телеграм» → POST /api/chat/telegram/link
 *      выдаёт ссылку t.me/<бот>?start=<код> (код одноразовый, 10 минут);
 *   2. человек открывает её, Телеграм шлёт боту «/start <код>»;
 *   3. вебхук находит код (`auth.telegram_bind`) и запоминает чат.
 * Код в базе хранится хэшем, ссылка из чужого Телеграма бесполезна через
 * десять минут или после первого нажатия.
 *
 * Вебхук принимает только запросы с секретом, который сервер сам отдал
 * Телеграму при `setWebhook` (заголовок X-Telegram-Bot-Api-Secret-Token):
 * без него любой мог бы прислать «/start» с чужим кодом от имени любого чата.
 *
 * Текст уходит без разметки (parse_mode не задан): в сообщении склада может
 * быть что угодно, и разметка из него не должна стать разметкой бота.
 *
 * Маршруты:
 *   GET  /api/chat/telegram         — привязан ли Телеграм, настроен ли бот
 *   POST /api/chat/telegram/link    — одноразовая ссылка на бота
 *   POST /api/chat/telegram/unlink  — отвязать
 *   POST /api/telegram/webhook      — обновления от Телеграма
 */
/* global require, module, fetch, AbortSignal, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes, createHash, timingSafeEqual } = require("node:crypto");

const CODE_TTL = "10 minutes";
// Обновление от Телеграма — одно сообщение; больше не бывает.
const MAX_UPDATE_BYTES = 64 * 1024;

const sha256 = (s) => createHash("sha256").update(s).digest();

/** Клиент Bot API: только отправка. Без токена молчит. */
function createTelegramApi({ token, log }) {
  const enabled = Boolean(token);

  /**
   * `blocked` — человек заблокировал бота или удалил чат (403): слать туда
   * больше нечего, привязку надо снять. Прочие сбои — повторим позже.
   */
  async function sendMessage(chatId, text) {
    if (!enabled) return { ok: false, blocked: false };
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { ok: true, blocked: false };
      if (res.status === 403) return { ok: false, blocked: true };
      log.error(`[uklad] telegram: ${res.status}`);
    } catch (err) {
      log.error("[uklad] telegram недоступен:", err.message);
    }
    return { ok: false, blocked: false };
  }

  /**
   * Сказать Телеграму, куда слать обновления, — при каждом старте сервера:
   * сменили домен или секрет — бот подхватит без ручных шагов.
   */
  async function setWebhook(url, secret) {
    if (!enabled) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) log.error(`[uklad] telegram setWebhook: ${res.status}`);
      return res.ok;
    } catch (err) {
      log.error("[uklad] telegram setWebhook:", err.message);
      return false;
    }
  }

  return { enabled, sendMessage, setWebhook };
}

function sameSecret(got, want) {
  const a = Buffer.from(String(got ?? ""));
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * `notifierPool` — подключение под ролью `uklad_notifier` (init.sql): вебхук
 * работает без сессии, и привязка чата идёт не от роли приложения.
 */
function createTelegram({ notifierPool, auth, api, botName, webhookSecret, send, readBody, log }) {
  const { withSession, readJson } = auth;
  const ready = api.enabled && Boolean(botName && webhookSecret && notifierPool);

  /** От имени вошедшего с правом на чат. */
  async function run(req, res, fn) {
    const out = await withSession(req, async (c, ctx) =>
      ctx.can("chat.use") ? fn(c, ctx) : { status: 403 },
    );
    if (!out) return send(res, 401, { ok: false });
    return send(res, out.status, { ok: out.status < 400, ...out.body });
  }

  const status = (req, res) =>
    run(req, res, async (c) => {
      const { rows } = await c.query(`SELECT auth.telegram_linked() AS linked`);
      return { status: 200, body: { available: ready, linked: rows[0].linked } };
    });

  async function link(req, res) {
    if (!(await readJson(req, res))) return;
    if (!ready) return send(res, 503, { ok: false, error: "telegram_off" });
    return run(req, res, async (c) => {
      const code = randomBytes(24).toString("base64url");
      const { rows } = await c.query(`SELECT auth.telegram_code($1, $2::interval) AS exp`, [
        sha256(code),
        CODE_TTL,
      ]);
      return {
        status: 200,
        body: { url: `https://t.me/${botName}?start=${code}`, expiresAt: rows[0].exp },
      };
    });
  }

  async function unlink(req, res) {
    if (!(await readJson(req, res))) return;
    return run(req, res, async (c) => {
      await c.query(`SELECT auth.telegram_unbind()`);
      return { status: 200, body: { linked: false } };
    });
  }

  /** Ответ человеку в чате бота. Сбой ответа обновление не отменяет. */
  const reply = (chatId, text) => api.sendMessage(chatId, text);

  async function webhook(req, res) {
    if (!ready || !sameSecret(req.headers["x-telegram-bot-api-secret-token"], webhookSecret)) {
      return send(res, 403, { ok: false });
    }
    const body = await readBody(req, MAX_UPDATE_BYTES);
    let update = null;
    try {
      update = body.ok ? JSON.parse(body.text) : null;
    } catch {
      // ниже — ответ 200: Телеграм повторял бы плохое обновление без конца
    }
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    if (!Number.isSafeInteger(chatId) || msg.chat.type !== "private") {
      return send(res, 200, { ok: true });
    }
    const text = typeof msg.text === "string" ? msg.text.trim() : "";
    const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})$/.exec(text);
    if (start) {
      const { rows } = await notifierPool.query(`SELECT * FROM auth.telegram_bind($1, $2)`, [
        sha256(start[1]),
        chatId,
      ]);
      const who = rows[0];
      await reply(
        chatId,
        who
          ? `Готово. Сюда будут приходить сообщения из чатов Уклада для «${who.member_name ?? "сотрудник"}» (${who.org_name}). Отключить — /stop или в профиле кабинета.`
          : "Ссылка устарела или уже использована. Откройте в кабинете «Профиль → Уведомления» и подключите Телеграм ещё раз.",
      );
    } else if (/^\/stop(?:@\w+)?$/.test(text)) {
      await notifierPool.query(`SELECT auth.telegram_forget($1)`, [chatId]);
      await reply(chatId, "Уведомления отключены. Подключить снова можно в профиле кабинета.");
    } else {
      await reply(
        chatId,
        "Это бот уведомлений Уклада: он присылает новые сообщения из чатов кабинета. Подключение — в кабинете, «Профиль → Уведомления».",
      );
    }
    return send(res, 200, { ok: true });
  }

  const routes = {
    "GET /api/chat/telegram": status,
    "POST /api/chat/telegram/link": link,
    "POST /api/chat/telegram/unlink": unlink,
    "POST /api/telegram/webhook": webhook,
  };

  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой телеграма:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createTelegram, createTelegramApi, sha256 };
