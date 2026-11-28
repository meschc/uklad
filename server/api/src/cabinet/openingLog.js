/**
 * Ввод начальных остатков из кабинета (Кирилл 28.11): событие приёмки с
 * `opening: true` — товар лежал на складе до Уклада, его не принимали.
 *
 * Писать его может только тот, кто пишет работу склада целиком (`staff.manage`,
 * `writeScope.js`), — так же, как любую тару. Здесь две вещи сверх этого:
 *   — каждый ввод — строкой журнала действий (`stock.opening`): кто, на каком
 *     складе, сколько строк и штук; ввод в любой момент, поэтому след нужен;
 *   — отметку у уже записанного события не ставят и не снимают: иначе
 *     настоящую приёмку можно задним числом вывести из счёта продавцу, а
 *     ввод остатков — превратить в приёмку и выставить за неё.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { logAction } = require("./audit");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isOpening = (data) => isObject(data) && data.opening === true;
/** id товаров в подробностях — сколько влезет, остальное числом. */
const MAX_IDS = 40;

/**
 * Строки записи (`{ w, d, ref, data }`) → `false`, если отметку пытались
 * поменять у записанного события; иначе пишет журнал и отвечает `true`.
 * Вызывать до записи строк: «было» берётся из базы.
 */
async function checkOpening(c, log, items) {
  const events = items.filter((i) => i.d === "receivingEvents" && isObject(i.data));
  if (events.length === 0) return true;
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, ref, (data->>'opening') = 'true' AS opening
     FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND domain = 'receivingEvents'
       AND ref = ANY($1::text[])`,
    [events.map((i) => i.ref)],
  );
  const was = new Map(rows.map((r) => [`${r.w}\u0000${r.ref}`, r.opening]));
  const fresh = new Map();
  for (const i of events) {
    const key = `${i.w}\u0000${i.ref}`;
    if (was.has(key)) {
      if (was.get(key) !== isOpening(i.data)) return false;
      continue;
    }
    if (!isOpening(i.data)) continue;
    const at = fresh.get(i.w) ?? { lines: 0, qty: 0, ids: new Set() };
    at.lines += 1;
    at.qty += Number.isInteger(i.data.qty) ? i.data.qty : 0;
    if (typeof i.data.productId === "string") at.ids.add(i.data.productId);
    fresh.set(i.w, at);
  }
  for (const [w, at] of fresh) {
    const ids = [...at.ids];
    await logAction(c, log, {
      action: "stock.opening",
      warehouse: w,
      details: {
        lines: at.lines,
        qty: at.qty,
        ids: ids.slice(0, MAX_IDS),
        ...(ids.length > MAX_IDS ? { more: ids.length - MAX_IDS } : {}),
      },
    });
  }
  return true;
}

module.exports = { checkOpening };
