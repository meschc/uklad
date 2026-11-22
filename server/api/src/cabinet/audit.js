/**
 * Журнал действий руководителей (миграция 062, Кирилл 22.11): роли,
 * приглашения, доступ, подключения площадок, удаление товаров — всё, что
 * люди меняют в кабинете помимо работы склада. Каждое действие пишется
 * дважды: строкой `uklad.audit_events` — в журнал действий склада, и строкой
 * лога сервера — для разбора с поддержкой.
 *
 * Только id и коды: имён, почт, ключей площадок здесь нет и не будет, журнал
 * уходит в отчёт поддержке. Запись идёт в той же транзакции, что и само
 * действие: откатилось действие — откатилась и запись.
 */
/* global module */

const ACTION_RE = /^[a-z]{2,30}\.[a-z_]{2,30}$/;
const MAX_REF = 200;
const MAX_DETAILS = 2000;

const SOURCES = new Set(["cabinet", "desk", "pull", "system"]);
/** Ключи, которых в подробностях быть не может: журнал видят и старшие. */
const SECRET_KEY = /token|secret|password|key|phone|email/i;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Есть ли где-то в подробностях ключ, похожий на секрет или личные данные. */
function hasSecretKey(v) {
  if (Array.isArray(v)) return v.some(hasSecretKey);
  if (!isObject(v)) return false;
  return Object.entries(v).some(([k, x]) => SECRET_KEY.test(k) || hasSecretKey(x));
}
const refOrNull = (v) => (typeof v === "string" && v.length > 0 && v.length <= MAX_REF ? v : null);

/**
 * Записать действие. `warehouse` — склад действия (`null` — компании, видит
 * только владелец), `target` — с чем (id роли, человека, подключения),
 * `details` — коды и id. Неверный вид действия — ошибка программы, а не
 * молчаливый пропуск: журнал «всех действий» не должен терять строки.
 */
async function logAction(
  c,
  log,
  { action, warehouse = null, target = null, details = {}, source = "cabinet", staffRef = null },
) {
  if (!ACTION_RE.test(action)) throw new Error(`audit: неверное действие ${action}`);
  if (!SOURCES.has(source)) throw new Error(`audit: неверный источник ${source}`);
  // Токен, пароль, ключ площадки, почта, телефон — не в журнал (только id).
  if (hasSecretKey(details)) throw new Error(`audit: в подробностях ${action} лишнее поле`);
  const text = JSON.stringify(isObject(details) ? details : {});
  if (text.length > MAX_DETAILS) throw new Error(`audit: подробности ${action} длиннее лимита`);
  const { rows } = await c.query(
    `INSERT INTO uklad.audit_events
       (org_id, warehouse_ref, action, target, details, source, staff_ref)
     VALUES (uklad.current_org(), $1, $2, $3, $4::jsonb, $5, $6)
     RETURNING id, org_id, member_id`,
    [refOrNull(warehouse), action, refOrNull(target), text, source, refOrNull(staffRef)],
  );
  const r = rows[0];
  // Лог поддержки: те же id, по ним строку находят в журнале.
  log?.info?.(
    `[uklad] действие ${action} ${JSON.stringify({
      id: r.id,
      org: r.org_id,
      member: r.member_id,
      source,
      warehouse: refOrNull(warehouse),
      target: refOrNull(target),
    })}`,
  );
  return r.id;
}

/**
 * Действия склада `ref` для журнала, новые сверху. `company` — добавить
 * действия компании без склада (только владельцу).
 */
async function auditRows(c, ref, { before = null, since = null, company = false, limit }) {
  const { rows } = await c.query(
    `SELECT a.id, a.at, a.warehouse_ref, a.member_id, a.action, a.target, a.details,
            a.source, coalesce(a.staff_ref, mem.staff_ref) AS staff_ref,
            mem.display_name AS name
     FROM uklad.audit_events a
     LEFT JOIN uklad.members mem ON mem.org_id = a.org_id AND mem.id = a.member_id
     WHERE a.org_id = uklad.current_org()
       AND (a.warehouse_ref = $1 OR ($2 AND a.warehouse_ref IS NULL))
       AND ($3::timestamptz IS NULL OR a.at <= $3)
       AND ($4::timestamptz IS NULL OR a.at >= $4)
     ORDER BY a.at DESC
     LIMIT $5`,
    [ref, company, before, since, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).getTime(),
    receivedAt: new Date(r.at).getTime(),
    source: "audit",
    by: r.source,
    staffRef: r.staff_ref ?? null,
    member: r.member_id ? { id: r.member_id, name: r.name ?? null } : null,
    kind: r.action,
    step: "admin",
    counted: false,
    flagged: false,
    ...(r.target ? { target: r.target } : {}),
    ...(r.warehouse_ref ? {} : { company: true }),
    ...(isObject(r.details) && Object.keys(r.details).length ? { details: r.details } : {}),
  }));
}

module.exports = { logAction, auditRows };
