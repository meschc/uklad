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
 *  - ежесуточная чистка: заявки старше `LEADS_RETENTION_DAYS` стираются.
 *
 * Маршруты:
 *   GET  /api/health      — жив ли сервер и база (для мониторинга)
 *   POST /api/leads       — заявка с формы (тело — `Lead` из `src/site/lib/leads.ts`)
 *   GET  /d/<токен>       — персональная демо-ссылка → кабинет
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

const MAX_BODY_BYTES = 32 * 1024;
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
    demoDays: num("DEMO_LINK_DAYS", 14),
    demoPerEmailPerDay: num("DEMO_PER_EMAIL_PER_DAY", 3),
    rateCapacity: num("RATE_LIMIT_BURST", 5),
    ratePerMinute: num("RATE_LIMIT_PER_MINUTE", 2),
  };
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
function readBody(req) {
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
      if (size > MAX_BODY_BYTES) {
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

/**
 * Приложение без сети и почты внутри: их подают снаружи, чтобы тест мог
 * подменить письмо и базу в памяти, не трогая настоящий ящик.
 */
function createApp({ cfg, db, mail, now = () => new Date(), log = console }) {
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

  function handleDemo(req, res, token) {
    const row = isToken(token) ? db.findDemo(token) : undefined;
    const t = now();
    if (!row || row.expires_at < t.toISOString()) {
      return send(res, 302, undefined, { Location: "/?demo=expired" });
    }
    db.openDemo(token, t);
    return send(res, 302, undefined, { Location: "/app/" });
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://local");
      if (url.pathname === "/api/health" && req.method === "GET") {
        return send(res, 200, { ok: true });
      }
      if (url.pathname === "/api/leads") return await handleLead(req, res);
      const demo = /^\/d\/([^/]+)\/?$/.exec(url.pathname);
      if (demo && req.method === "GET") return handleDemo(req, res, demo[1]);
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
  const server = http.createServer(createApp({ cfg, db, mail }));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  const purge = () => {
    const gone = db.purge(new Date(), cfg.retentionDays);
    if (gone.leads || gone.demos) console.log("[uklad] чистка:", gone);
  };
  purge();
  setInterval(purge, DAY_MS).unref();

  server.listen(cfg.port, () => console.log(`[uklad] сервер слушает порт ${cfg.port}`));
  const stop = () => server.close(() => (db.close(), process.exit(0)));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

if (require.main === module) main();

module.exports = { createApp, readEnv };
