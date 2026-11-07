/**
 * Журнал движений товара по снимку (миграция 014).
 *
 * Тара, короба отгрузки и размещения пока живут в снимке кабинета. При
 * каждой записи снимка сервер сравнивает «было» и «стало» по каждому месту и
 * товару и дописывает разницу в `uklad.stock_moves` — с тем, кто записал.
 * Работа неактивных складов (`warehouseData`) считается вместе с активным:
 * переключение склада в кабинете переставляет их местами, но товар при этом
 * никуда не едет, и журнал не должен показывать движения, которых не было.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const qty = (v) => (Number.isInteger(v) ? v : 0);

/** Адрес ячейки одной строкой — так же для «было» и «стало». */
const cellRef = (a) =>
  isObject(a) ? `${a.floorId}/${a.moduleId}/${a.shelfIndex}/${a.cellIndex}` : "";

/** Сколько какого товара в каком месте: ключ места → (товар → штук). */
function places(data) {
  const out = new Map();
  const put = (key, product, n) => {
    if (typeof product !== "string" || !product || !n) return;
    if (!out.has(key)) out.set(key, new Map());
    const m = out.get(key);
    m.set(product, (m.get(product) ?? 0) + n);
  };
  const work = (warehouse, w) => {
    for (const [kind, rows] of [
      ["box", w.boxes],
      ["outbound", w.outboundBoxes],
    ]) {
      for (const row of list(rows)) {
        if (typeof row.id !== "string") continue;
        for (const l of list(row.lines)) {
          put(JSON.stringify([warehouse, kind, row.id]), l.productId, qty(l.qty));
        }
      }
    }
  };
  if (!isObject(data)) return out;
  const active = typeof data.warehouse?.id === "string" ? data.warehouse.id : "";
  work(active, data);
  if (isObject(data.warehouseData)) {
    for (const [id, w] of Object.entries(data.warehouseData)) {
      if (id !== active && isObject(w)) work(id, w);
    }
  }
  if (isObject(data.placements)) {
    for (const [product, addr] of Object.entries(data.placements)) {
      const ref = cellRef(addr);
      if (ref) put(JSON.stringify([null, "cell", ref]), product, 1);
    }
  }
  return out;
}

/**
 * Движения между двумя снимками: по каждому месту и товару — разница штук.
 * Порядок стабильный (по ключу места, затем товару), чтобы одинаковая
 * запись давала одинаковый журнал.
 */
function diffMoves(before, after) {
  const was = places(before);
  const now = places(after);
  const keys = [...new Set([...was.keys(), ...now.keys()])].sort();
  const moves = [];
  for (const key of keys) {
    const a = was.get(key) ?? new Map();
    const b = now.get(key) ?? new Map();
    const [wh, kind, ref] = JSON.parse(key);
    const warehouse = wh && wh.length <= 100 ? wh : null;
    for (const product of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      const delta = (b.get(product) ?? 0) - (a.get(product) ?? 0);
      if (delta === 0 || ref.length > 300 || product.length > 100) continue;
      moves.push({ warehouse, kind, ref, product, delta });
    }
  }
  return moves;
}

/** Дописать движения записи снимка. `who` — { memberId } или { deskId, staffRef }. */
async function recordMoves(c, before, after, version, who) {
  const moves = diffMoves(before, after);
  if (moves.length === 0) return 0;
  await c.query(
    `INSERT INTO uklad.stock_moves (org_id, warehouse_ref, place_kind, place_ref,
       product_ref, delta, member_id, desk_id, staff_ref, snapshot_version)
     SELECT uklad.current_org(), m.warehouse, m.kind, m.ref, m.product, m.delta,
       $2, $3, $4, $5
     FROM jsonb_to_recordset($1::jsonb)
       AS m(warehouse text, kind text, ref text, product text, delta integer)`,
    [
      JSON.stringify(moves),
      who.memberId ?? null,
      who.deskId ?? null,
      typeof who.staffRef === "string" ? who.staffRef.slice(0, 100) : null,
      version,
    ],
  );
  return moves.length;
}

module.exports = { diffMoves, recordMoves };
