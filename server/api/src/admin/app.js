/**
 * Админка Уклада — внутренняя панель владельца.
 *
 * Слушает свой порт (`ADMIN_PORT`) только на самом сервере: Caddy её не
 * отдаёт, в интернет она не выходит, вход — SSH-туннелем
 * (`deploy/admin-tunnel.sh`). С сайта и из `/api/*` до админки не достучаться.
 *
 * Здесь — вход, сессия и проверка каждого запроса. Сами экраны — `routes.js`.
 *
 * Защита, по порядку:
 *  - регистрации нет: владельца создаёт `cli.js` на самом сервере;
 *  - вход одним шагом — почта, пароль и код из приложения вместе; ответ на
 *    любую ошибку одинаковый, чтобы не подсказывать, что именно неверно;
 *  - 5 неудач с адреса закрывают вход с него на 15 минут, 20 подряд —
 *    аккаунт целиком; плюс лимит частоты по IP;
 *  - сессия: 12 часов максимум и час без действий; кука `__Host-` с
 *    HttpOnly, Secure, SameSite=Strict, в базе — только хэш токена;
 *  - каждая форма несёт токен CSRF сессии, а POST с чужим Origin отбрасывается;
 *  - CSP запрещает любые скрипты и встраивание страницы в чужой фрейм;
 *  - каждое действие пишется в журнал, который нельзя править.
 *
 * Локальная копия (`dev.js`) работает по http://localhost: только там кука
 * без `Secure` и без префикса `__Host-` — браузер иначе её не сохранит.
 */
