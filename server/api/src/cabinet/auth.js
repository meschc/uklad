/**
 * Вход в кабинет: регистрация, пароль, QR-бейдж, выход и «кто я».
 *
 * Схема и правила — `server/db/migrations/004_auth.sql`: учётные записи и
 * сессии лежат в закрытой схеме `auth`, сервер зовёт только её функции.
 * Токен сессии — случайные 32 байта в куке `HttpOnly`; в базе — его sha256.
 *
 * Главное для всех будущих модулей кабинета — `withSession`: транзакция,
 * в которой `auth.resolve` сам ставит компанию по сессии. Компания из
 * запроса (заголовок `X-Uklad-Org`) и склад (`X-Uklad-Warehouse`) — только
 * просьба, её проверяет база. Бейдж открывает ровно один склад.
 *
 * Маршруты:
 *   POST /api/auth/register — почта, пароль, склад или селлер, компания
 *                             (необязательно);
 *                             сессии не даёт, шлёт код на почту
 *   POST /api/auth/verify   — почта и код из письма → вход
 *   POST /api/auth/resend   — прислать код подтверждения ещё раз
 *   POST /api/auth/reset/request — прислать код для нового пароля
 *   POST /api/auth/reset    — почта, код и новый пароль → вход
 *   POST /api/auth/login    — почта и пароль (почта должна быть подтверждена)
 *   POST /api/auth/badge    — код с QR-бейджа сотрудника
 *   POST /api/auth/logout
 *   GET  /api/auth/me       — кто вошёл, его компании, права в текущей
 *   POST /api/staff/badge   — выпустить бейдж сотруднику на склад (staff.manage)
 *   POST /api/staff/badge/revoke — погасить потерянный бейдж (staff.manage)
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes, randomInt, createHash } = require("node:crypto");
const { hashPassword, checkPassword, isAcceptable } = require("./password");
const { createRateLimit, clientIp } = require("../rateLimit");
const { codeLetter, alreadyLetter } = require("./letters");

// По паролю — 30 дней, но 7 дней без входа закрывают сессию. По бейджу —
// одна смена: 12 часов.
const PASSWORD_TTL_MS = 30 * 86_400_000;
const BADGE_TTL_MS = 12 * 3_600_000;
const IDLE = "7 days";
// Неудачи за 15 минут. Склад выходит в интернет с одного IP, поэтому
// главный порог — на связку «почта + адрес»; на адрес целиком — заметно выше.
const FAIL_WINDOW_MS = 15 * 60_000;
const FAIL_PAIR = 5;
const FAIL_IP = 50;
const FAIL_EMAIL = 20;

// Код из письма: 15 минут, пять попыток и 20 неудач в сутки (считает база),
// не больше пяти писем одного назначения в час и десяти в сутки.
const CODE_TTL_MS = 15 * 60_000;
const CODES_PER_HOUR = 5;
const CODES_PER_DAY = 10;

const BADGE_PREFIX = "UKB-";
const DEFAULT_COMPANY = "Новая компания";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ответ и ошибка SMTP часто повторяют адрес целиком: в журнал — без него. */
function maskAddress(text, address) {
  return String(text ?? "")
    .split(address)
    .join("***")
    .slice(0, 200);
}

const sha256 = (s) => createHash("sha256").update(s).digest();
const newSecret = (bytes) => randomBytes(bytes).toString("base64url");
const ms = (n) => `${n / 1000} seconds`;

function cookieValue(req, name) {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
}

