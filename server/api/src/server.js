/**
 * Сервер Уклада на своей машине в РФ — замена облачной функции `server/leads`.
 *
 * Кирилл не хочет облака (решение 15.10): приёмник заявок живёт на своём
 * сервере, за Caddy, который отдаёт статику витрины и держит HTTPS. Поэтому
 * разбор заявки и письмо не переписаны, а взяты из `server/leads` как есть —
 * контракт с витриной один, и чинить его в двух местах нельзя.
 *
 * Что сверх облачной функции:
 *  - заявка сохраняется в SQLite до отправки письма: упала почта — заявка
 *    не пропала, её видно в базе (`mailed = 0`);
 *  - лимит частоты по IP и ловушка для ботов (аудит 21.10, п.4);
 *  - заявка вида `demo` с почтой получает в ответ персональную ссылку;
 *  - ежесуточная чистка: заявки старше `LEADS_RETENTION_DAYS` стираются;
 *  - у обращений в поддержку общий суточный потолок по числу и объёму:
 *    входа в кабинете на сервере пока нет, и лимит по IP не спасает от
 *    тысячи адресов. Упёрлись — `/api/health` говорит об этом сторожу.
 *
 * Маршруты:
 *   GET  /api/health      — жив ли сервер и база (для мониторинга)
 *   POST /api/leads       — заявка с формы (тело — `Lead` из `src/site/lib/leads.ts`)
 *   POST /api/support/reports — «Сообщить о проблеме» из кабинета (`src/lib/support/report.ts`)
 *   GET  /d/<токен>       — персональная демо-ссылка → кука-пропуск и кабинет
 *   GET  /api/demo/pass   — открыт ли этому браузеру демо-кабинет
 *   /api/auth/*, /api/staff/* — вход в кабинет (`cabinet/auth.js`), если
 *                           задан DATABASE_URL (Postgres, `server/db`)
 *   POST /api/company/lookup — реквизиты по ИНН (`cabinet/company.js`)
 *   /api/chat/*           — чат кабинета (`cabinet/chat.js`, `cabinet/telegram.js`)
 *   POST /api/telegram/webhook — обновления Телеграм-бота уведомлений
 *
 * Все настройки — переменными окружения, образец в `deploy/.env.example`.
 */
/* global require, module, process, console, Buffer, URL, setInterval */
/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const path = require("node:path");
const { parseLead, letterSubject, letterText } = require("../../leads/lead");
const { openDb } = require("./db");
const { createRateLimit, clientIp } = require("./rateLimit");
const { newToken, isToken, demoLetter } = require("./demo");
const { parseReport, scrubDeep } = require("./support");

const MAX_BODY_BYTES = 32 * 1024;
// Обращение несёт журнал и обезличенную копию склада — оно крупнее заявки.
// Предел тот же, что держит кабинет (`MAX_REPORT_BYTES`).
const MAX_REPORT_BYTES = 512 * 1024;
const DAY_MS = 86_400_000;

