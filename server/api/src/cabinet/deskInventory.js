/**
 * Инвентаризация операцией (миграция 024, `deskOps.js`).
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
 *
 * `inv_cell` — пересчёт ячейки, где по учёту тары нет (Кирилл 15.11: «надо
 * сейчас»). Пусто — так и записано: факт лежит в журнале операций стола
 * (`uklad.desk_ops`), снимок не меняется. Нашли товар — сотрудник кладёт его в
 * свободную тару, сервер ставит её в эту ячейку и заводит излишек по каждому
 * товару на эту тару: дальше старший решает как обычно — оприходовать (два
 * человека и причина) или закрыть без правки учёта. Товар без тары учётом не
 * становится, поэтому без тары найденное не принимаем.
 */

/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */

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

const sameCell = (a, b) =>
  isObject(a) &&
  isObject(b) &&
  a.floorId === b.floorId &&
  a.moduleId === b.moduleId &&
  a.shelfIndex === b.shelfIndex &&
  a.cellIndex === b.cellIndex;

/** Пересчёт ячейки без тары по учёту: «пусто» или излишек в свободную тару. */
function applyInvCell(data, body, staffRef) {
  // Ленивый require: приёмка сама берёт отсюда INVENTORY_KINDS.
  const { cellExists } = require("./deskReceive");
  if (!cellExists(data, body.cell)) return { flag: "bad" };
  const counted = normalize(body.lines);
  if (!counted) return { flag: "bad" };
  const boxes = list(data.boxes);
  const disputes = list(data.disputes);
  const prefix = `inv-${body.eventId}-`;
  if (disputes.some((d) => String(d.id).startsWith(prefix))) return { data };
  // В ячейке стоит тара на учёте — считают её (`inv_count`), а не ячейку.
  const here = boxes.filter((b) => b.id !== body.boxId && sameCell(b.address, body.cell));
  if (here.length > 0) return { flag: "busy" };
  const found = [...counted].filter(([, n]) => n > 0);
  // Пусто: снимок не трогаем, факт остаётся строкой журнала операций.
  if (found.length === 0) return { data };
  const known = new Set(list(data.products).map((p) => p.id));
  for (const [p] of found) if (!known.has(p)) return { flag: "bad" };
  if (!isId(body.boxId)) return { flag: "bad" };
  const box = boxes.find((b) => b.id === body.boxId);
  if (!box) return { flag: "bad" };
  // Повтор того же пересчёта: тара уже здесь с нашей отметкой.
  if (sameCell(box.address, body.cell) && box.countedAt === body.at && box.countedBy === staffRef) {
    return { data };
  }
  // Свободная тара: невскрытое место, тара с товаром или стоящая на другом
  // месте — не та, в которую кладут найденное.
  const busy =
    box.sealed || isObject(box.address) || list(box.lines).some((l) => Number(l.qty) > 0);
  if (busy) return { flag: "stock" };
  const raised = found
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, n]) => ({
      id: `${prefix}${p}`.slice(0, 100),
      kind: "inventory_over",
      boxId: box.id,
      ...(typeof box.barcode === "string" ? { toteCode: box.barcode } : {}),
      productId: p,
      qty: n,
      raisedBy: staffRef,
      raisedAt: body.at,
    }));
  return {
    data: {
      ...data,
      boxes: boxes.map((b) =>
        b === box ? { ...b, address: body.cell, countedAt: body.at, countedBy: staffRef } : b,
      ),
      disputes: [...raised, ...disputes],
    },
  };
}

module.exports = { applyInvCount, applyInvCell, INVENTORY_KINDS };