function createAuth({ pool, cfg, send, readBody, log, mail }) {
  // Локально по http браузер не сохранит куку с `Secure` и `__Host-`.
  const local = !cfg.publicUrl.startsWith("https://");
  const COOKIE = local ? "uklad_session" : "__Host-uklad_session";
  // Lax, а не Strict: из письма человек должен прийти уже вошедшим.
  const attrs = `Path=/; HttpOnly;${local ? "" : " Secure;"} SameSite=Lax`;
  const loginLimiter = createRateLimit({ capacity: 20, refillPerMinute: 10 });
  const badgeLimiter = createRateLimit({ capacity: 30, refillPerMinute: 30 });
  const codeLimiter = createRateLimit({ capacity: 10, refillPerMinute: 5 });

  const sessionCookie = (token, ttlMs) => `${COOKIE}=${token}; ${attrs}; Max-Age=${ttlMs / 1000}`;
  const clearCookie = `${COOKIE}=; ${attrs}; Max-Age=0`;
  const tokenHash = (req) => {
    const t = cookieValue(req, COOKIE);
    return /^[A-Za-z0-9_-]{43}$/.test(t) ? sha256(t) : null;
  };

  async function tx(fn) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (err) {
      await c.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      c.release();
    }
  }

  const uuidOrNull = (v) => (UUID_RE.test(v ?? "") ? v : null);
  const resolve = async (c, hash, orgId, warehouseId) =>
    (
      await c.query(
        `SELECT account_id, org_id, member_id, warehouse_id, permissions
         FROM auth.resolve($1, $2, $3, $4::interval)`,
        [hash, uuidOrNull(orgId), uuidOrNull(warehouseId), IDLE],
      )
    ).rows[0];

  /**
   * Транзакция от имени вошедшего. `fn(client, ctx)` вызывается, только
   * если у сессии есть живое членство в компании; иначе — `null`.
   */
  async function withSession(req, fn) {
    const hash = tokenHash(req);
    if (!hash) return null;
    return tx(async (c) => {
      const s = await resolve(
        c,
        hash,
        req.headers["x-uklad-org"],
        req.headers["x-uklad-warehouse"],
      );
      if (!s?.member_id) return null;
      return fn(c, {
        accountId: s.account_id,
        orgId: s.org_id,
        memberId: s.member_id,
        warehouseId: s.warehouse_id,
        can: (perm) => s.permissions.includes(perm),
      });
    });
  }

  // POST только с нашего сайта и только JSON: форма с чужого сайта не
  // пройдёт ни по Origin, ни по типу тела (CSRF).
  async function readJson(req, res, maxBytes) {
    const origin = (req.headers.origin ?? "").replace(/\/+$/, "");
    if (!cfg.allowedOrigins.includes(origin)) {
      send(res, 403, { ok: false });
      return null;
    }
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
      send(res, 415, { ok: false });
      return null;
    }
    const body = await readBody(req, maxBytes);
    if (!body.ok) {
      send(res, 413, { ok: false }, { Connection: "close" });
      return null;
    }
    try {
      const data = JSON.parse(body.text);
      if (data && typeof data === "object") return data;
    } catch {
      // ниже — общий ответ
    }
    send(res, 400, { ok: false, error: "bad_request" });
    return null;
  }

  async function startPasswordSession(c, accountId) {
    const token = newSecret(32);
    await c.query(`SELECT auth.open_session($1, $2, $3::interval)`, [
      accountId,
      sha256(token),
      ms(PASSWORD_TTL_MS),
    ]);
    return sessionCookie(token, PASSWORD_TTL_MS);
  }

  async function register(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const email = String(b.email ?? "")
      .trim()
      .toLowerCase();
    // Название компании не входит в форму регистрации: это профиль, а не
    // пропуск (решение по кабинету). Пока его не задали — «Новая компания».
    // Не почта: название видят партнёры по договору, в чате и документах, а
    // личную почту человек контрагентам не отдавал.
    const company = String(b.company ?? "").trim() || DEFAULT_COMPANY;
    // Без согласия на обработку данных регистрироваться нельзя (152-ФЗ).
    if (
      !EMAIL_RE.test(email) ||
      !isAcceptable(b.password) ||
      company.length < 1 ||
      company.length > 200 ||
      !["warehouse", "seller"].includes(b.kind) ||
      b.consent !== true
    ) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    if (!loginLimiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    const hash = await hashPassword(b.password);
    const { rows } = await tx((c) =>
      c.query(`SELECT account_id FROM auth.register($1, $2, $3, $4, $5, $6)`, [
        email,
        hash,
        company,
        b.kind === "warehouse",
        b.kind === "seller",
        String(b.name ?? "").slice(0, 200),
      ]),
    );
    // Новая почта — код. Занятая и неподтверждённая — тоже код (человек
    // потерял письмо). Занятая и подтверждённая — письмо «вы уже с нами».
    // Ответ сайта во всех трёх случаях один.
    if (rows[0]) {
      await sendCode(rows[0].account_id, email, "verify");
    } else {
      const t = await codeTarget(email, "verify");
      if (t && !t.verified) await sendCode(t.account_id, email, "verify", t);
      else if (t) deliver(email, alreadyLetter(cfg.publicUrl));
    }
    return send(res, 202, { ok: true });
  }

  // ---- Код из письма ----

  const codeHash = (accountId, code) => sha256(`${accountId}:${code}`);
  const codeTarget = async (email, purpose) =>
    (await pool.query(`SELECT * FROM auth.code_target($1, $2)`, [email, purpose])).rows[0] ?? null;

  // Письмо уходит в фоне: ответ сайта не должен зависеть ни от почтового
  // сервера, ни от того, было ли кому писать. В журнал — ответ почтового
  // сервера и номер письма: без них «не дошло» не отличить от «не ушло».
  // Адрес — только доменом (152-ФЗ: в журнале не нужен).
  function deliver(to, letter) {
    const domain = to.slice(to.lastIndexOf("@") + 1);
    const clean = (text) => maskAddress(text, to);
    Promise.resolve()
      .then(() => mail.sendTo({ to, ...letter }))
      .then((info) =>
        log.info?.(
          `[uklad] письмо входа принято почтой: @${domain} ${clean(info?.messageId)} ${clean(info?.response)}`,
        ),
      )
      .catch((e) => log.error(`[uklad] письмо входа не ушло: @${domain}`, clean(e?.message)));
  }

  async function sendCode(accountId, email, purpose, target = null) {
    const t = target ?? { sent_last_hour: 0, sent_last_day: 0 };
    if (t.sent_last_hour >= CODES_PER_HOUR || t.sent_last_day >= CODES_PER_DAY) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await pool.query(`SELECT auth.issue_code($1, $2, $3, $4::interval)`, [
      accountId,
      purpose,
      codeHash(accountId, code),
      ms(CODE_TTL_MS),
    ]);
    deliver(email, codeLetter(purpose, code));
  }

  const readEmail = (b) =>
    String(b.email ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 320);
  const readCode = (b) => String(b.code ?? "").trim();

  /** Проверить код и, если верный, выполнить `then(client, accountId)`. */
  async function withCode(req, res, purpose, then, check = () => null) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!codeLimiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    const email = readEmail(b);
    const code = readCode(b);
    if (!/^\d{6}$/.test(code)) return send(res, 400, { ok: false, error: "bad_code" });
    const bad = check(b);
    if (bad) return send(res, 400, { ok: false, error: bad });
    const t = await codeTarget(email, purpose);
    if (!t) return send(res, 400, { ok: false, error: "bad_code" });
    const out = await tx(async (c) => {
      const { rows } = await c.query(`SELECT auth.use_code($1, $2, $3) AS ok`, [
        t.account_id,
        purpose,
        codeHash(t.account_id, code),
      ]);
      if (!rows[0].ok) return null;
      return then(c, t.account_id, b);
    });
    // Неверный код тратит попытку и коммитится; ответ — один на «нет такой
    // почты», «не тот код» и «код истёк».
    if (!out) return send(res, 400, { ok: false, error: "bad_code" });
    return send(res, 200, { ok: true, orgId: out.orgId ?? null }, { "Set-Cookie": out.cookie });
  }

  const verify = (req, res) =>
    withCode(req, res, "verify", async (c, accountId) => {
      const { rows } = await c.query(`SELECT auth.confirm_email($1) AS org_id`, [accountId]);
      return { orgId: rows[0].org_id, cookie: await startPasswordSession(c, accountId) };
    });

  // Новый пароль проверяется до кода: слабый пароль не должен сжигать код.
  const reset = (req, res) =>
    withCode(
      req,
      res,
      "reset",
      async (c, accountId, b) => {
        await c.query(`SELECT auth.set_password($1, $2)`, [
          accountId,
          await hashPassword(b.password),
        ]);
        return { cookie: await startPasswordSession(c, accountId) };
      },
      (b) => (isAcceptable(b.password) ? null : "weak_password"),
    );

  /** Прислать код. Ответ один, есть такая почта или нет. */
  async function requestCode(req, res, purpose) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!codeLimiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    const email = readEmail(b);
    if (EMAIL_RE.test(email)) {
      const t = await codeTarget(email, purpose);
      if (t && (purpose === "reset" || !t.verified))
        await sendCode(t.account_id, email, purpose, t);
    }
    return send(res, 202, { ok: true });
  }

  async function login(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const ip = clientIp(req, cfg.trustProxy);
    if (!loginLimiter.take(ip)) return send(res, 429, { ok: false }, { "Retry-After": "60" });
    const email = String(b.email ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 320);
    const since = new Date(Date.now() - FAIL_WINDOW_MS);
    const { rows: f } = await pool.query(`SELECT * FROM auth.failures($1, $2, $3)`, [
      email,
      ip,
      since,
    ]);
    if (f[0].pair >= FAIL_PAIR || f[0].ip >= FAIL_IP || f[0].email >= FAIL_EMAIL) {
      return send(res, 429, { ok: false, error: "locked" }, { "Retry-After": "900" });
    }
    const { rows } = await pool.query(`SELECT * FROM auth.password_hash($1)`, [email]);
    const ok = await checkPassword(b.password, rows[0]?.password_hash ?? null);
    if (!ok) {
      await pool.query(`SELECT auth.note_failure($1, $2)`, [email, ip]);
      // Один ответ на «нет почты» и «не тот пароль».
      return send(res, 401, { ok: false, error: "bad_credentials" });
    }
    // Пароль верный, но почта не подтверждена: это знает уже только тот,
    // кто знает пароль, — значит, можно сказать прямо.
    if (!rows[0].verified) return send(res, 403, { ok: false, error: "email_unverified" });
    const cookie = await tx((c) => startPasswordSession(c, rows[0].account_id));
    return send(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }

  async function badge(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!badgeLimiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    const code = String(b.code ?? "").trim();
    if (!code.startsWith(BADGE_PREFIX) || code.length > 64) {
      return send(res, 401, { ok: false, error: "bad_badge" });
    }
    const token = newSecret(32);
    const { rows } = await tx((c) =>
      c.query(
        `SELECT org_id, member_id, warehouse_id FROM auth.open_badge_session($1, $2, $3::interval)`,
        [sha256(code.slice(BADGE_PREFIX.length)), sha256(token), ms(BADGE_TTL_MS)],
      ),
    );
    if (!rows[0]) return send(res, 401, { ok: false, error: "bad_badge" });
    const { org_id: orgId, member_id: memberId, warehouse_id: warehouseId } = rows[0];
    return send(
      res,
      200,
      { ok: true, orgId, memberId, warehouseId },
      { "Set-Cookie": sessionCookie(token, BADGE_TTL_MS) },
    );
  }

  async function logout(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const hash = tokenHash(req);
    if (hash) await pool.query(`SELECT auth.close_session($1)`, [hash]);
    return send(res, 200, { ok: true }, { "Set-Cookie": clearCookie });
  }

  async function me(req, res, url) {
    const hash = tokenHash(req);
    if (!hash) return send(res, 401, { ok: false });
    const out = await tx(async (c) => {
      const s = await resolve(
        c,
        hash,
        url.searchParams.get("org"),
        url.searchParams.get("warehouse"),
      );
      if (!s) return null;
      const orgs = s.account_id
        ? (await c.query(`SELECT * FROM auth.my_orgs($1)`, [hash])).rows
        : [];
      return { s, orgs };
    });
    if (!out) return send(res, 401, { ok: false }, { "Set-Cookie": clearCookie });
    const { s, orgs } = out;
    return send(res, 200, {
      ok: true,
      kind: s.account_id ? "password" : "badge",
      orgs: orgs.map((o) => ({
        id: o.org_id,
        name: o.name,
        warehouse: o.has_warehouse,
        seller: o.has_seller,
        role: o.role_name,
      })),
      current: s.member_id
        ? {
            orgId: s.org_id,
            memberId: s.member_id,
            warehouseId: s.warehouse_id,
            permissions: s.permissions,
          }
        : null,
    });
  }

  async function issueBadge(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!UUID_RE.test(String(b.memberId ?? "")) || !UUID_RE.test(String(b.warehouseId ?? ""))) {
      return send(res, 404, { ok: false });
    }
    const secret = newSecret(16);
    const result = await withSession(req, async (c, ctx) => {
      if (!ctx.can("staff.manage")) return 403;
      try {
        await c.query(`SELECT auth.issue_badge($1, $2, $3)`, [
          b.memberId,
          b.warehouseId,
          sha256(secret),
        ]);
      } catch (err) {
        // Чужой сотрудник или склад — 404, а не 403 (5а, правило 7).
        if (err.code === "P0002") return 404;
        throw err;
      }
      return 200;
    });
    if (!result) return send(res, 401, { ok: false });
    if (result !== 200) return send(res, result, { ok: false });
    // Код показывается один раз: в базе его нет, только хэш.
    return send(res, 200, { ok: true, code: BADGE_PREFIX + secret });
  }

  async function revokeBadge(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!UUID_RE.test(String(b.memberId ?? ""))) return send(res, 404, { ok: false });
    const result = await withSession(req, async (c, ctx) => {
      if (!ctx.can("staff.manage")) return 403;
      try {
        await c.query(`SELECT auth.revoke_badge($1)`, [b.memberId]);
      } catch (err) {
        if (err.code === "P0002") return 404;
        throw err;
      }
      return 200;
    });
    if (!result) return send(res, 401, { ok: false });
    return send(res, result, { ok: result === 200 });
  }

  const routes = {
    "POST /api/auth/register": register,
    "POST /api/auth/verify": verify,
    "POST /api/auth/resend": (req, res) => requestCode(req, res, "verify"),
    "POST /api/auth/reset/request": (req, res) => requestCode(req, res, "reset"),
    "POST /api/auth/reset": reset,
    "POST /api/auth/login": login,
    "POST /api/auth/badge": badge,
    "POST /api/auth/logout": logout,
    "GET /api/auth/me": me,
    "POST /api/staff/badge": issueBadge,
    "POST /api/staff/badge/revoke": revokeBadge,
  };

  /** Обработчик маршрутов кабинета. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой входа:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  // Уборка раз в сутки: истёкшие сессии и старые неудачи.
  const purge = () => pool.query(`SELECT auth.purge()`).catch((e) => log.error(e.message));

  // `readJson` нужен соседним модулям кабинета (чат): та же защита от CSRF.
  // `account.js` (удаление аккаунта, выход на других устройствах) работает с
  // той же кукой, теми же письмами и той же проверкой пароля.
  return {
    handle,
    withSession,
    readJson,
    purge,
    cookieName: COOKIE,
    tokenHash,
    clearCookie,
    deliver,
  };
}

module.exports = { maskAddress, createAuth, BADGE_PREFIX, FAIL_WINDOW_MS, FAIL_PAIR, FAIL_EMAIL };
