/**
 * Бейджи рабочего места, пока кабинет живёт снимком (ADR 0010, миграция 010).
 *
 * В демо бейдж — это id сотрудника (`UK-STF-<id>`), и копия чужого бейджа
 * пускает за другого. Здесь в QR лежит случайный секрет (16 байт), в базе —
 * только его sha256. Код показывается один раз, при выпуске; выпуск нового
 * гасит старый.
 *
 * Стол открыт входом руководителя (тот же, что читает снимок), поэтому
 * проверка бейджа идёт в его сессии и только внутри его компании: бейдж
 * другого склада не найдётся даже с верным секретом — это решает RLS.
 *
 * Маршруты (все — вход по паролю с правом `staff.manage`):
 *   POST /api/cabinet/badges/issue  — { staffRef } → { code }
 *   POST /api/cabinet/badges/revoke — { staffRef }
 *   POST /api/cabinet/badges/check  — { code } → { staffRef }; чужой или
 *                                     погашенный — 404 (не 401: сессия жива)
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomBytes } = require("node:crypto");
const { createRateLimit } = require("../rateLimit");

const BADGE_PREFIX = "UK-STF-";
// 16 байт в base64url — ровно 22 знака без «=».
const SECRET_RE = /^[A-Za-z0-9_-]{22}$/;
// id сотрудника из браузера: `stf-…` из uid() или старые демо-id.
const STAFF_REF_RE = /^[A-Za-z0-9_-]{1,100}$/;
// Сканы на столе — пара в минуту на человека; 60 на компанию — запас на
// смену у нескольких столов, но не на перебор. Секрет в 128 бит перебором
// и так не найти, лимит бережёт базу.
const CHECKS_PER_MINUTE = 60;

const FORBIDDEN = Symbol("forbidden");
const LIMITED = Symbol("limited");
const sha256 = (s) => createHash("sha256").update(s).digest();
/** Тот же круг, что у снимка: персонал и журнал смен видит руководитель. */
const mayUse = (ctx) => Boolean(ctx.accountId) && ctx.can("staff.manage");

/**
 * Чей бейдж внутри текущей компании транзакции: id сотрудника или `null`.
 * Регистр префикса не важен — дешёвые сканеры его меняют; секрет — как есть.
 * Общий для руководителя (кабинет) и стола (`desks.js`).
 */
async function whoseBadge(c, code) {
  const raw = String(code ?? "").trim();
  const secret = raw.toUpperCase().startsWith(BADGE_PREFIX) ? raw.slice(BADGE_PREFIX.length) : "";
  if (!SECRET_RE.test(secret)) return null;
  const { rows } = await c.query(
    `SELECT staff_ref FROM uklad.desk_badges
     WHERE org_id = uklad.current_org() AND secret_hash = $1 AND revoked_at IS NULL`,
    [sha256(secret)],
  );
  return rows[0]?.staff_ref ?? null;
}

/** Ответ проверки: чужой или погашенный — 404, а не 401: сессия жива. */
function answerCheck(res, send, staffRef) {
  return staffRef
    ? send(res, 200, { ok: true, staffRef })
    : send(res, 404, { ok: false, error: "bad_badge" });
}

function createDeskBadges({ auth, send, log }) {
  const { withSession, readJson } = auth;
  const checks = createRateLimit({
    capacity: CHECKS_PER_MINUTE,
    refillPerMinute: CHECKS_PER_MINUTE,
  });

  /** Ответ на итог `withSession`: нет сессии — 401, нет права — 403. */
  function reply(res, out, ok) {
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (out === LIMITED) return send(res, 429, { ok: false }, { "Retry-After": "30" });
    return ok(out);
  }

  async function issue(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const staffRef = String(b.staffRef ?? "");
    if (!STAFF_REF_RE.test(staffRef)) return send(res, 400, { ok: false, error: "bad_request" });
    const secret = randomBytes(16).toString("base64url");
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      // Сначала гасим старый, потом выпускаем новый: индекс «один живой»
      // не даст двум одновременным выпускам оставить оба бейджа.
      await c.query(
        `UPDATE uklad.desk_badges SET revoked_at = now(), revoked_by = $2
         WHERE org_id = uklad.current_org() AND staff_ref = $1 AND revoked_at IS NULL`,
        [staffRef, ctx.memberId],
      );
      await c.query(
        `INSERT INTO uklad.desk_badges (org_id, staff_ref, secret_hash, issued_by)
         VALUES (uklad.current_org(), $1, $2, $3)`,
        [staffRef, sha256(secret), ctx.memberId],
      );
      return true;
    });
    // Код в ответе один раз: в базе его нет, только хэш.
    return reply(res, out, () => send(res, 200, { ok: true, code: BADGE_PREFIX + secret }));
  }

  async function revoke(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const staffRef = String(b.staffRef ?? "");
    if (!STAFF_REF_RE.test(staffRef)) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      const { rowCount } = await c.query(
        `UPDATE uklad.desk_badges SET revoked_at = now(), revoked_by = $2
         WHERE org_id = uklad.current_org() AND staff_ref = $1 AND revoked_at IS NULL`,
        [staffRef, ctx.memberId],
      );
      return { revoked: rowCount };
    });
    return reply(res, out, (r) => send(res, 200, { ok: true, revoked: r.revoked }));
  }

  async function check(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      if (!checks.take(ctx.orgId)) return LIMITED;
      return { staffRef: await whoseBadge(c, b.code) };
    });
    return reply(res, out, (r) => answerCheck(res, send, r.staffRef));
  }

  const routes = {
    "POST /api/cabinet/badges/issue": issue,
    "POST /api/cabinet/badges/revoke": revoke,
    "POST /api/cabinet/badges/check": check,
  };

  /** Обработчик маршрутов бейджей. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой бейджа рабочего места:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createDeskBadges, whoseBadge, answerCheck, BADGE_PREFIX, CHECKS_PER_MINUTE };