function readEnv(env) {
  const num = (name, fallback) => {
    const v = Number(env[name] ?? fallback);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} должно быть числом > 0`);
    return v;
  };
  return {
    port: num("PORT", 8080),
    dbFile: env.DB_FILE ?? "/data/uklad.db",
    publicUrl: (env.PUBLIC_URL ?? "https://u-klad.ru").replace(/\/+$/, ""),
    allowedOrigins: (env.ALLOWED_ORIGIN ?? env.PUBLIC_URL ?? "https://u-klad.ru")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    trustProxy: env.TRUST_PROXY === "1",
    retentionDays: num("LEADS_RETENTION_DAYS", 180),
    reportRetentionDays: num("REPORTS_RETENTION_DAYS", 90),
    reportsPerDay: num("REPORTS_PER_DAY", 500),
    reportsMbPerDay: num("REPORTS_MB_PER_DAY", 200),
    demoDays: num("DEMO_LINK_DAYS", 14),
    demoPerEmailPerDay: num("DEMO_PER_EMAIL_PER_DAY", 3),
    rateCapacity: num("RATE_LIMIT_BURST", 5),
    ratePerMinute: num("RATE_LIMIT_PER_MINUTE", 2),
    // Админка — свой порт и свой адрес. Без ADMIN_ORIGIN не запускается.
    adminPort: num("ADMIN_PORT", 8081),
    adminOrigin: (env.ADMIN_ORIGIN ?? "").replace(/\/+$/, ""),
  };
}

function cookieValue(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

function send(res, status, payload, headers = {}) {
  const body = payload === undefined ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Тело с пределом в байтах: длинное обрываем, не дочитывая. */
function readBody(req, max = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      resolve(result);
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        // Дочитываем вхолостую, не копя: оборванный приём клиент принял бы за
        // сбой сети, а не за отказ.
        chunks.length = 0;
        finish({ ok: false, error: "too_large" });
        return;
      }
      if (!done) chunks.push(chunk);
    });
    req.on("end", () => finish({ ok: true, text: Buffer.concat(chunks).toString("utf8") }));
    req.on("error", () => finish({ ok: false, error: "aborted" }));
  });
}

/** Письмо-копия обращения: что случилось, где, сколько ошибок, ссылка в админку. */
function reportLetter(id, report, adminOrigin) {
  const lines = [
    report.message,
    "",
    `Экран: ${report.view || "—"}`,
    `Ошибок в журнале: ${report.errors}`,
    `Копия данных склада: ${report.hasSnapshot ? "есть, в админке" : "нет"}`,
  ];
  if (adminOrigin) lines.push("", `В админке: ${adminOrigin}/support/${id}`);
  return {
    subject: `Обращение № ${id}${report.view ? ` · ${report.view}` : ""}`,
    text: lines.join("\n"),
  };
}

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const filled = (v) => typeof v === "string" && v.trim() !== "";
/** Человек не напишет, что случилось, быстрее чем за 2 секунды. */
const MIN_REPORT_MS = 2000;
const tooFast = (ms) => typeof ms === "number" && ms < MIN_REPORT_MS;

/**
 * Приложение без сети и почты внутри: их подают снаружи, чтобы тест мог
 * подменить письмо и базу в памяти, не трогая настоящий ящик.
 */
function createApp({ cfg, db, mail, cabinet = null, now = () => new Date(), log = console }) {
  const limiter = createRateLimit({
    capacity: cfg.rateCapacity,
    refillPerMinute: cfg.ratePerMinute,
  });

  async function handleLead(req, res) {
    const origin = (req.headers.origin ?? "").replace(/\/+$/, "");
    const allowed = cfg.allowedOrigins.includes(origin) ? origin : "";
    const cors = allowed ? corsHeaders(allowed) : {};

    if (req.method === "OPTIONS") return send(res, allowed ? 204 : 403, undefined, cors);
    if (req.method !== "POST") return send(res, 405, { ok: false }, cors);
    if (!allowed) {
      log.error("[uklad] заявка с чужого источника:", origin || "(пусто)");
      return send(res, 403, { ok: false });
    }
    if (!limiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { ...cors, "Retry-After": "60" });
    }

    const body = await readBody(req);
    if (!body.ok) return send(res, 413, { ok: false }, { ...cors, Connection: "close" });

    let raw;
    try {
      raw = JSON.parse(body.text);
    } catch {
      return send(res, 400, { ok: false }, cors);
    }

    // Ловушка для ботов: скрытое поле, которое человек не видит и не заполняет.
    // Боту отвечаем «принято», чтобы он не учился обходить.
    if (raw && typeof raw.website === "string" && raw.website.trim() !== "") {
      log.error("[uklad] заявка-ловушка отброшена");
      return send(res, 200, { ok: true }, cors);
    }

    const parsed = parseLead(raw);
    if (!parsed.ok) {
      log.error("[uklad] заявка не принята:", parsed.error);
      return send(res, 400, { ok: false }, cors);
    }
    // Слишком быстрая отправка (parseLead считает по `elapsed` из браузера):
    // отвечаем «принято», в базу и на почту не пускаем.
    if (parsed.bot) {
      log.error("[uklad] заявка отброшена: отправлена слишком быстро");
      return send(res, 200, { ok: true }, cors);
    }
    const { lead } = parsed;
    const t = now();
    const leadId = db.addLead(lead, t);

    try {
      await mail.sendLetter({
        subject: letterSubject(lead),
        text: letterText(lead),
        fields: lead.fields,
      });
      db.markMailed(leadId);
    } catch (error) {
      // Заявка уже в базе, но человек этого не знает — витрина покажет «не
      // вышло» и предложит письмо. Лучше дубль, чем потерянный клиент.
      log.error(`[uklad] письмо по заявке #${leadId} не ушло:`, error);
      return send(res, 502, { ok: false }, cors);
    }

    if (lead.kind === "demo") await sendDemo(lead, leadId, t);
    return send(res, 200, { ok: true }, cors);
  }

  /**
   * Демо-ссылка — дополнение к заявке, а не её условие: если письмо со ссылкой
   * не ушло, заявка у Кирилла уже есть, и он ответит руками.
   */
  async function sendDemo(lead, leadId, t) {
    const email = mail.replyTo(lead.fields);
    if (!email) return;
    const since = new Date(t.getTime() - DAY_MS).toISOString();
    if (db.demosSince(email, since) >= cfg.demoPerEmailPerDay) {
      log.error(`[uklad] демо по заявке #${leadId}: лимит писем на адрес`);
      return;
    }
    const token = newToken();
    db.addDemo({
      token,
      email,
      leadId,
      createdAt: t.toISOString(),
      expiresAt: new Date(t.getTime() + cfg.demoDays * DAY_MS).toISOString(),
    });
    const letter = demoLetter({
      lang: lead.lang,
      link: `${cfg.publicUrl}/d/${token}`,
      days: cfg.demoDays,
    });
    try {
      await mail.sendTo({ to: email, ...letter });
    } catch (error) {
      log.error(`[uklad] демо-письмо по заявке #${leadId} не ушло:`, error);
    }
  }

  /**
   * Обращение из кабинета. Кабинет живёт на том же домене, поэтому источник
   * проверяется тем же списком, что у заявок. Сессий пользователей на сервере
   * ещё нет: пока держимся на проверке источника, лимите частоты и пределе
   * размера. Когда появится вход, обращение привяжется к компании по сессии,
   * а не по тому, что пришло в теле.
   */
  /** Общий потолок обращений за сутки — поверх лимита по IP. */
  function reportsCapped() {
    const day = db.reportsLastDay(now());
    return day.count >= cfg.reportsPerDay || day.bytes >= cfg.reportsMbPerDay * 1024 * 1024;
  }

  async function handleReport(req, res) {
    const origin = (req.headers.origin ?? "").replace(/\/+$/, "");
    const allowed = cfg.allowedOrigins.includes(origin) ? origin : "";
    const cors = allowed ? corsHeaders(allowed) : {};

    if (req.method === "OPTIONS") return send(res, allowed ? 204 : 403, undefined, cors);
    if (req.method !== "POST") return send(res, 405, { ok: false }, cors);
    if (!allowed) {
      log.error("[uklad] обращение с чужого источника:", origin || "(пусто)");
      return send(res, 403, { ok: false });
    }
    if (!limiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { ...cors, "Retry-After": "60" });
    }
    if (reportsCapped()) {
      log.error("[uklad] суточный потолок обращений достигнут");
      return send(res, 429, { ok: false }, { ...cors, "Retry-After": "3600" });
    }
    const body = await readBody(req, MAX_REPORT_BYTES);
    if (!body.ok) return send(res, 413, { ok: false }, { ...cors, Connection: "close" });

    let raw;
    try {
      raw = JSON.parse(body.text);
    } catch {
      return send(res, 400, { ok: false }, cors);
    }
    // Та же ловушка, что у заявок: скрытое поле и слишком быстрая отправка.
    // Боту отвечаем «принято» с выдуманным номером, чтобы он не учился обходить.
    if (isObj(raw) && (filled(raw.website) || tooFast(raw.elapsedMs))) {
      log.error("[uklad] обращение-ловушка отброшено");
      return send(res, 200, { ok: true, id: 0 }, cors);
    }
    const parsed = parseReport(raw);
    if (!parsed.ok) {
      log.error("[uklad] обращение не принято:", parsed.error);
      return send(res, 400, { ok: false }, cors);
    }
    // В базу ложится тело после второй чистки — целиком, а не только
    // сообщение: обезличиванию в браузере сервер не верит.
    const rest = { ...raw };
    delete rest.website;
    delete rest.elapsedMs;
    const payload = JSON.stringify({ ...scrubDeep(rest), message: parsed.report.message });
    const id = db.addReport(parsed.report, payload, now());
    // Копия на почту — уведомление, а не второе хранилище: суть и ссылка в
    // админку. Копия данных склада остаётся только в базе и стирается там
    // сама через 90 дней; из почтового ящика её пришлось бы удалять руками.
    // Сбой письма человеку не показываем — обращение уже в базе.
    mail
      .sendLetter(reportLetter(id, parsed.report, cfg.adminOrigin))
      .catch((error) => log.error(`[uklad] письмо по обращению #${id} не ушло:`, error));
    return send(res, 200, { ok: true, id }, cors);
  }

  // Пропуск в демо — кука с тем же токеном, что в письме. Кабинет в сборке
  // с сервером без входа закрыт целиком (`App.tsx`), и открывает его только
  // ответ `GET /api/demo/pass`: ссылка на экран сама по себе демо не даёт.
  // Локально по http браузер не сохранит куку с `Secure` и `__Host-`.
  const demoLocal = !cfg.publicUrl.startsWith("https://");
  const DEMO_COOKIE = demoLocal ? "uklad_demo" : "__Host-uklad_demo";
  const demoAttrs = `Path=/; HttpOnly;${demoLocal ? "" : " Secure;"} SameSite=Lax`;

  /** Живая демо-ссылка по токену: есть в базе и срок не вышел. */
  function liveDemo(token, t) {
    const row = isToken(token) ? db.findDemo(token) : undefined;
    return row && row.expires_at >= t.toISOString() ? row : undefined;
  }

  function handleDemo(req, res, token) {
    const t = now();
    const row = liveDemo(token, t);
    if (!row) {
      return send(res, 302, undefined, {
        Location: "/?demo=expired#demo",
        "Set-Cookie": `${DEMO_COOKIE}=; ${demoAttrs}; Max-Age=0`,
      });
    }
    db.openDemo(token, t);
    const left = Math.max(1, Math.floor((Date.parse(row.expires_at) - t.getTime()) / 1000));
    return send(res, 302, undefined, {
      Location: "/app/",
      "Set-Cookie": `${DEMO_COOKIE}=${token}; ${demoAttrs}; Max-Age=${left}`,
    });
  }

  /** Есть ли у браузера живой пропуск в демо. Сам токен наружу не отдаём. */
  function handleDemoPass(req, res) {
    const row = liveDemo(cookieValue(req, DEMO_COOKIE), now());
    if (!row) return send(res, 200, { ok: false });
    return send(res, 200, { ok: true, until: row.expires_at });
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://local");
      if (url.pathname === "/api/health" && req.method === "GET") {
        // Флаг читает сторож (`deploy/watchdog.sh`) и пишет в Telegram.
        return send(res, 200, { ok: true, reportsCapped: reportsCapped() });
      }
      if (url.pathname === "/api/leads") return await handleLead(req, res);
      if (url.pathname === "/api/support/reports") return await handleReport(req, res);
      const demo = /^\/d\/([^/]+)\/?$/.exec(url.pathname);
      if (demo && req.method === "GET") return handleDemo(req, res, demo[1]);
      if (url.pathname === "/api/demo/pass" && req.method === "GET") {
        return handleDemoPass(req, res);
      }
      if (cabinet && (await cabinet.handle(req, res, url))) return;
      // Кабинет без базы не работает: честный 503, а не «нет такого адреса».
      if (!cabinet && /^\/api\/(auth|staff|chat|telegram|cabinet|company)\//.test(url.pathname)) {
        return send(res, 503, { ok: false });
      }
      return send(res, 404, { ok: false });
    } catch (error) {
      log.error("[uklad] сбой обработчика:", error);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
  };
}

