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
 *   POST /api/auth/password                 — { password, next } → новый пароль
 *   POST /api/auth/email/change             — { email, password } → код на новый адрес
 *   POST /api/auth/email/confirm            — { code } → почта сменена
 *
 * Смена почты (Кирилл 24.11, миграция 066) — как у Google: пароль, код на
 * новый адрес, после кода другие устройства выходят, на старый адрес — письмо.
 *
 * Смена пароля (Кирилл 24.11) — как у Google: старый пароль обязателен (вкладку
 * могли оставить открытой), неудачи общие со входом, все сессии гаснут
 * (триггер на `auth.accounts`), а эта получает новую куку — человек остаётся в
 * кабинете. На почту — письмо: если меняли не вы, вход через «Забыли пароль».
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomInt } = require("node:crypto");
const { checkPassword, hashPassword, isAcceptable } = require("./password");
const { createRateLimit, clientIp } = require("../rateLimit");
const { isEmail } = require("../validate");
const {
  deletionLetter,
  passwordLetter,
  emailCodeLetter,
  emailChangedLetter,
} = require("./letters");
const { FAIL_WINDOW_MS, FAIL_PAIR, FAIL_EMAIL } = require("./auth");

// Код на новую почту живёт, как и прочие коды из писем, 15 минут.
const EMAIL_CODE_TTL = "900 seconds";

function createAccount({ pool, auth, send, cfg, log }) {
  const { readJson, tokenHash, clearCookie, deliver, tx, startSession, codeHash } = auth;
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

  /**
   * Вошедший и его пароль верный — иначе ответ уже отправлен. Сессию могли
   * украсть: подбор пароля здесь ограничен так же, как на входе, — 5 неудач
   * на аккаунт с адреса за 15 минут, и неудачи общие с входом
   * (`auth.login_failures`), а не отдельный счётчик.
   */
  async function confirmed(req, res, hash, password) {
    const ip = clientIp(req, cfg.trustProxy);
    if (!limiter.take(ip)) {
      send(res, 429, { ok: false }, { "Retry-After": "60" });
      return null;
    }
    const me = hash && (await mine(hash));
    if (!me) {
      send(res, 401, { ok: false });
      return null;
    }
    const since = new Date(Date.now() - FAIL_WINDOW_MS);
    const { rows: f } = await pool.query(`SELECT * FROM auth.failures($1, $2, $3)`, [
      me.email,
      ip,
      since,
    ]);
    if (f[0].pair >= FAIL_PAIR || f[0].email >= FAIL_EMAIL) {
      send(res, 429, { ok: false, error: "locked" }, { "Retry-After": "900" });
      return null;
    }
    if (!(await checkPassword(password, me.password_hash))) {
      await pool.query(`SELECT auth.note_failure($1, $2)`, [me.email, ip]);
      send(res, 403, { ok: false, error: "bad_password" });
      return null;
    }
    return me;
  }

  async function remove(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const hash = tokenHash(req);
    const me = await confirmed(req, res, hash, b.password);
    if (!me) return;
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

  async function changePassword(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    // Слабый новый — отказ до проверки старого: попытку не тратим.
    if (!isAcceptable(b.next)) return send(res, 400, { ok: false, error: "weak_password" });
    if (b.next === b.password) return send(res, 400, { ok: false, error: "same_password" });
    const hash = tokenHash(req);
    const me = await confirmed(req, res, hash, b.password);
    if (!me) return;
    const next = await hashPassword(b.next);
    // Новый хэш гасит все сессии (триггер), эта получает новую в той же
    // транзакции: не вышло одно — не вышло ничего.
    const cookie = await tx(async (c) => {
      await c.query(`SELECT auth.set_password($1, $2)`, [me.account_id, next]);
      return startSession(c, me.account_id);
    });
    deliver(me.email, passwordLetter(cfg.publicUrl));
    log.info?.("[uklad] пароль изменён");
    return send(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }

  /**
   * Смена почты, шаг 1 (миграция 066): новый адрес и пароль → код на новый
   * адрес. Пароль обязателен: украденная сессия не должна уводить аккаунт на
   * чужую почту. До ввода кода вход — по старой почте.
   */
  async function requestEmail(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const next = String(b.email ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 320);
    // Неверный адрес — отказ до проверки пароля: попытку не тратим.
    if (!isEmail(next)) return send(res, 400, { ok: false, error: "bad_email" });
    const hash = tokenHash(req);
    const me = await confirmed(req, res, hash, b.password);
    if (!me) return;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { rows } = await pool.query(
      `SELECT auth.request_email_change($1, $2, $3, $4::interval) AS r`,
      [hash, next, codeHash(me.account_id, code), EMAIL_CODE_TTL],
    );
    const r = rows[0]?.r;
    if (!r) return send(res, 401, { ok: false });
    if (r === "same") return send(res, 400, { ok: false, error: "same_email" });
    if (r === "taken") return send(res, 409, { ok: false, error: "email_taken" });
    if (r === "limit") {
      return send(res, 429, { ok: false, error: "mail_limit" }, { "Retry-After": "3600" });
    }
    deliver(next, emailCodeLetter(code));
    return send(res, 202, { ok: true });
  }

  /**
   * Смена почты, шаг 2: код из письма. Верный меняет почту и закрывает вход
   * на других устройствах; на старый адрес — письмо «почту сменили».
   */
  async function confirmEmail(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!limiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    const code = String(b.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) return send(res, 400, { ok: false, error: "bad_code" });
    const hash = tokenHash(req);
    const me = hash && (await mine(hash));
    if (!me) return send(res, 401, { ok: false });
    const { rows } = await pool.query(`SELECT * FROM auth.confirm_email_change($1, $2)`, [
      hash,
      codeHash(me.account_id, code),
    ]);
    const out = rows[0];
    if (out?.status === "taken") return send(res, 409, { ok: false, error: "email_taken" });
    if (out?.status !== "ok") return send(res, 400, { ok: false, error: "bad_code" });
    deliver(out.old_email, emailChangedLetter(out.new_email, cfg.publicUrl));
    log.info?.("[uklad] почта аккаунта изменена");
    return send(res, 200, { ok: true, email: out.new_email });
  }

  const routes = {
    "GET /api/auth/account": info,
    "POST /api/auth/email/change": requestEmail,
    "POST /api/auth/email/confirm": confirmEmail,
    "POST /api/auth/account/delete": remove,
    "POST /api/auth/account/restore": restore,
    "POST /api/auth/sessions/revoke-others": revokeOthers,
    "POST /api/auth/password": changePassword,
  };

  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой управления аккаунтом:", err.message);
      if (!res.headersSent) send(res, err?.httpStatus === 403 ? 403 : 500, { ok: false });
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
