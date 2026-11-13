import { groupRequestsByTarget } from "./fulfillment";
import { matchesProductCode, normalizeCode } from "./barcode";
import type { Box, FulfillmentRequest, PackSession, Product } from "./types";

/**
 * Стол упаковки от тары — чистые правила.
 *
 * Как устроено на складах фулфилмента. Товар приезжает к столу в таре: с
 * приёмки (короб, куда приёмщик перебросил товар с паллеты) или со сборки
 * (короб, куда сборщик снял заказы с полок). Упаковщик сканирует тару, затем
 * короб отгрузки, куда ляжет упакованное, и дальше идёт поштучный цикл:
 * скан товара → этикетка печатается сама → наклеил → скан этикетки.
 *
 * Тара бывает двух видов, и правила у них разные:
 *  — **с заказами** (FBS, DBS, свои магазины): в таре лежат собранные заказы,
 *    возможно несколько и не разделённые между собой. Штука сама находит свой
 *    заказ, заказ из нескольких штук закрывается этикеткой заказа;
 *  — **без заказов** (FBO, поставка на склад маркетплейса): каждая штука
 *    получает свою этикетку и едет в короб поставки, заказа у неё нет.
 *
 * Двадцать одинаковых штук — двадцать сканов: пересчёт глазами и есть место,
 * где в коробку уезжает соседний артикул.
 */

/** Префиксы этикеток стола упаковки. Латиницей, как и номера тары. */
const UNIT_LABEL_PREFIX = "UK-LBL-";
const ORDER_LABEL_PREFIX = "UK-ORD-";
export const TARGET_PREFIX = "UK-OUT-";

/**
 * Код этикетки отправления: один и тот же для одного назначения, сколько ни
 * печатай. Случайный код при каждой печати дал бы на один адрес десяток
 * разных этикеток. Хеш короткий: код набирают руками, если этикетка порвана.
 */
