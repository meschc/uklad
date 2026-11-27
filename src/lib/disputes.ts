import type { Box, Dispute, DisputeResolution } from "./types";

/**
 * Списание какого спорного уводит товар со склада: недостача и брак в таре,
 * лишнее с приёмки (вернули поставщику), недостача по инвентаризации.
 */
export const writesOffGoods = (d: Pick<Dispute, "kind">): boolean =>
  d.kind === "shortage" ||
  d.kind === "not_packable" ||
  d.kind === "receive_overage" ||
  d.kind === "inventory_short";

/** Спорное, которое завёл пересчёт тары. */
export const isInventoryDispute = (d: Pick<Dispute, "kind">): boolean =>
  d.kind === "inventory_short" || d.kind === "inventory_over";

/** Излишек по инвентаризации: «оприходовать» добавляет его в ту же тару. */
export const adoptsGoods = (d: Pick<Dispute, "kind">): boolean => d.kind === "inventory_over";

/**
 * Какие решения у спорного: лишнее с приёмки оставляют или списывают; по
 * инвентаризации учёт правят к факту либо закрывают без правки.
 */
export const resolutionsFor = (d: Pick<Dispute, "kind">): DisputeResolution[] => {
  if (d.kind === "receive_overage") return ["accepted", "written_off"];
  if (d.kind === "inventory_short") return ["returned", "written_off"];
  if (d.kind === "inventory_over") return ["returned", "accepted"];
  return ["returned", "moved", "written_off"];
};

/**
 * Решение, которое само меняет остаток: списание и оприходование излишка.
 * Остальные решения товар не двигают.
 */
const changesStock = (d: Pick<Dispute, "kind">, r: DisputeResolution): boolean =>
  (r === "written_off" && writesOffGoods(d)) || (r === "accepted" && adoptsGoods(d));

/**
 * Нужны ли причина и второй человек: списание всегда, оприходование излишка
 * тоже. Тот, кто нашёл расхождение, свою же правку учёта не подтверждает.
 */
export const needsSecondPair = (d: Pick<Dispute, "kind">, r: DisputeResolution): boolean =>
  r === "written_off" || changesStock(d, r);

/**
 * Почему списать нельзя: товар списывают из тары, и в ней должно лежать не
 * меньше, чем списывают.
 */
export function writeOffProblem(boxes: readonly Box[], d: Dispute): boolean {
  if (!writesOffGoods(d)) return false;
  return !inTote(boxes, d);
}

/** Лежит ли найденное в своей таре целиком — есть что перекладывать или списывать. */
export function inTote(boxes: readonly Box[], d: Dispute): boolean {
  const box = d.boxId ? boxes.find((b) => b.id === d.boxId) : undefined;
  if (!box || !d.productId) return false;
  const have = box.lines.filter((l) => l.productId === d.productId).reduce((n, l) => n + l.qty, 0);
  return have >= d.qty;
}

/** Куда можно переложить: любая другая тара, кроме невскрытой. */
export const moveTargets = (boxes: readonly Box[], d: Dispute): Box[] =>
  boxes.filter((b) => b.id !== d.boxId && !b.sealed);

/**
 * Переложить найденное в другую тару (Кирилл 13.11: «с подтверждением и
 * выбором, куда»): строки уходят из исходной в выбранную, итог по товару не
 * меняется. Нечего или некуда — `null`.
 */
export function moveInto(boxes: readonly Box[], d: Dispute, toId: string): Box[] | null {
  if (!inTote(boxes, d) || !moveTargets(boxes, d).some((b) => b.id === toId)) return null;
  const pid = d.productId!;
  let left = d.qty;
  return boxes.map((b) => {
    if (b.id === d.boxId) {
      const lines = b.lines
        .map((l) => {
          if (l.productId !== pid || left <= 0) return l;
          const take = Math.min(l.qty, left);
          left -= take;
          return { ...l, qty: l.qty - take };
        })
        .filter((l) => l.qty > 0);
      return { ...b, lines };
    }
    if (b.id !== toId) return b;
    const has = b.lines.some((l) => l.productId === pid);
    return {
      ...b,
      lines: has
        ? b.lines.map((l) => (l.productId === pid ? { ...l, qty: l.qty + d.qty } : l))
        : [...b.lines, { productId: pid, qty: d.qty }],
    };
  });
}

/** Оприходовать излишек: строки тары плюс найденное. */
export function adoptInto(boxes: readonly Box[], d: Dispute): Box[] {
  return boxes.map((b) => {
    if (b.id !== d.boxId || !d.productId) return b;
    const has = b.lines.some((l) => l.productId === d.productId);
    return {
      ...b,
      lines: has
        ? b.lines.map((l) => (l.productId === d.productId ? { ...l, qty: l.qty + d.qty } : l))
        : [...b.lines, { productId: d.productId, qty: d.qty }],
    };
  });
}

/**
 * Карантин излишка с приёмки (Кирилл 17.11): лишнее сверх заявленной строки
 * поставки, по которому старший ещё не решил, лежит в своей таре, но из неё
 * его не собирают и в кроссдок не отдают. Сколько штук товара в таре держит открытое «Лишнее с приёмки».
 * Решение «оставить» снимает карантин, «убрать» уводит штуки из тары.
 */
// Брак (`not_packable`) — с приёмки или упаковки — тоже в карантине: лежит
// в таре на учёте, но собрать или отдать в кроссдок его нельзя.
export function heldQty(
  disputes: readonly Dispute[],
  boxId: string | undefined,
  productId: string,
): number {
  if (!boxId) return 0;
  return disputes
    .filter(
      (d) =>
        ((d.kind === "receive_overage" && !!d.lineId) || d.kind === "not_packable") &&
        !d.resolution &&
        d.boxId === boxId &&
        d.productId === productId,
    )
    .reduce((n, d) => n + d.qty, 0);
}

/** Спорное «брак» с приёмки: id от события приёмки — тот же, что ставит сервер. */
export const defectDisputeId = (eventId: string): string => `def-${eventId}`.slice(0, 100);

/** Сколько товара в таре можно взять в работу: всё, кроме излишка в карантине. */
export function freeInBox(disputes: readonly Dispute[], box: Box, productId: string): number {
  const have = box.lines.filter((l) => l.productId === productId).reduce((n, l) => n + l.qty, 0);
  return Math.max(0, have - heldQty(disputes, box.id, productId));
}

/**
 * Сколько из принятого вышло за строку поставки — то же правило, что у
 * сервера (`receivedOver` в `deskStock.js`): без строки лишнее всё принятое,
 * со строкой — только то, что сверх ожидаемого с учётом уже принятого.
 */
export function overReceived(
  line: { expectedQty: number; receivedQty: number } | undefined,
  qty: number,
): number {
  if (!line) return qty;
  return Math.max(0, Math.min(qty, line.receivedQty + qty - line.expectedQty));
}

/** Id спорного по лишнему с приёмки — из id события, как на сервере: повтор не задвоит. */
export const overageDisputeId = (eventId: string): string => `ovr-${eventId}`.slice(0, 100);
