import type { Box, FulfillmentRequest } from "./types";

/**
 * Заказ в двух тарах (Кирилл 17.11) — те же правила, что у сервера
 * (`server/api/src/cabinet/deskMerge.js`).
 *
 * Тара переполнилась — сборщик доложил заказ площадки в другую. Упаковка
 * такой заказ не пакует (`heldInTote`): одна этикетка — одна посылка. Упаковщик
 * сканирует вторую тару, она пересыпается в ту, что на столе, и заказ целый.
 * Пересыпать можно только тару, где лежат одни части заказов этой тары:
 * перенос чужого заказа — действие старшего.
 */
export type MergeProblem =
  /** Не тара сборки: полка, невскрытая или та же самая. */
  | "bad"
  /** В той таре чужой заказ или в неё ещё собирают. */
  | "mixed";

const orderKey = (r: FulfillmentRequest) =>
  r.externalId ? `${r.source ?? ""}:${r.externalId.trim().toLowerCase()}` : `#${r.id}`;
const isOpen = (r: FulfillmentRequest) =>
  !r.packedAt && r.status !== "shipped" && r.status !== "cancelled";

/** Почему тару `from` нельзя пересыпать в `into`: null — можно. */
export function mergeProblem(
  requests: readonly FulfillmentRequest[],
  into: Box | undefined,
  from: Box | undefined,
): MergeProblem | null {
  if (!into || !from || into.id === from.id) return "bad";
  if (into.address || into.sealed || from.address || from.sealed) return "bad";
  const here = new Set(
    requests
      .filter((r) => r.externalId && r.toteId === into.id && r.status === "done" && isOpen(r))
      .map(orderKey),
  );
  const there = requests.filter((r) => r.toteId === from.id && isOpen(r));
  if (there.length === 0) return "mixed";
  if (there.some((r) => r.status !== "done")) return "mixed";
  if (there.some((r) => !r.externalId || !here.has(orderKey(r)))) return "mixed";
  return null;
}

/** Пересыпать: строки складываются, заявки той тары числятся в этой. */
export function applyMerge(
  s: { boxes: readonly Box[]; requests: readonly FulfillmentRequest[] },
  into: Box,
  from: Box,
  at: number,
): { boxes: Box[]; requests: FulfillmentRequest[] } {
  const lines = new Map<string, number>();
  for (const l of [...into.lines, ...from.lines])
    if (l.qty > 0) lines.set(l.productId, (lines.get(l.productId) ?? 0) + l.qty);
  return {
    boxes: s.boxes.map((b) =>
      b.id === into.id
        ? { ...b, lines: [...lines].map(([productId, qty]) => ({ productId, qty })) }
        : b.id === from.id
          ? { ...b, lines: [] }
          : b,
    ),
    requests: s.requests.map((r) =>
      r.toteId === from.id && isOpen(r) ? { ...r, toteId: into.id, updatedAt: at } : r,
    ),
  };
}
