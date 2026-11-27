import { liveReceipts } from "./recvUndo";
import type { ActivityEntry } from "./activityJournal";
import { normalizeCode } from "./barcode";
import { orderLabelCode } from "./packing";
import type {
  FulfillmentRequest,
  OutboundBox,
  ReceivingEvent,
  Shipment,
  StaffEvent,
} from "./types";

/**
 * «Путь товара» (Кирилл 16.11): по коду отправления, коду «Честного знака»,
 * EAN, артикулу или заказу — посылки, где это было, и лента одной посылки от
 * приёмки до рейса: тара → заказ → короб → место сортировки → рейс.
 *
 * На сервере посылки и ленту собирает `server/api/src/cabinet/goodsPath.js`
 * из операций столов. Кабинет заранее переводит запрос в то, что знает сам:
 * товары (штрихкод, артикул, хвост EAN) и заказы (номер, номер площадки), —
 * и сужает список по дате и направлению. В демо — из данных этого браузера.
 */

/** Посылка (упаковка тары в короб) или заказ, который ещё не упаковали. */
export interface PathMatch {
  /** id операции упаковки на сервере или `order:<id заказа>`. */
  id: string;
  /** Когда упаковали; у заказа без посылки — когда его завели. */
  at: number;
  staffRef: string | null;
  outboundCode?: string | null;
  toteId?: string | null;
  requestIds: string[];
  lines: { productId: string; qty: number }[];
  /** Код маркировки или этикетки, по которому нашлась посылка (без криптохвоста). */
  code?: string;
}

export interface PathSearch {
  /** Код как ввели, без криптохвоста после GS. */
  q: string;
  orders: string[];
  products: string[];
}

interface Lookup {
  products: readonly { id: string; barcode: string; sku: string }[];
  requests: readonly FulfillmentRequest[];
}

const TAIL = /^[A-Za-z0-9]{4}$/;
const LIST_MAX = 50;
const DAY_MS = 86_400_000;
const ends = (code: string | undefined, tail: string) =>
  !!code && normalizeCode(code).endsWith(tail);
const same = (code: string | undefined, q: string) => !!code && normalizeCode(code) === q;

/** Четыре знака — хвост кода с этикетки, а не код целиком. */
const isTail = (q: string) => TAIL.test(q.trim());

/**
 * Запрос → что искать: код как есть, заказы и товары, которые кабинет узнал
 * по номеру, штрихкоду, артикулу или хвосту.
 */
export function resolvePathSearch(raw: string, data: Lookup): PathSearch | null {
  const q = raw.split("\u001d")[0].trim();
  if (!q) return null;
  const code = normalizeCode(q);
  const tail = isTail(q);
  const products = data.products
    .filter((p) => (tail ? ends(p.barcode, code) : same(p.barcode, code) || same(p.sku, code)))
    .map((p) => p.id);
  const orders = data.requests
    .filter((r) =>
      tail
        ? ends(r.externalId, code) || ends(orderLabelCode(r.id), code)
        : r.id === q || same(r.externalId, code) || same(orderLabelCode(r.id), code),
    )
    .map((r) => r.id);
  return { q, orders: orders.slice(0, LIST_MAX), products: products.slice(0, LIST_MAX) };
}

/** Строка адреса для поиска посылок на сервере. */
export function pathSearchQuery(warehouse: string, s: PathSearch): string {
  const p = new URLSearchParams({ warehouse, q: s.q });
  if (s.orders.length) p.set("orders", s.orders.join(","));
  if (s.products.length) p.set("products", s.products.join(","));
  return p.toString();
}

const orderMatch = (r: FulfillmentRequest): PathMatch => ({
  id: `order:${r.id}`,
  at: r.packedAt ?? r.createdAt,
  staffRef: r.packedBy ?? null,
  toteId: r.toteId ?? null,
  requestIds: [r.id],
  lines: [{ productId: r.productId, qty: r.qty }],
});

/**
 * Заказы, которые нашлись по номеру, но ещё не упакованы: у них есть путь до
 * упаковки (приёмка, сборка), и руководитель должен их увидеть в списке.
 */
export function withOrders(
  parcels: readonly PathMatch[],
  s: PathSearch,
  requests: readonly FulfillmentRequest[],
): PathMatch[] {
  const packed = new Set(parcels.flatMap((m) => m.requestIds));
  const extra = s.orders
    .filter((id) => !packed.has(id))
    .map((id) => requests.find((r) => r.id === id))
    .filter((r): r is FulfillmentRequest => !!r)
    .map(orderMatch);
  return [...parcels, ...extra].sort((a, b) => b.at - a.at);
}

/** Направление посылки — куда едут её заказы; разные — через запятую. */
export function matchDirection(m: PathMatch, requests: readonly FulfillmentRequest[]): string {
  const dests = new Set(
    requests
      .filter((r) => m.requestIds.includes(r.id))
      .map((r) => r.note?.trim())
      .filter((d): d is string => !!d),
  );
  return [...dests].join(", ");
}

