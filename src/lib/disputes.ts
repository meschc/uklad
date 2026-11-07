import type { Box, Dispute } from "./types";

/**
 * Почему списать нельзя: недостачу и брак списывают из тары, и в ней должно
 * лежать не меньше, чем списывают. Остальное спорное товар не двигает.
 */
export function writeOffProblem(boxes: readonly Box[], d: Dispute): boolean {
  if (d.kind !== "shortage" && d.kind !== "not_packable") return false;
  const box = d.boxId ? boxes.find((b) => b.id === d.boxId) : undefined;
  if (!box || !d.productId) return true;
  const have = box.lines.filter((l) => l.productId === d.productId).reduce((n, l) => n + l.qty, 0);
  return have < d.qty;
}