function main() {
  const cfg = readEnv(process.env);
  // Почта читает свои переменные при первом письме — проверим их на старте,
  // чтобы сервер не встал молча без SMTP.
  for (const name of ["SMTP_USER", "SMTP_PASSWORD", "MAIL_TO"]) {
    if (!process.env[name]) throw new Error(`не задана переменная окружения ${name}`);
  }
  const db = openDb(path.resolve(cfg.dbFile));
  const mail = require("../../leads/mail");
  // Кабинет — Postgres. Подключение под ролью приложения (uklad_app): без
  // BYPASSRLS, без DELETE (server/db/README.md).
  let cabinet = null;
  let pool = null;
  let notifierPool = null;
  if (process.env.DATABASE_URL) {
    const pg = require("pg");
    const { createAuth } = require("./cabinet/auth");
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
    // Обрыв простаивающего соединения не должен ронять процесс.
    pool.on("error", (e) => console.error("[uklad] база:", e.message));
    const auth = createAuth({ pool, cfg, send, readBody, log: console, mail });
    auth.purge();
    setInterval(auth.purge, DAY_MS).unref();
    // Чат: без CENTRIFUGO_* работает, только кабинет сам перечитывает ленту.
    const { createChat } = require("./cabinet/chat");
    const { createRealtime } = require("./cabinet/realtime");
    const realtime = createRealtime({
      apiUrl: process.env.CENTRIFUGO_API_URL,
      apiKey: process.env.CENTRIFUGO_API_KEY,
      tokenSecret: process.env.CENTRIFUGO_TOKEN_SECRET,
      log: console,
    });
    const chat = createChat({ auth, realtime, send, log: console });
    // Телеграм-бот и письма о непрочитанном. Без TELEGRAM_* бот молчит,
    // письма работают на той же почте, что и заявки.
    const { createTelegram, createTelegramApi } = require("./cabinet/telegram");
    const { createNotifier } = require("./cabinet/notify");
    const tgApi = createTelegramApi({ token: process.env.TELEGRAM_BOT_TOKEN, log: console });
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    // Рассылка и вебхук бота — своим подключением под ролью uklad_notifier:
    // у роли приложения их функций нет (init.sql, 007).
    if (process.env.NOTIFIER_DATABASE_URL) {
      notifierPool = new pg.Pool({ connectionString: process.env.NOTIFIER_DATABASE_URL, max: 2 });
      notifierPool.on("error", (e) => console.error("[uklad] база рассылки:", e.message));
    } else {
      console.log("[uklad] рассылка выключена: не задан NOTIFIER_DATABASE_URL");
    }
    const telegram = createTelegram({
      notifierPool,
      auth,
      api: tgApi,
      botName: process.env.TELEGRAM_BOT_NAME,
      webhookSecret,
      send,
      readBody,
      log: console,
    });
    if (notifierPool) {
      if (tgApi.enabled && webhookSecret) {
        tgApi.setWebhook(`${cfg.publicUrl}/api/telegram/webhook`, webhookSecret);
      }
      createNotifier({
        pool: notifierPool,
        telegram: tgApi,
        mail,
        appUrl: `${cfg.publicUrl}/app/`,
        log: console,
      }).start();
    }
    const { createSnapshot } = require("./cabinet/snapshot");
    const snapshot = createSnapshot({ auth, send, log: console });
    // Реквизиты по ИНН: без DADATA_API_KEY маршрут отвечает 503, профиль
    // сохраняет ИНН и пишет, что справочник не подключён.
    const { createCompanyLookup } = require("./cabinet/company");
    const company = createCompanyLookup({
      auth,
      send,
      log: console,
      token: process.env.DADATA_API_KEY,
    });
    cabinet = {
      handle: async (req, res, url) =>
        (await auth.handle(req, res, url)) ||
        (await snapshot.handle(req, res, url)) ||
        (await company.handle(req, res, url)) ||
        (await chat.handle(req, res, url)) ||
        (await telegram.handle(req, res, url)),
    };
  } else {
    console.log("[uklad] кабинет выключен: не задан DATABASE_URL");
  }
  const server = http.createServer(createApp({ cfg, db, mail, cabinet }));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  const purge = () => {
    const gone = db.purge(new Date(), cfg.retentionDays, cfg.reportRetentionDays);
    if (gone.leads || gone.demos || gone.reports) console.log("[uklad] чистка:", gone);
  };
  purge();
  setInterval(purge, DAY_MS).unref();

  server.listen(cfg.port, () => console.log(`[uklad] сервер слушает порт ${cfg.port}`));

  // Админка на отдельном порту: наружу он открыт только на 127.0.0.1
  // сервера, вход — SSH-туннелем (deploy/admin-tunnel.sh).
  let admin;
  if (cfg.adminOrigin.startsWith("https://")) {
    const { createAdminApp } = require("./admin/app");
    admin = http.createServer(createAdminApp({ cfg, db: db.raw }));
    admin.requestTimeout = 15_000;
    admin.headersTimeout = 10_000;
    admin.listen(cfg.adminPort, () => console.log(`[uklad] админка слушает порт ${cfg.adminPort}`));
  } else {
    console.log("[uklad] админка выключена: не задан ADMIN_ORIGIN (https://…)");
  }

  const stop = () => {
    admin?.close();
    server.close(() => (db.close(), pool?.end(), notifierPool?.end(), process.exit(0)));
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (require.main === module) main();

module.exports = { createApp, readEnv, send, readBody };