/** Сужение списка: день упаковки (по часам браузера, `YYYY-MM-DD`) и направление. */
export function narrowMatches(
  list: readonly PathMatch[],
  f: { day?: string; direction?: string },
  requests: readonly FulfillmentRequest[],
): PathMatch[] {
  const from = f.day ? new Date(`${f.day}T00:00:00`).getTime() : NaN;
  return list.filter(
    (m) =>
      (!Number.isFinite(from) || (m.at >= from && m.at < from + DAY_MS)) &&
      (!f.direction || matchDirection(m, requests) === f.direction),
  );
}

// --- Демо: путь из данных этого браузера ---------------------------------------

export interface LocalPathData extends Lookup {
  outboundBoxes: readonly OutboundBox[];
  shipments: readonly Shipment[];
  receivingEvents: readonly ReceivingEvent[];
  staffEvents: readonly StaffEvent[];
}

const parcelOf = (d: LocalPathData, id: string) =>
  d.outboundBoxes.find((b) => !b.place && b.requestIds.includes(id));

/** Демо: заказы, где был этот товар, код или номер, — новые сверху. */
export function localMatches(s: PathSearch, d: LocalPathData): PathMatch[] {
  const code = normalizeCode(s.q);
  const fits = (c: string | undefined) => (isTail(s.q) ? ends(c, code) : same(c, code));
  const byCode = new Set(
    d.staffEvents.filter((e) => e.orderId && fits(e.code)).map((e) => e.orderId as string),
  );
  const boxes = d.outboundBoxes.filter((b) => fits(b.code));
  const hit = (r: FulfillmentRequest) =>
    s.orders.includes(r.id) ||
    s.products.includes(r.productId) ||
    byCode.has(r.id) ||
    boxes.some((b) => b.requestIds.includes(r.id));
  return d.requests
    .filter(hit)
    .map((r) => ({ ...orderMatch(r), outboundCode: parcelOf(d, r.id)?.code ?? null }))
    .sort((a, b) => b.at - a.at)
    .slice(0, LIST_MAX);
}

const entry = (
  id: string,
  at: number,
  staffRef: string | undefined | null,
  kind: string,
  step: ActivityEntry["step"],
  refs: ActivityEntry["refs"],
): ActivityEntry => ({
  id,
  at,
  receivedAt: at,
  source: "local",
  staffRef: staffRef ?? null,
  kind,
  step,
  counted: false,
  flagged: false,
  refs,
});

/**
 * Демо: лента заказа из того, что знает браузер. Чего в данных нет (кто
 * сортировал и когда), того в ленте нет: время не выдумываем.
 */
export function localSteps(m: PathMatch, d: LocalPathData): ActivityEntry[] {
  const r = d.requests.find((x) => m.requestIds.includes(x.id));
  if (!r) return [];
  const until = r.pickedAt ?? r.startedAt ?? r.shippedAt ?? Date.now();
  const out: ActivityEntry[] = [];
  const recv = liveReceipts(d.receivingEvents)
    .filter((e) => e.productId === r.productId && e.timestamp <= until)
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  if (recv) {
    out.push(
      entry(recv.id, recv.timestamp, recv.staffId, "recv_unit", "receive", {
        productId: recv.productId,
        boxId: recv.boxId,
        qty: recv.qty,
      }),
    );
  }
  if (r.pickedAt) {
    out.push(
      entry(`${r.id}-pick`, r.pickedAt, null, "pick_done", "pick", {
        orderId: r.id,
        ...(r.toteId ? { toteId: r.toteId } : {}),
      }),
    );
  }
  for (const e of d.staffEvents) {
    if (e.orderId !== r.id || !e.type.startsWith("pack_")) continue;
    const step = e.type === "pack_label" || e.type === "pack_reprint" ? "label" : "pack";
    out.push(
      entry(e.id, e.at, e.staffId, "pack_event", step, {
        type: e.type,
        orderId: r.id,
        ...(e.productId ? { productId: e.productId } : {}),
        ...(e.code ? { code: e.code } : {}),
      }),
    );
  }
  const box = parcelOf(d, r.id);
  if (r.packedAt) {
    out.push(
      entry(`${r.id}-pack`, r.packedAt, r.packedBy, "pack_done", "pack", {
        ...(box ? { outboundCode: box.code } : {}),
        ...(box?.sortCode ? { sortCode: box.sortCode } : {}),
      }),
    );
  }
  const run = d.shipments.find((s) => s.requestIds.includes(r.id));
  if (run) {
    out.push(
      entry(run.id, run.shippedAt, run.staffId, "ship_run", "ship", {
        ...(run.vehicle ? { vehicle: run.vehicle } : {}),
      }),
    );
  }
  return out.sort((a, b) => a.at - b.at);
}
