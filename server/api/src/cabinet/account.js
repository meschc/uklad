/**
 * Управление своим аккаунтом: удаление и выход на других устройствах.
 *
 * Удаление — как у Google и Telegram: не сразу, а через 30 дней
 * (`server/db/migrations/009`). Подтверждается паролем: открытая на чужом
 * компьютере вкладка не должна стирать компанию одним нажатием. Все сессии
 * гаснут сразу, на почту уходит письмо с датой; вернуться и отменить можно,
 * войдя паролем. Через 30 дней аккаунт обезличивается (`auth.purge_deleted`).
 *
 * Маршруты:
 *   GET  /api/auth/account                  — почта, дата удаления, сколько других сессий
 *   POST /api/auth/account/delete           — { password } → удаление через 30 дней
 *   POST /api/auth/account/restore          — отменить удаление
 *   POST /api/auth/sessions/revoke-others   — выйти на всех устройствах, кроме этого
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { checkPassword } = require("./password");
const { createRateLimit, clientIp } = require("../rateLimit");
const { deletionLetter } = require("./letters");

function createAccount({ pool, auth, send, cfg, log }) {
  const { readJson, tokenHash, clearCookie, deliver } = auth;
  // Пароль здесь подбирать так же бессмысленно, как на входе.
  const limiter = createRateLimit({ capacity: 10, refillPerMinute: 5 });

  const mine = async (hash) =>
    (await pool.query(`SELECT * FROM auth.my_account($1)`, [hash])).rows[0];

  async function info(req, res) {
    const hash = tokenHash(req);
    const me = hash && (await mine(hash));
    if (!me) return send(res, 401, { ok: false });
    const { rows } = await pool.query(`SELECT auth.other_sessions($1) AS n`, [hash]);
    return send(res, 200, {
      ok: true,
      email: me.email,
      deleteAt: me.delete_at ? new Date(me.delete_at).toISOString() : null,
      otherSessions: rows[0].n,
    });
  }

  async function remove(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!limiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    const hash = tokenHash(req);
    const me = hash && (await mine(hash));
    if (!me) return send(res, 401, { ok: false });
    if (!(await checkPassword(b.password, me.password_hash))) {
      return send(res, 403, { ok: false, error: "bad_password" });
    }
    const { rows } = await pool.query(`SELECT auth.request_deletion($1) AS at`, [hash]);
    const at = rows[0]?.at;
    if (!at) return send(res, 401, { ok: false });
    deliver(me.email, deletionLetter(new Date(at), cfg.publicUrl));
    log.info?.("[uklad] аккаунт назначен к удалению");
    return send(
      res,
      200,
      { ok: true, deleteAt: new Date(at).toISOString() },
      { "Set-Cookie": clearCookie },
    );
  }

  async function restore(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const hash = tokenHash(req);
    if (!hash) return send(res, 401, { ok: false });
    const { rows } = await pool.query(`SELECT auth.cancel_deletion($1) AS ok`, [hash]);
    return rows[0]?.ok ? send(res, 200, { ok: true }) : send(res, 401, { ok: false });
  }

  async function revokeOthers(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const hash = tokenHash(req);
    if (!hash || !(await mine(hash))) return send(res, 401, { ok: false });
    const { rows } = await pool.query(`SELECT auth.revoke_other_sessions($1) AS n`, [hash]);
    return send(res, 200, { ok: true, closed: rows[0].n });
  }

  const routes = {
    "GET /api/auth/account": info,
    "POST /api/auth/account/delete": remove,
    "POST /api/auth/account/restore": restore,
    "POST /api/auth/sessions/revoke-others": revokeOthers,
  };

  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой управления аккаунтом:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  // Ежесуточно, вместе с уборкой сессий: истёкшие 30 дней — обезличить.
  const purge = () =>
    pool
      .query(`SELECT auth.purge_deleted() AS n`)
      .then(({ rows }) => rows[0].n && log.info?.(`[uklad] обезличено аккаунтов: ${rows[0].n}`))
      .catch((e) => log.error("[uklad] удаление аккаунтов:", e.message));

  return { handle, purge };
}

module.exports = { createAccount };