/* global require, module, Buffer, URL, URLSearchParams, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { adminStore, sha256 } = require("./store");
const { checkPassword } = require("./password");
const totp = require("./totp");
const views = require("./views");
const { createRoutes } = require("./routes");
const { createRateLimit, clientIp } = require("../rateLimit");

const MAX_FORM_BYTES = 16 * 1024;
const SESSION_MS = 12 * 3_600_000;
const IDLE_MS = 3_600_000;
// Неудачи считаются в двух местах. С одного адреса — 5 за 15 минут: так
// чужой не переберёт пароль. Аккаунт целиком закрывается только после 20:
// иначе любой запер бы владельца пятью нарочно неверными попытками.
const IP_LOCK_AFTER = 5;
const LOCK_AFTER = 20;
const LOCK_MS = 15 * 60_000;
// Ссылка сброса живёт сутки. ТРЕБОВАНИЕ к входу кабинета, когда он переедет на
// сервер: токен гаснет при первом использовании (`used_at`), а все сессии
// аккаунта при этом удаляются — не только по сроку и не только новой ссылкой.
const RESET_MS = 24 * 3_600_000;

// Пустой запуск scrypt для неизвестной почты: время ответа не выдаёт,
// есть ли такой админ.
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  // same-origin, а не no-referrer: при no-referrer браузер шлёт форму с
  // `Origin: null`, и проверка источника отбрасывает вход.
  "Referrer-Policy": "same-origin",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function readForm(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (v) => {
      if (!done) resolve(v);
      done = true;
    };
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_FORM_BYTES) return finish(null);
      if (!done) chunks.push(c);
    });
    req.on("end", () => finish(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", () => finish(null));
  });
}

function cookieValue(req, name) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

const sameText = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

function createAdminApp({ cfg, db, now = () => new Date(), log = console }) {
  const local = LOCAL_ORIGIN.test(cfg.adminOrigin);
  if (!local && !cfg.adminOrigin.startsWith("https://")) {
    throw new Error(
      "ADMIN_ORIGIN должен быть https://… (или http://localhost для локальной копии)",
    );
  }
  const COOKIE = local ? "uklad_admin_local" : "__Host-uklad_admin";
  const cookieAttrs = `Path=/; HttpOnly;${local ? "" : " Secure;"} SameSite=Strict`;

  const store = adminStore(db);
  const limiter = createRateLimit({ capacity: 10, refillPerMinute: 5 });
  const routes = createRoutes({
    store,
    cfg: {
      issueReset(accountId, t) {
        const token = randomBytes(32).toString("base64url");
        store.addReset(accountId, sha256(token), t, new Date(t.getTime() + RESET_MS).toISOString());
        return `${cfg.publicUrl}/app/reset/${token}`;
      },
    },
  });

  const html = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      ...SECURITY_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      ...headers,
    });
    res.end(body);
  };
  const redirect = (res, to, headers = {}) => {
    res.writeHead(303, { ...SECURITY_HEADERS, Location: to, ...headers });
    res.end();
  };

  /** Живая сессия по куке или `null`. Просроченную стираем сразу. */
  function session(req) {
    const token = cookieValue(req, COOKIE);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const hash = sha256(token);
    const s = store.findSession(hash);
    if (!s) return null;
    const t = now();
    const idle = t.getTime() - new Date(s.seen_at).getTime() > IDLE_MS;
    if (idle || s.expires_at < t.toISOString()) {
      store.dropSession(hash);
      return null;
    }
    store.touchSession(hash, t);
    return { ...s, tokenHash: hash };
  }

  /** POST только со своего адреса и с токеном CSRF этой сессии. */
  function trusted(req, form, s) {
    // Без заголовка Origin (старые клиенты) пропускаем намеренно: защиту
    // держат CSRF-токен и кука SameSite=Strict. Чужой Origin — отказ.
    const origin = req.headers.origin;
    if (origin && origin !== cfg.adminOrigin) return false;
    return Boolean(form && s && sameText(form.get("csrf") ?? "", s.csrf));
  }

  /** Неудачи по адресу: ip → { n, first, until }. В памяти, как и лимит частоты. */
  const ipFails = new Map();
  const ipLocked = (ip, t) => (ipFails.get(ip)?.until ?? 0) > t.getTime();
  function ipFail(ip, t) {
    const prev = ipFails.get(ip);
    const fresh = !prev || t.getTime() - prev.first > LOCK_MS;
    const f = fresh ? { n: 0, first: t.getTime(), until: 0 } : prev;
    f.n += 1;
    if (f.n >= IP_LOCK_AFTER) f.until = t.getTime() + LOCK_MS;
    ipFails.set(ip, f);
    if (ipFails.size > 10_000) {
      for (const [k, v] of ipFails) {
        if (v.until < t.getTime() && t.getTime() - v.first > LOCK_MS) ipFails.delete(k);
      }
    }
  }

  const loginPage = (res, status, error) =>
    html(res, status, views.loginPage({ error, dev: local }));

  async function login(req, res) {
    const ip = clientIp(req, cfg.trustProxy);
    if (!limiter.take(ip)) return loginPage(res, 429, "Слишком много попыток. Подождите минуту.");
    const origin = req.headers.origin;
    if (origin && origin !== cfg.adminOrigin) return loginPage(res, 403);
    const form = await readForm(req);
    if (!form) return loginPage(res, 413);

    const email = (form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
    const t = now();
    const admin = store.adminByEmail(email);

    if (ipLocked(ip, t) || (admin?.locked_until && admin.locked_until > t.toISOString())) {
      store.log(t, admin?.id, "login_locked", email);
      return loginPage(res, 401, "Вход временно закрыт. Попробуйте через 15 минут.");
    }
    const passOk = checkPassword(form.get("password") ?? "", admin?.password_hash ?? DUMMY_HASH);
    const step =
      admin && passOk
        ? totp.verify(admin.totp_secret, form.get("code") ?? "", t.getTime(), admin.totp_last)
        : null;

    if (!admin || step === null) {
      ipFail(ip, t);
      if (admin) {
        const failed = admin.failed + 1;
        const lockedUntil =
          failed >= LOCK_AFTER ? new Date(t.getTime() + LOCK_MS).toISOString() : null;
        store.failAdmin(admin.id, lockedUntil ? 0 : failed, lockedUntil);
      }
      // Почту в журнал пишем, пароль и код — никогда.
      store.log(t, admin?.id, "login_failed", email);
      log.error("[uklad-admin] неудачный вход");
      return loginPage(res, 401, "Почта, пароль или код не подошли.");
    }

    store.passAdmin(admin.id, step);
    ipFails.delete(ip);
    store.purgeSessions(t);
    const token = randomBytes(32).toString("base64url");
    store.addSession({
      tokenHash: sha256(token),
      adminId: admin.id,
      csrf: randomBytes(24).toString("base64url"),
      createdAt: t.toISOString(),
      expiresAt: new Date(t.getTime() + SESSION_MS).toISOString(),
    });
    store.log(t, admin.id, "login", email);
    return redirect(res, "/", {
      "Set-Cookie": `${COOKIE}=${token}; ${cookieAttrs}; Max-Age=${SESSION_MS / 1000}`,
    });
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "/";

    if (path === "/admin.css" && req.method === "GET") {
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        "Content-Type": "text/css; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      });
      return res.end(views.CSS);
    }
    if (path === "/login") {
      if (req.method === "POST") return login(req, res);
      return loginPage(res, 200);
    }

    const found = session(req);
    if (!found) return req.method === "GET" ? redirect(res, "/login") : loginPage(res, 401);
    const s = {
      ...found,
      badges: {
        "/leads": store.countNewLeads() || 0,
        "/support": store.countNewReports() || 0,
      },
    };
    const t = now();
    const ctx = {
      path,
      url,
      s,
      t,
      page: (body) => html(res, 200, body),
      badRequest: (body) => html(res, 400, body),
      redirect: (to) => redirect(res, to),
      notFound: () => html(res, 404, "Не найдено"),
      // Файл на скачивание: только JSON и только с именем, которое задал код.
      download: (name, body) => {
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
        });
        res.end(body);
      },
    };

    if (req.method === "GET") return routes.get(ctx);
    if (req.method !== "POST") return html(res, 405, "");

    const form = await readForm(req);
    if (!trusted(req, form, s)) return html(res, 403, "Форма устарела, обновите страницу.");
    if (path === "/logout") {
      store.dropSession(s.tokenHash);
      store.log(t, s.admin_id, "logout");
      return redirect(res, "/login", {
        "Set-Cookie": `${COOKIE}=; ${cookieAttrs}; Max-Age=0`,
      });
    }
    return routes.post({ ...ctx, form });
  }

  const handler = async function handler(req, res) {
    try {
      await handle(req, res);
    } catch (error) {
      log.error("[uklad-admin] сбой обработчика:", error);
      if (!res.headersSent) html(res, 500, "Ошибка сервера");
    }
  };
  handler.cookieName = COOKIE;
  return handler;
}

module.exports = { createAdminApp, COOKIE: "__Host-uklad_admin" };
