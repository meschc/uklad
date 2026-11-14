/**
 * Команда компании: приглашение, роли, отключение (миграция 023).
 *
 * Правила «кому что можно» живут в базе (`auth.invite_member`,
 * `auth.change_role` …): роль можно дать, только если все её права есть у
 * самого делающего; выше себя и себя самого не тронуть. Здесь — только
 * вход (право `staff.manage`, вход по паролю), разбор тела и перевод
 * отказов базы в коды ответа.
 *
 * Маршруты руководителя (`staff.manage`, вход по паролю):
 *   GET  /api/team              — { members, roles, permissions, me }
 *   POST /api/team/invite       — { email, roleId, name? } → письмо со ссылкой
 *   POST /api/team/invite/revoke — { memberId }
 *   POST /api/team/role         — { memberId, roleId }
 *   POST /api/team/disable      — { memberId, disabled }
 *   POST /api/team/roles/save   — { roleId?, name, permissions }
 *   POST /api/team/roles/delete — { roleId }
 *
 * Без сессии (человека ещё нет в системе; токен из письма):
 *   POST /api/auth/invite/info   — { token } → компания, роль, почта, есть ли вход
 *   POST /api/auth/invite/accept — { token, password, consent?, name? } → вход
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { isEmail } = require("../validate");
const { randomBytes, createHash } = require("node:crypto");
const { hashPassword, checkPassword, isAcceptable } = require("./password");
const { createRateLimit, clientIp } = require("../rateLimit");
const { inviteLetter } = require("./letters");
const { FAIL_WINDOW_MS, FAIL_PAIR, FAIL_EMAIL } = require("./auth");

const INVITE_TTL_MS = 7 * 86_400_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (s) => createHash("sha256").update(s).digest();

/** Отказ базы `team:*` → код ответа. Остальное — настоящий сбой. */
const TEAM_STATUS = {
  not_found: 404,
  role_not_allowed: 403,
  self: 403,
  default_role: 403,
  already_member: 409,
  role_in_use: 409,
  too_many_invites: 429,
  bad_name: 400,
};
function teamError(err) {
  const m = /^team:(\w+)/.exec(err?.message ?? "");
  return m && TEAM_STATUS[m[1]] ? { status: TEAM_STATUS[m[1]], error: m[1] } : null;
}

