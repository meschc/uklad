import type { Box, Dispute, DisputeResolution } from "./types";

/**
 * Списание какого спорного уводит товар со склада: недостача и брак в таре,
 * лишнее с приёмки (вернули поставщику). Остальное спорное товар не двигает.
 */
export const writesOffGoods = (d: Pick<Dispute, "kind">): boolean =>
  d.kind === "shortage" || d.kind === "not_packable" || d.kind === "receive_overage";

/** Какие решения у спорного: лишнее с приёмки оставляют или списывают. */
export const resolutionsFor = (d: Pick<Dispute, "kind">): DisputeResolution[] =>
  d.kind === "receive_overage" ? ["accepted", "written_off"] : ["returned", "moved", "written_off"];

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
