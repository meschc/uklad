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
  const box = d.boxId ? boxes.find((b) => b.id === d.boxId) : undefined;
  if (!box || !d.productId) return true;
  const have = box.lines.filter((l) => l.productId === d.productId).reduce((n, l) => n + l.qty, 0);
  return have < d.qty;
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
