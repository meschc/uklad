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
export const UNIT_LABEL_PREFIX = "UK-LBL-";
export const ORDER_LABEL_PREFIX = "UK-ORD-";
export const TARGET_PREFIX = "UK-OUT-";

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
  const ready = requests.filter((r) => r.status === "done" && !r.packedAt);
  const left = new Map(contents);
  const out: ToteOrder[] = [];
  for (const g of groupRequestsByTarget(ready)) {
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
      need,
      units: [...need.values()].reduce((a, b) => a + b, 0),
    });
  }
  return out;
}

/** Сколько штук товара уже ушло из тары: упаковано или отбраковано. */
function takenFromTote(session: PackSession, productId: string): number {
  return (
    session.units.filter((u) => u.productId === productId).length +
    session.rejects.filter((r) => r.productId === productId && r.reason === "defect").length
  );
}

/** Что осталось в таре: состав минус упакованное и брак. */
export function toteRemaining(session: PackSession, box: Box): Map<string, number> {
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

export type ItemScan =
  | { kind: "ok"; productId: string; orderId?: string }
  /** Товар склада, но в этой таре его нет — отложить, разберётся старший. */
  | { kind: "not_in_tote"; productId: string }
  /** Товар из тары, но все его штуки уже прошли — лишняя штука. */
  | { kind: "extra"; productId: string }
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
  return { kind: "ok", productId: product.id, orderId: order?.id };
}

/** Время упаковки единиц, мс — по подтверждённым этикетками. */
export function unitTimes(session: PackSession): number[] {
  return session.units.filter((u) => u.confirmedAt).map((u) => u.confirmedAt! - u.scannedAt);
}

export function average(xs: readonly number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/**
 * Итог тары при закрытии. Недостача — то, что по составу должно было быть, но
 * не прошло ни упаковкой, ни браком: её не прячем, она уходит в отчёт.
 */
export function packSummary(session: PackSession, box: Box) {
  const shortage = toteRemaining(session, box);
  return {
    packed: session.units.filter((u) => u.confirmedAt).length,
    defects: session.rejects.filter((r) => r.reason === "defect").length,
    errors: session.rejects.filter((r) => r.reason !== "defect").length,
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
