/**
 * Админка Уклада — внутренняя панель владельца.
 *
 * Слушает свой порт (`ADMIN_PORT`), а Caddy пускает к нему только отдельный
 * адрес `admin.<домен>`: с сайта и из `/api/*` до админки не достучаться.
 *
 * Защита, по порядку:
 *  - регистрации нет: владельца создаёт `cli.js` на самом сервере;
 *  - вход одним шагом — почта, пароль и код из приложения вместе; ответ на
 *    любую ошибку одинаковый, чтобы не подсказывать, что именно неверно;
 *  - 5 неудач подряд закрывают вход на 15 минут, плюс лимит частоты по IP;
 *  - сессия: 12 часов максимум и час без действий; кука `__Host-` с
 *    HttpOnly, Secure, SameSite=Strict, в базе — только хэш токена;
 *  - каждая форма несёт токен CSRF сессии, а POST с чужим Origin отбрасывается;
 *  - CSP запрещает любые скрипты и встраивание страницы в чужой фрейм;
 *  - каждое действие пишется в журнал, который нельзя править.
 */
/* global require, module, Buffer, URL, URLSearchParams, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes, timingSafeEqual } = require("node:crypto");
const { adminStore, sha256 } = require("./store");
const { checkPassword } = require("./password");
const totp = require("./totp");
const views = require("./views");
const { createRateLimit, clientIp } = require("../rateLimit");

const COOKIE = "__Host-uklad_admin";
const MAX_FORM_BYTES = 8 * 1024;
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
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

const EMAIL = /^[^\s@<>]{1,100}@[^\s@<>]{1,100}\.[^\s@<>]{2,}$/;

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

function cookieValue(req) {
  const raw = req.headers.cookie ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return "";
}

const sameText = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

function createAdminApp({ cfg, db, now = () => new Date(), log = console }) {
  const store = adminStore(db);
  const limiter = createRateLimit({ capacity: 10, refillPerMinute: 5 });

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
    const token = cookieValue(req);
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
    const origin = req.headers.origin;
    if (origin && origin !== cfg.adminOrigin) return false;
    return Boolean(form && s && sameText(form.get("csrf") ?? "", s.csrf));
  }

  /** Неудачи по адресу: ip → { n, until }. В памяти, как и лимит частоты. */
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
      for (const [k, v] of ipFails)
        if (v.until < t.getTime() && t.getTime() - v.first > LOCK_MS) ipFails.delete(k);
    }
  }

  async function login(req, res) {
    const ip = clientIp(req, cfg.trustProxy);
    if (!limiter.take(ip)) {
      return html(res, 429, views.loginPage({ error: "Слишком много попыток. Подождите минуту." }));
    }
    const origin = req.headers.origin;
    if (origin && origin !== cfg.adminOrigin) return html(res, 403, views.loginPage());
    const form = await readForm(req);
    if (!form) return html(res, 413, views.loginPage());

    const email = (form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
    const t = now();
    const admin = store.adminByEmail(email);

    if (ipLocked(ip, t) || (admin?.locked_until && admin.locked_until > t.toISOString())) {
      store.log(t, admin.id, "login_locked", email);
      return html(
        res,
        401,
        views.loginPage({ error: "Вход временно закрыт. Попробуйте через 15 минут." }),
      );
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
      return html(res, 401, views.loginPage({ error: "Почта, пароль или код не подошли." }));
    }

    store.passAdmin(admin.id, step);
    ipFails.delete(ip);
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
      "Set-Cookie": `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`,
    });
  }

  function accountRoute(path) {
    const m = /^\/accounts\/(\d{1,10})(?:\/(block|unblock|reset))?$/.exec(path);
    return m ? { id: Number(m[1]), action: m[2] } : null;
  }

  function listPage(res, s, filter, status = 200, error) {
    const accounts = store.listAccounts(filter);
    return html(res, status, views.accountsPage({ session: s, accounts, filter, error }));
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;

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
      return html(res, 200, views.loginPage());
    }

    const s = session(req);
    if (!s) {
      return req.method === "GET" ? redirect(res, "/login") : html(res, 401, views.loginPage());
    }
    const t = now();

    if (req.method === "GET") {
      if (path === "/") {
        const k = url.searchParams.get("kind");
        const kind = k === "warehouse" || k === "seller" ? k : "";
        const search = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
        return listPage(res, s, { kind, search });
      }
      if (path === "/audit") {
        return html(res, 200, views.auditPage({ session: s, audit: store.audit(300) }));
      }
      const r = accountRoute(path);
      const account = r && !r.action ? store.account(r.id) : null;
      if (account) {
        const audit = store.auditOf(`account:${account.id}`);
        return html(res, 200, views.accountPage({ session: s, account, audit }));
      }
      return html(res, 404, "Не найдено");
    }

    if (req.method !== "POST") return html(res, 405, "");
    const form = await readForm(req);
    if (!trusted(req, form, s)) return html(res, 403, "Форма устарела, обновите страницу.");

    if (path === "/logout") {
      store.dropSession(s.tokenHash);
      store.log(t, s.admin_id, "logout");
      return redirect(res, "/login", {
        "Set-Cookie": `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      });
    }

    if (path === "/accounts") {
      const kind = form.get("kind");
      const name = (form.get("name") ?? "").trim().slice(0, 120);
      const email = (form.get("email") ?? "").trim().toLowerCase();
      const error =
        kind !== "warehouse" && kind !== "seller"
          ? "Выберите тип."
          : !name
            ? "Впишите название."
            : !EMAIL.test(email)
              ? "Почта выглядит неверно."
              : store.accountByEmail(email)
                ? "Аккаунт с этой почтой уже есть."
                : "";
      if (error) return listPage(res, s, { kind: "", search: "" }, 400, error);
      const id = store.addAccount({ kind, name, email }, t);
      store.log(t, s.admin_id, "account_create", `account:${id}`, { тип: kind, почта: email });
      return redirect(res, `/accounts/${id}`);
    }

    const r = accountRoute(path);
    const account = r?.action ? store.account(r.id) : null;
    if (!account) return html(res, 404, "Не найдено");
    const target = `account:${account.id}`;

    if (r.action === "block") {
      const note = (form.get("note") ?? "").trim().slice(0, 200);
      store.setStatus(account.id, "blocked", note);
      store.log(t, s.admin_id, "account_block", target, note ? { причина: note } : undefined);
      return redirect(res, `/accounts/${account.id}`);
    }
    if (r.action === "unblock") {
      store.setStatus(account.id, "active", null);
      store.log(t, s.admin_id, "account_unblock", target);
      return redirect(res, `/accounts/${account.id}`);
    }
    // Сброс: ссылку показываем один раз прямо в ответе, в базе — только хэш.
    const token = randomBytes(32).toString("base64url");
    store.addReset(account.id, sha256(token), t, new Date(t.getTime() + RESET_MS).toISOString());
    store.log(t, s.admin_id, "access_reset", target);
    const resetLink = `${cfg.publicUrl}/app/reset/${token}`;
    const audit = store.auditOf(target);
    return html(res, 200, views.accountPage({ session: s, account, audit, resetLink }));
  }

  return async function handler(req, res) {
    try {
      await handle(req, res);
    } catch (error) {
      log.error("[uklad-admin] сбой обработчика:", error);
      if (!res.headersSent) html(res, 500, "Ошибка сервера");
    }
  };
}

module.exports = { createAdminApp, COOKIE };
