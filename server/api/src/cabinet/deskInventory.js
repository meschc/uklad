/**
 * Инвентаризация операцией (миграция 023, `deskOps.js`).
 *
 * `inv_count` — слепой пересчёт тары на полке: сотрудник присылает, сколько
 * чего насчитал, а что должно быть по учёту, знает только сервер. Он сам
 * сравнивает (как `planCount` в `src/lib/inventory.ts`) и заводит спорное по
 * каждому расхождению — недостачу или излишек. Остатки пересчёт не двигает:
 * товар правит решение старшего (`deskShip.js`), и только его.
 *
 * Пересчёт ставит на таре отметку «считали» (`countedAt`, `countedBy`) — по ней
 * кабинет видит, какую тару давно не считали. Повтор того же пересчёта (тот же
 * ключ или тот же eventId) спорное не задваивает.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const MAX_QTY = 100_000;
const MAX_LINES = 200;

/** Схлопнуть одинаковые товары; null — число не целое, отрицательное или слишком большое. */
function normalize(lines) {
  if (!Array.isArray(lines)) return null;
  const sum = new Map();
  for (const l of lines) {
    if (!isObject(l) || !isId(l.productId)) return null;
    if (!Number.isInteger(l.qty) || l.qty < 0 || l.qty > MAX_QTY) return null;
    sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.qty);
  }
  if (sum.size > MAX_LINES) return null;
  for (const n of sum.values()) if (n > MAX_QTY) return null;
  return sum;
}

const INVENTORY_KINDS = new Set(["inventory_short", "inventory_over"]);

function applyInvCount(data, body, staffRef) {
  if (!isId(body.boxId)) return { flag: "bad" };
  const counted = normalize(body.lines);
  if (!counted) return { flag: "bad" };
  const boxes = list(data.boxes);
  const box = boxes.find((b) => b.id === body.boxId);
  if (!box) return { flag: "bad" };
  const disputes = list(data.disputes);
  const prefix = `inv-${body.eventId}-`;
  // Тот же пересчёт уже принят (пришёл снимком раньше операции) — это он.
  if (
    (box.countedAt === body.at && box.countedBy === staffRef) ||
    disputes.some((d) => String(d.id).startsWith(prefix))
  ) {
    return { data };
  }
  // Считают то, что стоит на полке; невскрытое место товара по учёту не держит.
  if (!isObject(box.address) || box.sealed) return { flag: "stock" };
  // Прошлое расхождение по этой таре ещё ждёт старшего: два открытых
  // пересчёта подряд решали бы один и тот же товар дважды.
  if (disputes.some((d) => !d.resolution && INVENTORY_KINDS.has(d.kind) && d.boxId === box.id)) {
    return { flag: "open" };
  }
  const known = new Set(list(data.products).map((p) => p.id));
  for (const p of counted.keys()) if (!known.has(p)) return { flag: "bad" };

  const expected = new Map();
  for (const l of list(box.lines)) {
    expected.set(l.productId, (expected.get(l.productId) ?? 0) + (Number(l.qty) || 0));
  }
  const raised = [];
  const products = [...new Set([...expected.keys(), ...counted.keys()])].sort();
  for (const p of products) {
    const e = expected.get(p) ?? 0;
    const c = counted.get(p) ?? 0;
    if (e === c) continue;
    raised.push({
      id: `${prefix}${p}`.slice(0, 100),
      kind: c < e ? "inventory_short" : "inventory_over",
      boxId: box.id,
      ...(typeof box.barcode === "string" ? { toteCode: box.barcode } : {}),
      productId: p,
      qty: Math.abs(c - e),
      raisedBy: staffRef,
      raisedAt: body.at,
    });
  }
  return {
    data: {
      ...data,
      boxes: boxes.map((b) => (b === box ? { ...b, countedAt: body.at, countedBy: staffRef } : b)),
      disputes: [...raised, ...disputes],
    },
  };
}

module.exports = { applyInvCount, INVENTORY_KINDS };
