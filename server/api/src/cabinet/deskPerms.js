/* global module */

/**
 * Права у стола — по роли сотрудника (миграция 024), а не по тексту
 * должности. `who.perms` — `{ staff_ref: [коды прав] }` тех, кто за столом
 * сейчас и только что; нет роли — нет прав на решения.
 */

// Списание, брак, недостача, излишек — решения по товару.
const GOODS_DECIDE = "goods.decide";
// Подтвердить списание — начальник склада (миграция 030). С одним
// `goods.decide` списание только просят.
const GOODS_WRITEOFF = "goods.writeoff";
// Отвязать стол — руководитель с правом на персонал.
const STAFF_MANAGE = "staff.manage";

function may(who, ref, code) {
  if (typeof ref !== "string" || !ref) return false;
  const perms = who?.perms?.[ref];
  return Array.isArray(perms) && perms.includes(code);
}

/** Права сотрудников стола одним запросом. */
async function loadDeskPerms(c, refs) {
  const want = [...new Set(refs.filter((r) => typeof r === "string" && r))];
  if (want.length === 0) return {};
  const { rows } = await c.query(`SELECT * FROM uklad.desk_staff_permissions($1)`, [want]);
  return Object.fromEntries(rows.map((r) => [r.staff_ref, r.permissions ?? []]));
}

module.exports = { GOODS_DECIDE, GOODS_WRITEOFF, STAFF_MANAGE, may, loadDeskPerms };
