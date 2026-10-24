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
 *   POST /api/auth/register — почта, пароль, компания, склад или селлер
 *   POST /api/auth/login    — почта и пароль
 *   POST /api/auth/badge    — код с QR-бейджа сотрудника
 *   POST /api/auth/logout
 *   GET  /api/auth/me       — кто вошёл, его компании, права в текущей
 *   POST /api/staff/badge   — выпустить бейдж сотруднику на склад (staff.manage)
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomBytes, createHash } = require("node:crypto");
const { hashPassword, checkPassword, isAcceptable } = require("./password");
const { createRateLimit, clientIp } = require("../rateLimit");

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

const BADGE_PREFIX = "UKB-";
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function createAuth({ pool, cfg, send, readBody, log }) {
  // Локально по http браузер не сохранит куку с `Secure` и `__Host-`.
  const local = !cfg.publicUrl.startsWith("https://");
  const COOKIE = local ? "uklad_session" : "__Host-uklad_session";
  // Lax, а не Strict: из письма человек должен прийти уже вошедшим.
  const attrs = `Path=/; HttpOnly;${local ? "" : " Secure;"} SameSite=Lax`;
  const loginLimiter = createRateLimit({ capacity: 20, refillPerMinute: 10 });
  const badgeLimiter = createRateLimit({ capacity: 30, refillPerMinute: 30 });

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
  async function readJson(req, res) {
    const origin = (req.headers.origin ?? "").replace(/\/+$/, "");
    if (!cfg.allowedOrigins.includes(origin)) {
      send(res, 403, { ok: false });
      return null;
    }
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
      send(res, 415, { ok: false });
      return null;
    }
    const body = await readBody(req);
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
    const company = String(b.company ?? "").trim();
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
    try {
      const out = await tx(async (c) => {
        const { rows } = await c.query(
          `SELECT account_id, org_id FROM auth.register($1, $2, $3, $4, $5, $6)`,
          [
            email,
            hash,
            company,
            b.kind === "warehouse",
            b.kind === "seller",
            String(b.name ?? "").slice(0, 200),
          ],
        );
        return { orgId: rows[0].org_id, cookie: await startPasswordSession(c, rows[0].account_id) };
      });
      return send(res, 201, { ok: true, orgId: out.orgId }, { "Set-Cookie": out.cookie });
    } catch (err) {
      if (err.code === "23505") return send(res, 409, { ok: false, error: "email_taken" });
      throw err;
    }
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

  const routes = {
    "POST /api/auth/register": register,
    "POST /api/auth/login": login,
    "POST /api/auth/badge": badge,
    "POST /api/auth/logout": logout,
    "GET /api/auth/me": me,
    "POST /api/staff/badge": issueBadge,
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

  return { handle, withSession, purge, cookieName: COOKIE };
}

module.exports = { createAuth, BADGE_PREFIX };