export function targetCode(destination: string): string {
  let h = 5381;
  for (const ch of destination.trim().toLowerCase())
    h = (Math.imul(h, 33) + ch.charCodeAt(0)) >>> 0;
  return `${TARGET_PREFIX}${h.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
}

/**
 * Тара посылок (FBS, Кирилл 13.11): все заказы в ней — заказы площадки. Короб
 * отгрузки упаковщик тогда не выбирает: каждый заказ — своя посылка со своей
 * этикеткой, посылки идут в любую тару и дальше на сортировку. Тара поставки
 * (FBO, заказы без номера) пакуется в короба поставки, как раньше.
 */
export function isParcelTote(orders: readonly ToteOrder[]): boolean {
  return orders.length > 0 && orders.every((o) => o.external);
}

/**
 * Посылки закрытой тары: каждый заказ, упакованный целиком, — запись со
 * своим кодом (этикетка заказа, у заказа из одной штуки — этикетка штуки).
 */
export function parcelsOf(
  session: PackSession,
  orders: readonly ToteOrder[],
): { code: string; requestIds: string[]; lines: { productId: string; qty: number }[] }[] {
  const out = [];
  for (const o of orders) {
    const units = session.units.filter((u) => u.orderId === o.id && u.confirmedAt);
    if (!isOrderComplete(session, o)) continue;
    const label =
      o.units === 1
        ? units[0]?.labelCode
        : session.orderLabels.find((l) => l.orderId === o.id && l.confirmedAt)?.labelCode;
    if (!label) continue;
    const m = new Map<string, number>();
    for (const u of units) m.set(u.productId, (m.get(u.productId) ?? 0) + 1);
    out.push({
      code: normalizeCode(label),
      requestIds: o.requestIds,
      lines: [...m].map(([productId, qty]) => ({ productId, qty })),
    });
  }
  return out;
}

export function unitLabelCode(sessionId: string, seq: number): string {
  return `${UNIT_LABEL_PREFIX}${sessionId.slice(-4).toUpperCase()}-${String(seq).padStart(3, "0")}`;
}

export function orderLabelCode(orderId: string): string {
  return `${ORDER_LABEL_PREFIX}${orderId.slice(-6).toUpperCase()}`;
}

/** Состав тары: товар → штук. */
export function toteContents(box: Box): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of box.lines) if (l.qty > 0) m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
  return m;
}

/** Заказ внутри тары: собранные заявки одного назначения — одна посылка. */
export interface ToteOrder {
  id: string;
  target: string | null;
  /** Заявки заказа: при закрытии тары они получают отметку «упакована». */
  requestIds: string[];
  /** Заказ площадки (есть номер): уходит отдельной посылкой. */
  external: boolean;
  /** Товар → сколько штук этого заказа. */
  need: Map<string, number>;
  units: number;
}

/**
 * Заказы, которые могут лежать в этой таре: собранные и не упакованные заявки,
 * чьи товары в таре есть. Заказ берётся, только если тара покрывает его
 * целиком — иначе это чужой заказ с тем же артикулом, и половина его
 * уехала бы не в ту посылку.
 */
export function toteOrders(requests: readonly FulfillmentRequest[], box: Box): ToteOrder[] {
  const contents = toteContents(box);
  const open = requests.filter((r) => r.status === "done" && !r.packedAt);
  // Заявка помнит свою тару (`toteId`): заказ из другой тары сюда не лёг,
  // даже если товар тот же — иначе тара Тулы закрыла бы заказ Казани. По
  // составу угадываем только заявки, собранные без тары (старые).
  const own = open.filter((r) => r.toteId === box.id);
  const ready = own.length > 0 ? own : open.filter((r) => !r.toteId);
  const left = new Map(contents);
  const out: ToteOrder[] = [];
  for (const g of groupRequestsByTarget(ready).flatMap(splitByOrder)) {
    const need = new Map<string, number>();
    for (const r of g.items) {
      const n = r.partial ? (r.pickedQty ?? 0) : r.qty;
      if (n > 0) need.set(r.productId, (need.get(r.productId) ?? 0) + n);
    }
    if (need.size === 0) continue;
    if (![...need].every(([p, n]) => (left.get(p) ?? 0) >= n)) continue;
    for (const [p, n] of need) left.set(p, (left.get(p) ?? 0) - n);
    out.push({
      id: g.items[0].id,
      target: g.target,
      requestIds: g.items.map((r) => r.id),
      external: !!g.items[0].externalId,
      need,
      units: [...need.values()].reduce((a, b) => a + b, 0),
    });
  }
  return out;
}

/**
 * Одно назначение — ещё не один заказ. Два покупателя с одним пунктом выдачи —
 * два заказа площадки, и у каждого своя этикетка: склеенные в один, они уехали
 * бы одной посылкой на один номер. Заказ площадки узнаём по номеру
 * (`source` + `externalId`); заявки без номера (FBO, ручные) остаются одним
 * заказом на назначение, как раньше.
 */
function splitByOrder<G extends { items: FulfillmentRequest[] }>(g: G): G[] {
  const byOrder = new Map<string, FulfillmentRequest[]>();
  for (const r of g.items) {
    const key = r.externalId ? `${r.source ?? ""}:${r.externalId.trim().toLowerCase()}` : "";
    byOrder.set(key, [...(byOrder.get(key) ?? []), r]);
  }
  return [...byOrder.values()].map((items) => ({ ...g, items }));
}

/** Сколько штук товара уже ушло из тары: упаковано или отбраковано. */
function takenFromTote(session: PackSession, productId: string): number {
  return (
    session.units.filter((u) => u.productId === productId).length +
    session.rejects.filter(
      (r) => r.productId === productId && (r.reason === "defect" || r.reason === "cancelled"),
    ).length
  );
}

/** Отменённый заказ, чей товар уже лежит в таре. */
export interface CancelledOrder {
  id: string;
  /** Товар → сколько штук этого заказа собрано в тару. */
  need: Map<string, number>;
}

/**
 * Заказы, которые отменили после сборки: товар собран в эту тару, а паковать
 * его некуда. Такую штуку не кладут в короб и не считают недостачей: она
 * остаётся в таре, и старший возвращает её на полку.
 */
export function cancelledInTote(
  requests: readonly FulfillmentRequest[],
  box: Box,
): CancelledOrder[] {
  const byOrder = new Map<string, CancelledOrder>();
  for (const r of requests) {
    if (r.toteId !== box.id || r.status !== "cancelled" || r.packedAt) continue;
    const n = r.partial ? (r.pickedQty ?? 0) : r.qty;
    if (n <= 0) continue;
    const key = r.externalId ? `${r.source ?? ""}:${r.externalId.trim().toLowerCase()}` : r.id;
    const o = byOrder.get(key) ?? { id: r.id, need: new Map<string, number>() };
    o.need.set(r.productId, (o.need.get(r.productId) ?? 0) + n);
    byOrder.set(key, o);
  }
  return [...byOrder.values()];
}

/**
 * Сколько штук отменённых заказов ещё лежит в таре несканированными: их не
 * ищут и в недостачу не пишут.
 */
function cancelledLeft(
  session: PackSession,
  cancelled: readonly CancelledOrder[],
  productId: string,
): number {
  const ids = new Set(cancelled.map((o) => o.id));
  const reserved = cancelled.reduce((a, o) => a + (o.need.get(productId) ?? 0), 0);
  const seen =
    session.rejects.filter((r) => r.productId === productId && r.reason === "cancelled").length +
    session.units.filter((u) => u.productId === productId && u.orderId && ids.has(u.orderId))
      .length;
  return Math.max(0, reserved - seen);
}

/**
 * Штуки, упакованные для заказа, который отменили, пока тара была на столе:
 * их вынимают из короба, и в короб отгрузки они не идут.
 */
export function packedForCancelled(
  session: PackSession,
  cancelled: readonly CancelledOrder[],
): PackSession["units"] {
  const ids = new Set(cancelled.map((o) => o.id));
  return session.units.filter((u) => u.orderId && ids.has(u.orderId));
}

/** Недостача: чего нет в упакованном и браке, за вычетом отменённого. */
export function toteShortage(
  session: PackSession,
  box: Box,
  cancelled: readonly CancelledOrder[] = [],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const [p, n] of toteRemaining(session, box)) {
    const left = n - cancelledLeft(session, cancelled, p);
    if (left > 0) m.set(p, left);
  }
  return m;
}

/** Что осталось в таре: состав минус упакованное и брак. */
function toteRemaining(session: PackSession, box: Box): Map<string, number> {
  const m = new Map<string, number>();
  for (const [p, n] of toteContents(box)) {
    const left = n - takenFromTote(session, p);
    if (left > 0) m.set(p, left);
  }
  return m;
}

/** Сколько штук заказа уже упаковано, по товарам. */
function packedForOrder(session: PackSession, orderId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of session.units)
    if (u.orderId === orderId) m.set(u.productId, (m.get(u.productId) ?? 0) + 1);
  return m;
}

export function isOrderComplete(session: PackSession, order: ToteOrder): boolean {
  const have = packedForOrder(session, order.id);
  return [...order.need].every(([p, n]) => (have.get(p) ?? 0) >= n);
}

/**
 * Что стол сообщает серверу, закрыв тару (`pack_done`, `cabinet/deskPack.js`):
 * сервер сам повторяет правку снимка по этим фактам и сверяет остатки.
 */
export interface PackDoneFacts {
  eventId: string;
  staffId: string;
  at: number;
  toteId: string;
  outboundCode: string;
  /** Короб отгрузки, куда легло упакованное; нет — ничего не легло. */
  outboundId: string | null;
  lines: { productId: string; qty: number }[];
  requestIds: string[];
  /** Недостача: спорное и его итог по товару. */
  shortages: { id: string; productId: string; qty: number }[];
}

export type ItemScan =
  | { kind: "ok"; productId: string; orderId?: string }
  /** Товар склада, но в этой таре его нет — отложить, разберётся старший. */
  | { kind: "not_in_tote"; productId: string }
  /** Товар из тары, но все его штуки уже прошли — лишняя штука. */
  | { kind: "extra"; productId: string }
  /** Товар отменённого заказа: не паковать, оставить в таре. */
  | { kind: "cancelled"; productId: string; orderId: string }
  /** Предыдущая этикетка ещё не отсканирована: сначала наклеить её. */
  | { kind: "label_pending" }
  | { kind: "unknown" };

/** Этикетка, которую сейчас ждут: единицы или заказа. */
export function pendingLabel(session: PackSession): string | null {
  const unit = session.units.find((u) => !u.confirmedAt);
  if (unit) return unit.labelCode;
  return session.orderLabels.find((l) => !l.confirmedAt)?.labelCode ?? null;
}

/**
 * Разобрать скан товара. Штука уходит в первый заказ тары, которому её ещё не
 * хватает; заказов нет или все закрыты по этому товару — едет без заказа.
 */
export function classifyItemScan(
  session: PackSession,
  box: Box,
  orders: readonly ToteOrder[],
  products: readonly Product[],
  raw: string,
  cancelled: readonly CancelledOrder[] = [],
): ItemScan {
  if (!normalizeCode(raw)) return { kind: "unknown" };
  if (pendingLabel(session)) return { kind: "label_pending" };
  const contents = toteContents(box);
  const inTote = products.filter((p) => contents.has(p.id));
  const product =
    inTote.find((p) => matchesProductCode(p, raw)) ??
    products.find((p) => matchesProductCode(p, raw));
  if (!product) return { kind: "unknown" };
  if (!contents.has(product.id)) return { kind: "not_in_tote", productId: product.id };
  if ((toteRemaining(session, box).get(product.id) ?? 0) <= 0)
    return { kind: "extra", productId: product.id };
  const order = orders.find((o) => {
    const need = o.need.get(product.id) ?? 0;
    return need > 0 && (packedForOrder(session, o.id).get(product.id) ?? 0) < need;
  });
  // Живой заказ важнее отменённого: штуку отменённого берём, только если
  // она больше никому не нужна.
  if (!order && cancelledLeft(session, cancelled, product.id) > 0) {
    const c = cancelled.find((o) => (o.need.get(product.id) ?? 0) > 0)!;
    return { kind: "cancelled", productId: product.id, orderId: c.id };
  }
  return { kind: "ok", productId: product.id, orderId: order?.id };
}

/** Время упаковки единиц, мс — по подтверждённым этикетками. */
function unitTimes(session: PackSession): number[] {
  return session.units.filter((u) => u.confirmedAt).map((u) => u.confirmedAt! - u.scannedAt);
}

function average(xs: readonly number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/**
 * Итог тары при закрытии. Недостача — то, что по составу должно было быть, но
 * не прошло ни упаковкой, ни браком: её не прячем, она уходит в отчёт.
 */
export function packSummary(
  session: PackSession,
  box: Box,
  cancelled: readonly CancelledOrder[] = [],
) {
  const shortage = toteShortage(session, box, cancelled);
  return {
    packed: session.units.filter((u) => u.confirmedAt).length,
    defects: session.rejects.filter((r) => r.reason === "defect").length,
    errors: session.rejects.filter((r) => r.reason !== "defect" && r.reason !== "cancelled").length,
    shortage: [...shortage.values()].reduce((a, b) => a + b, 0),
    avgMs: average(unitTimes(session)),
  };
}

/**
 * Где товар числится по учёту, кроме этой тары. Нужен упаковщику, когда
 * штука оказалась не в той таре: её несут старшему смены, и тот сразу видит,
 * откуда она пропала.
 */
export function boxesHolding(
  boxes: readonly Box[],
  productId: string,
  exceptBoxId: string,
): string[] {
  return boxes
    .filter(
      (b) => b.id !== exceptBoxId && b.lines.some((l) => l.productId === productId && l.qty > 0),
    )
    .map((b) => b.barcode);
}

/**
 * Почему скан не подошёл — «защита от дурака». Не «не та этикетка» на всё
 * подряд, а что именно перепутано: этикетку от другой штуки, этикетку заказа
 * вместо этикетки товара, код тары вместо этикетки. По сообщению человек
 * сразу понимает, что исправить, и не клеит этикетку не туда.
 */
export type ScanMistake =
  | "label_used"
  | "label_other"
  | "label_foreign"
  | "label_not_item"
  | "tote_code"
  | "product_not_label";

export function explainScan(
  session: PackSession,
  box: Box,
  products: readonly Product[],
  raw: string,
): ScanMistake | null {
  const code = normalizeCode(raw);
  if (!code) return null;
  const want = pendingLabel(session);
  if (code === normalizeCode(box.barcode) || code === normalizeCode(session.targetCode))
    return "tote_code";
  const isLabel = code.startsWith(UNIT_LABEL_PREFIX) || code.startsWith(ORDER_LABEL_PREFIX);
  if (!want) return isLabel ? "label_not_item" : null;
  if (code === normalizeCode(want)) return null;
  if (session.units.some((u) => u.confirmedAt && normalizeCode(u.labelCode) === code))
    return "label_used";
  if (
    session.orderLabels.some((l) => normalizeCode(l.labelCode) === code) ||
    session.units.some((u) => normalizeCode(u.labelCode) === code)
  )
    return "label_other";
  if (isLabel) return "label_foreign";
  if (products.some((p) => matchesProductCode(p, raw))) return "product_not_label";
  return null;
}

export type PickToteProblem =
  "tote_placed" | "tote_sealed" | "tote_busy" | "tote_other_seller" | "tote_other_target";

/**
 * Можно ли собирать эту заявку в эту тару. Тара сборки — короб без места на
 * складе: короб на полке — это хранение, а не тара. В одной таре — один
 * продавец и одно назначение, как и в коробе отгрузки (`packTargetProblem`):
 * иначе на столе упаковки её не разложить ни в один короб.
 */
export function pickToteProblem(input: {
  tote: Box;
  request: FulfillmentRequest;
  requests: readonly FulfillmentRequest[];
  products: readonly Product[];
}): PickToteProblem | null {
  const { tote, request, requests, products } = input;
  if (tote.address) return "tote_placed";
  if (tote.sealed) return "tote_sealed";
  // Тара сборки — пустая или та, в которую уже собирают открытые заявки.
  // Товар в коробе без заявок — это принятое и не разложенное (или остаток
  // старшему после упаковки): в заказ оно уйти не должно.
  const collecting = requests.some(
    (r) =>
      r.toteId === tote.id && !r.packedAt && r.status !== "shipped" && r.status !== "cancelled",
  );
  if (toteContents(tote).size > 0 && !collecting) return "tote_busy";
  const sellerOf = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? (p.partnerId ?? "") : `?${id}`;
  };
  const inTote = [...toteContents(tote).keys()];
  if (inTote.some((p) => sellerOf(p) !== sellerOf(request.productId))) return "tote_other_seller";
  // Назначение тары — у заявок, собранных в неё и ещё не упакованных.
  const target = request.note?.trim() || "";
  const other = requests.some(
    (r) =>
      r.toteId === tote.id &&
      !r.packedAt &&
      r.status !== "shipped" &&
      r.status !== "cancelled" &&
      (r.note?.trim() || "") !== target,
  );
  return other ? "tote_other_target" : null;
}