function createTeam({ auth, cfg, send, log }) {
  const { withSession, readJson, tx } = auth;
  const mayUse = (ctx) => Boolean(ctx.accountId) && ctx.can("staff.manage");
  const inviteLimiter = createRateLimit({ capacity: 10, refillPerMinute: 5 });
  const acceptLimiter = createRateLimit({ capacity: 20, refillPerMinute: 10 });

  /** Выполнить действие руководителя; отказы базы — в ответ, а не в 500. */
  async function guarded(req, res, act, ok = () => ({})) {
    const b = req.method === "POST" ? await readJson(req, res) : {};
    if (!b) return;
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return { status: 403, error: "forbidden" };
      try {
        return { value: await act(c, ctx, b) };
      } catch (err) {
        const known = teamError(err);
        if (known) return known;
        throw err;
      }
    });
    if (!out) return send(res, 401, { ok: false });
    if (out.status) return send(res, out.status, { ok: false, error: out.error });
    return send(res, 200, { ok: true, ...ok(out.value) });
  }

  const uuid = (v) => (UUID_RE.test(String(v ?? "")) ? String(v) : null);
  const bad = (res) => send(res, 400, { ok: false, error: "bad_request" });

  async function list(req, res) {
    return guarded(
      req,
      res,
      async (c, ctx) => {
        const members = (await c.query(`SELECT * FROM auth.team_list()`)).rows;
        const roles = (
          await c.query(
            `SELECT id, name, permissions, is_default FROM uklad.roles
             WHERE org_id = uklad.current_org() AND deleted_at IS NULL ORDER BY created_at`,
          )
        ).rows;
        const permissions = (
          await c.query(`SELECT code, title FROM uklad.permissions ORDER BY code`)
        ).rows;
        const deskRoles = (
          await c.query(
            `SELECT staff_ref, role_id FROM uklad.desk_staff_roles
             WHERE org_id = uklad.current_org() AND role_id IS NOT NULL`,
          )
        ).rows;
        return { members, roles, permissions, deskRoles, me: ctx.memberId };
      },
      (v) => ({
        me: v.me,
        permissions: v.permissions,
        roles: v.roles.map((r) => ({
          id: r.id,
          name: r.name,
          permissions: r.permissions,
          builtIn: r.is_default,
        })),
        members: v.members.map((m) => ({
          id: m.member_id,
          name: m.name,
          email: m.email,
          roleId: m.role_id,
          roleName: m.role_name,
          status: m.status,
          hasLogin: m.has_login,
          hasBadge: m.has_badge,
          lastSeenAt: m.last_seen_at,
          inviteExpiresAt: m.invite_expires_at,
        })),
        // Роли сотрудников стола (вход по бейджу): `staffRef → roleId`.
        deskRoles: Object.fromEntries(v.deskRoles.map((d) => [d.staff_ref, d.role_id])),
      }),
    );
  }

  async function invite(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const email = String(b.email ?? "")
      .trim()
      .toLowerCase();
    const roleId = uuid(b.roleId);
    if (!isEmail(email) || !roleId) return bad(res);
    const token = randomBytes(32).toString("base64url");
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return { status: 403, error: "forbidden" };
      if (!inviteLimiter.take(ctx.orgId)) return { status: 429, error: "too_often" };
      try {
        await c.query(`SELECT auth.invite_member($1, $2, $3, $4, $5::interval)`, [
          email,
          roleId,
          String(b.name ?? "").slice(0, 200),
          sha256(token),
          `${INVITE_TTL_MS / 1000} seconds`,
        ]);
      } catch (err) {
        const known = teamError(err);
        if (known) return known;
        throw err;
      }
      const { rows } = await c.query(
        `SELECT (SELECT name FROM uklad.orgs WHERE id = uklad.current_org()) AS company,
                (SELECT name FROM uklad.roles WHERE id = $1) AS role`,
        [roleId],
      );
      return { company: rows[0].company, role: rows[0].role };
    });
    if (!out) return send(res, 401, { ok: false });
    if (out.status) return send(res, out.status, { ok: false, error: out.error });
    // Ссылка с `#`: фрагмент не уходит на сервер и в его журналы.
    const link = `${cfg.publicUrl}/app/#invite=${token}`;
    auth.deliver(email, inviteLetter({ company: out.company, role: out.role, link }));
    return send(res, 200, { ok: true });
  }

  const revokeInvite = (req, res) =>
    guarded(req, res, async (c, _ctx, b) => {
      const id = uuid(b.memberId);
      if (!id) throw new Error("team:not_found");
      await c.query(`SELECT auth.revoke_invite($1)`, [id]);
    });

  const changeRole = (req, res) =>
    guarded(req, res, async (c, _ctx, b) => {
      const [m, r] = [uuid(b.memberId), uuid(b.roleId)];
      if (!m || !r) throw new Error("team:not_found");
      await c.query(`SELECT auth.change_role($1, $2)`, [m, r]);
    });

  const disable = (req, res) =>
    guarded(req, res, async (c, _ctx, b) => {
      const m = uuid(b.memberId);
      if (!m) throw new Error("team:not_found");
      await c.query(`SELECT auth.set_member_disabled($1, $2)`, [m, b.disabled !== false]);
    });

  const saveRole = (req, res) =>
    guarded(
      req,
      res,
      async (c, _ctx, b) => {
        const perms = Array.isArray(b.permissions) ? b.permissions : null;
        if (!perms || perms.some((p) => typeof p !== "string" || p.length > 64)) {
          throw new Error("team:bad_name");
        }
        const roleId = b.roleId == null ? null : uuid(b.roleId);
        if (b.roleId != null && !roleId) throw new Error("team:not_found");
        const { rows } = await c.query(`SELECT auth.save_role($1, $2, $3::text[]) AS id`, [
          roleId,
          String(b.name ?? ""),
          [...new Set(perms)],
        ]);
        return rows[0].id;
      },
      (id) => ({ roleId: id }),
    );

  // Роль сотрудника стола (миграция 024); `roleId: null` — снять.
  const STAFF_REF_RE = /^[A-Za-z0-9_-]{1,100}$/;
  const deskRole = (req, res) =>
    guarded(req, res, async (c, _ctx, b) => {
      const ref = STAFF_REF_RE.test(String(b.staffRef ?? "")) ? String(b.staffRef) : null;
      const r = b.roleId == null ? null : uuid(b.roleId);
      if (!ref || (b.roleId != null && !r)) throw new Error("team:not_found");
      await c.query(`SELECT auth.set_desk_staff_role($1, $2)`, [ref, r]);
    });

  const deleteRole = (req, res) =>
    guarded(req, res, async (c, _ctx, b) => {
      const r = uuid(b.roleId);
      if (!r) throw new Error("team:not_found");
      await c.query(`SELECT auth.delete_role($1)`, [r]);
    });

  // ---- Принятие по ссылке из письма ----

  async function info(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (!acceptLimiter.take(clientIp(req, cfg.trustProxy))) {
      return send(res, 429, { ok: false }, { "Retry-After": "60" });
    }
    if (!TOKEN_RE.test(String(b.token ?? ""))) return send(res, 404, { ok: false });
    const { rows } = await tx((c) =>
      c.query(`SELECT * FROM auth.invite_info($1)`, [sha256(b.token)]),
    );
    if (!rows[0]) return send(res, 404, { ok: false });
    const r = rows[0];
    return send(res, 200, {
      ok: true,
      company: r.company,
      role: r.role_name,
      email: r.email,
      // Занятая почта: нужен пароль от неё; свободная или неподтверждённая —
      // человек придумывает новый.
      hasAccount: r.account_state === "verified",
    });
  }

  async function accept(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const ip = clientIp(req, cfg.trustProxy);
    if (!acceptLimiter.take(ip)) return send(res, 429, { ok: false }, { "Retry-After": "60" });
    const token = String(b.token ?? "");
    if (!TOKEN_RE.test(token) || typeof b.password !== "string") return bad(res);
    const hash = sha256(token);
    const { rows: found } = await tx((c) => c.query(`SELECT * FROM auth.invite_info($1)`, [hash]));
    const inv = found[0];
    if (!inv) return send(res, 404, { ok: false, error: "bad_invite" });
    const existing = inv.account_state === "verified";
    // Новый аккаунт — только с согласием и крепким паролем (152-ФЗ, как при регистрации).
    if (!existing && (b.consent !== true || !isAcceptable(b.password))) {
      return send(res, 400, {
        ok: false,
        error: b.consent !== true ? "bad_request" : "weak_password",
      });
    }
    let accountId = null;
    if (existing) {
      // Тот же счётчик неудач, что у входа: ссылка не должна стать способом
      // подбирать чужой пароль.
      const since = new Date(Date.now() - FAIL_WINDOW_MS);
      const { rows: f } = await tx((c) =>
        c.query(`SELECT * FROM auth.failures($1, $2, $3)`, [inv.email, ip, since]),
      );
      if (f[0].pair >= FAIL_PAIR || f[0].email >= FAIL_EMAIL) {
        return send(res, 429, { ok: false, error: "locked" }, { "Retry-After": "900" });
      }
      const { rows } = await tx((c) =>
        c.query(`SELECT * FROM auth.password_hash($1)`, [inv.email]),
      );
      if (!(await checkPassword(b.password, rows[0]?.password_hash ?? null))) {
        await tx((c) => c.query(`SELECT auth.note_failure($1, $2)`, [inv.email, ip]));
        return send(res, 401, { ok: false, error: "bad_credentials" });
      }
      accountId = rows[0].account_id;
    }
    const passwordHash = existing ? null : await hashPassword(b.password);
    try {
      const out = await tx(async (c) => {
        if (!existing) {
          // Неподтверждённая регистрация на эту почту могла быть чужой:
          // `set_password` гасит всё, что завели до подтверждения.
          const { rows: un } = await c.query(
            `SELECT account_id FROM auth.password_hash($1) WHERE NOT verified`,
            [inv.email],
          );
          if (un[0]) {
            await c.query(`SELECT auth.set_password($1, $2)`, [un[0].account_id, passwordHash]);
            accountId = un[0].account_id;
          } else {
            accountId = (
              await c.query(`SELECT auth.create_invited_account($1, $2) AS id`, [
                hash,
                passwordHash,
              ])
            ).rows[0].id;
          }
        }
        const orgId = (await c.query(`SELECT auth.accept_invite($1, $2) AS id`, [hash, accountId]))
          .rows[0].id;
        if (!orgId) return null;
        return { orgId, cookie: await auth.startSession(c, accountId) };
      });
      if (!out) return send(res, 404, { ok: false, error: "bad_invite" });
      return send(res, 200, { ok: true, orgId: out.orgId }, { "Set-Cookie": out.cookie });
    } catch (err) {
      const known = teamError(err);
      if (known) return send(res, known.status, { ok: false, error: known.error });
      throw err;
    }
  }

  const routes = {
    "GET /api/team": list,
    "POST /api/team/invite": invite,
    "POST /api/team/invite/revoke": revokeInvite,
    "POST /api/team/role": changeRole,
    "POST /api/team/disable": disable,
    "POST /api/team/roles/save": saveRole,
    "POST /api/team/roles/delete": deleteRole,
    "POST /api/team/desk-role": deskRole,
    "POST /api/auth/invite/info": info,
    "POST /api/auth/invite/accept": accept,
  };

  /** Обработчик маршрутов команды. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой команды:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createTeam, teamError, INVITE_TTL_MS };
