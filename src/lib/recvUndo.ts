import type { Box, Dispute, ExpectedShipment, ReceivingEvent } from "./types";
import { frozenBoxes } from "./inventory";
import { defectDisputeId, overageDisputeId } from "./disputes";

/**
 * Отмена своего скана приёмки (`recv_undo`, Кирилл 27.11) — те же правила,
 * что у сервера (`deskReceive.js` `applyRecvUndo`). «Принял 10, а было 8»:
 * последний скан снимается целиком, верное число принимают заново. Можно
 * только свой скан и только пока тара на рампе; лишнее или брак, по которым
 * ждут старшего, — к старшему.
 */
export type RecvUndoProblem = "missing" | "not_yours" | "late" | "disputed";

interface RecvUndoState {
  receivingEvents: readonly ReceivingEvent[];
  boxes: readonly Box[];
  expectedShipments: readonly ExpectedShipment[];
  disputes?: readonly Dispute[];
}

export interface RecvUndoPlan {
  scan: ReceivingEvent;
  box: Box;
  shipmentId?: string;
}

const undone = (events: readonly ReceivingEvent[], id: string) =>
  events.some((e) => e.undoes === id);

/** Скан и его отмена из счёта выпадают оба: приёмки не было. */
export function liveReceipts<T extends ReceivingEvent>(events: readonly T[]): T[] {
  const gone = new Set(events.filter((e) => e.undoes).map((e) => e.undoes));
  if (gone.size === 0) return events as T[];
  return events.filter((e) => !e.undoes && !gone.has(e.id));
}

/** Последний свой неотменённый скан в эту тару — его и предлагает отменить экран. */
export function lastReceipt(
  events: readonly ReceivingEvent[],
  boxId: string,
  by: string,
): ReceivingEvent | undefined {
  return [...events]
    .reverse()
    .find((e) => !e.undoes && e.boxId === boxId && e.staffId === by && !undone(events, e.id));
}

export function planRecvUndo(
  s: RecvUndoState,
  scanId: string,
  by: string,
): { ok: true; plan: RecvUndoPlan } | { ok: false; problem: RecvUndoProblem } {
  const scan = s.receivingEvents.find((e) => e.id === scanId && !e.undoes);
  if (!scan || undone(s.receivingEvents, scanId)) return { ok: false, problem: "missing" };
  if (scan.staffId !== by) return { ok: false, problem: "not_yours" };
  const box = s.boxes.find((b) => b.id === scan.boxId);
  const have = (box?.lines ?? [])
    .filter((l) => l.productId === scan.productId)
    .reduce((n, l) => n + l.qty, 0);
  if (!box || box.address || box.sealed || have < scan.qty) return { ok: false, problem: "late" };
  if (frozenBoxes(s.disputes ?? []).has(box.id)) return { ok: false, problem: "late" };
  const shipment = scan.expectedShipmentLineId
    ? s.expectedShipments.find((sh) => sh.lines.some((l) => l.id === scan.expectedShipmentLineId))
    : undefined;
  if (shipment?.status === "closed") return { ok: false, problem: "late" };
  const held = (s.disputes ?? []).some(
    (d) =>
      !d.resolution && (d.id === overageDisputeId(scan.id) || d.id === defectDisputeId(scan.id)),
  );
  if (held) return { ok: false, problem: "disputed" };
  return { ok: true, plan: { scan, box, ...(shipment ? { shipmentId: shipment.id } : {}) } };
}
