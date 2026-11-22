/**
 * Склады строками, а не в документе компании (миграция 051, ADR 0010).
 *
 * Кабинет присылает и получает склады как раньше: `warehouse` — открытый у
 * руководителя, `otherWarehouses` — остальные. Сервер хранит их строками
 * `uklad.warehouses` (`position` 0 — открытый) и собирает обратно при чтении.
 *
 * Где бы сервер ни читал документ компании, склады к нему добавляет
 * `withWarehouses`: без них не найти ни склад стола, ни место сотрудника, ни
 * чьи строки работы лежат в корне документа. В документе склады остаются,
 * только если список негодный (нет id, id повторяются): так же поступает
 * `records.js` со списками работы — лучше вес, чем пропавший склад.
 */
/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isRef = (v) => typeof v === "string" && v.length >= 1 && v.length <= 100;

/** Карточки кабинета одним списком (первая — открытый склад) или `null`. */
function cardsOf(data) {
  if (!isObject(data) || !isObject(data.warehouse)) return null;
  const others = Array.isArray(data.otherWarehouses) ? data.otherWarehouses : [];
  const cards = [data.warehouse, ...others];
  if (!cards.every((w) => isObject(w) && isRef(w.id))) return null;
  if (new Set(cards.map((w) => w.id)).size !== cards.length) return null;
  return cards;
}

/**
 * Документ → без складов и сами склады. Склады негодные или их нет —
 * документ как был, `cards: null`: таблицу тогда не трогаем.
 */
function splitWarehouses(doc) {
  const cards = cardsOf(doc);
  if (!cards) return { doc, cards: null };
  const out = { ...doc };
  delete out.warehouse;
  delete out.otherWarehouses;
  return { doc: out, cards };
}

/** Склады из таблицы в документ. Документ со своими складами — как есть. */
async function withWarehouses(c, doc) {
  if (!isObject(doc) || "warehouse" in doc) return doc;
  const { rows } = await c.query(`SELECT uklad.load_warehouses() AS cards`);
  const cards = rows[0]?.cards ?? [];
  if (cards.length === 0) return doc;
  return { ...doc, warehouse: cards[0], otherWarehouses: cards.slice(1) };
}

/** Склады — в таблицу. `null` — не трогать (их не прислали). */
async function storeWarehouses(c, cards) {
  if (!cards) return;
  await c.query(`SELECT uklad.save_warehouses($1::jsonb)`, [JSON.stringify(cards)]);
}

/**
 * Удалить склад может только владелец (`org.manage`, Кирилл 22.11): со складом
 * уходят его план, работа и люди. Кабинет удаляет склад записью без него в
 * списке, поэтому сервер сверяет список с живыми строками. Отказ откатывает
 * запись целиком — `WarehouseDeleteError`.
 */
class WarehouseDeleteError extends Error {
  constructor(refs) {
    super("warehouse_delete_owner");
    this.refs = refs;
  }
}

async function guardWarehouseDelete(c, ctx, cards) {
  if (!cards || ctx.can("org.manage")) return;
  const { rows } = await c.query(
    `SELECT ref FROM uklad.warehouses
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL AND card IS NOT NULL
       AND NOT (ref = ANY ($1::text[]))`,
    [cards.map((w) => w.id)],
  );
  if (rows.length > 0) throw new WarehouseDeleteError(rows.map((r) => r.ref));
}

/** Сколько складов у компании для лимита тарифа: без заготовки. */
async function countWarehouses(c) {
  const { rows } = await c.query(`SELECT uklad.count_warehouses() AS n`);
  return rows[0].n;
}

module.exports = {
  splitWarehouses,
  withWarehouses,
  storeWarehouses,
  countWarehouses,
  guardWarehouseDelete,
  WarehouseDeleteError,
};
