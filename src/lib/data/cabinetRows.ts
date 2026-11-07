/**
 * Запись кабинета «только изменённое» (шаг 2 потолка данных, ADR 0010).
 *
 * Сервер хранит работу склада строками (`server/api/src/cabinet/records.js`):
 * на месте каждого списка в документе — метка `{ $rows: n }`. Здесь тот же
 * расклад, только в браузере: кабинет раскладывает то, что сервер отдал или
 * принял на этой версии (`base`), и то, что есть сейчас, и шлёт разницу —
 * документ без списков и поменявшиеся строки. Раскладка обязана совпадать с
 * серверной до места в списке: это сверяет тест `cabinetRows.test.ts`, а
 * сервер ещё и считает строки по меткам и при расхождении отвечает
 * `diverged` — тогда кабинет пишется целиком.
 */

export const WAREHOUSE_LISTS = [
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "requests",
  "shipments",
  "tasks",
  "disputes",
  "docRecords",
  "outboundBoxes",
] as const;
export const COMPANY_LISTS = ["staffEvents"] as const;
const NEWEST_FIRST = new Set(["expectedShipments", "requests", "shipments", "tasks", "disputes"]);
const COMPANY = "";
const MARK = "$rows";
const MAX_REF = 200;

type Obj = Record<string, unknown>;
export interface Slot {
  w: string;
  d: string;
}
export interface Row extends Slot {
  ref: string;
  pos: number;
  data: Obj;
}
/** Раскладка: документ с метками, строки по ключу и их JSON для сравнения. */
export interface Split {
  doc: Obj;
  rows: Map<string, Row & { json: string }>;
  slots: Map<string, Slot>;
  products: string;
}
/** Что уходит на сервер вместо кабинета целиком. */
export interface Changes {
  doc: Obj;
  slots: Slot[];
  upsert: Row[];
  remove: (Slot & { ref: string })[];
  products?: unknown[];
}

const isObject = (v: unknown): v is Obj => v !== null && typeof v === "object" && !Array.isArray(v);
const isRef = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_REF;
const slotKey = (w: string, d: string) => `${w}\u0000${d}`;

/**
 * JSON с ключами по алфавиту. Postgres (`jsonb`) отдаёт ключи в своём
 * порядке, и запись из базы иначе выглядела бы изменённой, хоть в ней
 * ничего не поменялось, — первая же правка после входа ушла бы целиком.
 */
export function stableJson(v: unknown): string {
  if (Array.isArray(v))
    return `[${v.map((x) => (x === undefined ? "null" : stableJson(x))).join(",")}]`;
  if (isObject(v)) {
    const parts: string[] = [];
    for (const k of Object.keys(v).sort()) {
      if (v[k] === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${stableJson(v[k])}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

function rowable(list: unknown): list is Obj[] {
  if (!Array.isArray(list)) return false;
  const seen = new Set<string>();
  for (const item of list) {
    if (!isObject(item) || !isRef(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
  }
  return true;
}

/** Тот же обход, что `eachList` на сервере: корень и `warehouseData`. */
function eachList(data: Obj, visit: (holder: Obj, key: string, wh: string) => void): Obj {
  const out: Obj = { ...data };
  const wh = (data.warehouse as Obj | undefined)?.id;
  const active = isRef(wh) ? wh : null;
  if (active) for (const key of WAREHOUSE_LISTS) visit(out, key, active);
  for (const key of COMPANY_LISTS) visit(out, key, COMPANY);
  if (isObject(data.warehouseData)) {
    const stash: Obj = { ...data.warehouseData };
    out.warehouseData = stash;
    for (const [id, work] of Object.entries(data.warehouseData)) {
      if (!isObject(work) || !isRef(id) || id === active) continue;
      const copy = { ...work };
      stash[id] = copy;
      for (const key of WAREHOUSE_LISTS) visit(copy, key, id);
    }
  }
  return out;
}

/** Кабинет (то, что уходит на сервер) → документ с метками и строки. */
export function splitCabinet(data: Obj): Split {
  const rows: Split["rows"] = new Map();
  const slots: Split["slots"] = new Map();
  const { products, ...rest } = data;
  const doc = eachList(rest, (holder, key, wh) => {
    const list = holder[key];
    if (!rowable(list)) return;
    slots.set(slotKey(wh, key), { w: wh, d: key });
    const from = NEWEST_FIRST.has(key) ? -list.length : 0;
    list.forEach((item, i) => {
      const ref = item.id as string;
      rows.set(`${slotKey(wh, key)}\u0000${ref}`, {
        w: wh,
        d: key,
        ref,
        pos: from + i,
        data: item,
        json: stableJson(item),
      });
    });
    holder[key] = { [MARK]: list.length };
  });
  return { doc, rows, slots, products: stableJson(products ?? null) };
}

/**
 * Разница между тем, что на сервере (`base`), и тем, что есть сейчас. Список
 * попадает в правку, если в нём что-то поменялось или его не было строками.
 */
export function diffCabinet(base: Split, next: Split, nextProducts: unknown): Changes {
  const upsert: Row[] = [];
  const remove: Changes["remove"] = [];
  const touched = new Set<string>();
  for (const [k, row] of next.rows) {
    const old = base.rows.get(k);
    if (old && old.json === row.json && old.pos === row.pos) continue;
    upsert.push({ w: row.w, d: row.d, ref: row.ref, pos: row.pos, data: row.data });
    touched.add(slotKey(row.w, row.d));
  }
  for (const [k, row] of base.rows) {
    const slot = slotKey(row.w, row.d);
    // Список, ставший документом, своих строк не теряет — как на сервере.
    if (!next.slots.has(slot) || next.rows.has(k)) continue;
    remove.push({ w: row.w, d: row.d, ref: row.ref });
    touched.add(slot);
  }
  for (const k of next.slots.keys()) if (!base.slots.has(k)) touched.add(k);
  const out: Changes = {
    doc: next.doc,
    slots: [...touched].map((k) => next.slots.get(k) as Slot),
    upsert,
    remove,
  };
  if (next.products !== base.products && Array.isArray(nextProducts)) {
    out.products = nextProducts;
  }
  return out;
}
