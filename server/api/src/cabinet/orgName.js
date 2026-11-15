/**
 * Название компании на сервере.
 *
 * Название живёт в `uklad.orgs.name`: его видят письма-приглашения, список
 * компаний при входе и чат. Кабинет при знакомстве и в профиле пишет его
 * сюда, а не только в свой снимок — иначе сотрудник получает приглашение от
 * «Новой компании» (ревизия 14.11).
 *
 * Маршрут:
 *   POST /api/company/name — { name } → { ok, name }; право `org.manage`.
 */
/* global module */

const MAX_NAME = 200;
// Управляющие символы и переводы строк в названии не нужны нигде: оно уходит
// в тему письма и в одну строку списка компаний.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

/** Название из ввода или `null`, если оно не годится. */
function cleanName(raw) {
  if (typeof raw !== "string" || CONTROL_RE.test(raw.replace(/[ \t]/g, ""))) return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME) return null;
  return name;
}

function createOrgName({ auth, send }) {
  const { withSession, readJson } = auth;

  async function rename(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const name = cleanName(b.name);
    if (!name) return send(res, 400, { ok: false, error: "bad_name" });
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.accountId || !ctx.can("org.manage")) return { status: 403 };
      // RLS пускает только в свою компанию (`orgs_own_update`).
      const { rowCount } = await c.query(
        `UPDATE uklad.orgs SET name = $1 WHERE id = uklad.current_org() AND deleted_at IS NULL`,
        [name],
      );
      return rowCount ? { name } : { status: 404 };
    });
    if (!out) return send(res, 401, { ok: false });
    if (out.status) return send(res, out.status, { ok: false });
    return send(res, 200, { ok: true, name: out.name });
  }

  /** Обработчик маршрута. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    if (url.pathname !== "/api/company/name") return false;
    if (req.method !== "POST") {
      send(res, 405, { ok: false });
      return true;
    }
    await rename(req, res);
    return true;
  }

  return { handle };
}

module.exports = { createOrgName, cleanName };
