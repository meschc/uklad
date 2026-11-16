import { addressKey } from "./address";
import { frozenBoxes } from "./inventory";
import type { Box, Dispute, FulfillmentRequest, StaffEvent } from "./types";

/**
 * Отмена скана в сборке (`pick_undo`) — те же правила, что у сервера
 * (`server/api/src/cabinet/deskPick.js`, `applyPickUndo`).
 *
 * Сборщик ошибся: положил штуку не в ту тару, снял лишнюю, тара полна.
 * Штука возвращается из тары сборки в тот же короб, из которого её сняли, а
 * собранное по заявке −1. Скан из журнала не исчезает: рядом ложится отмена
 * со ссылкой на него, и разбор «кто что снимал» видит и ошибку, и
 * исправление.
 *
 * Отменить можно только свой скан, пока заявка не упакована и штука ещё в
 * таре. Короб уехал с места или заморожен пересчётом — «на место» вернуть
 * нельзя, штуку разбирает старший.
 */
export type PickUndoProblem =
  /** Скана нет или он уже отменён. */
  | "missing"
  /** Чужой скан. */
  | "not_yours"
  /** Скан до этой правки: не помнит, откуда сняли. */
  | "old"
  /** Сняли с прямого размещения: его ставит только руководитель. */
  | "place"
  /** Заявка упакована или штуки в таре уже нет. */
  | "late"
  /** Короб уехал с места или заморожен пересчётом. */
  | "moved";

export interface PickUndoState {
  staffEvents: readonly StaffEvent[];
  requests: readonly FulfillmentRequest[];
  boxes: readonly Box[];
  disputes?: readonly Dispute[];
}

export interface PickUndoPlan {
  pick: StaffEvent;
  request: FulfillmentRequest;
  tote: Box;
  from: Box;
}

const UNDO_OPEN = new Set<FulfillmentRequest["status"]>(["new", "in_progress", "done"]);

/** Уже отменён ли скан. */
const isUndone = (events: readonly StaffEvent[], pickId: string) =>
  events.some((e) => e.type === "pick_undo" && e.undoes === pickId);

/** Что именно вернётся и куда — или почему нельзя. */
export function planPickUndo(
  s: PickUndoState,
  pickId: string,
  staffId: string,
): { ok: true; plan: PickUndoPlan } | { ok: false; problem: PickUndoProblem } {
  const no = (problem: PickUndoProblem) => ({ ok: false as const, problem });
  const pick = s.staffEvents.find((e) => e.id === pickId && e.type === "pick_scan");
  if (!pick || isUndone(s.staffEvents, pickId)) return no("missing");
  if (pick.staffId !== staffId) return no("not_yours");
  if (!pick.requestId || !pick.cell) return no("old");
  if (!pick.boxId) return no("place");
  const request = s.requests.find((r) => r.id === pick.requestId);
  if (
    !request ||
    request.packedAt ||
    !UNDO_OPEN.has(request.status) ||
    (request.pickedQty ?? 0) < 1
  ) {
    return no("late");
  }
  const tote = s.boxes.find((b) => b.id === request.toteId);
  if (!tote || !tote.lines.some((l) => l.productId === pick.productId && l.qty > 0)) {
    return no("late");
  }
  const from = s.boxes.find((b) => b.id === pick.boxId);
  if (
    !from ||
    from === tote ||
    frozenBoxes(s.disputes ?? []).has(from.id) ||
    !from.address ||
    addressKey(from.address) !== addressKey(pick.cell)
  ) {
    return no("moved");
  }
  return { ok: true, plan: { pick, request, tote, from } };
}

/**
 * Последний свой неотменённый скан по заявке — его и предлагает отменить
 * экран сборки. Отменили — следующим становится предыдущий.
 */
export function lastPick(
  events: readonly StaffEvent[],
  requestId: string,
  staffId: string,
): StaffEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type !== "pick_scan" || e.requestId !== requestId || e.staffId !== staffId) continue;
    if (!isUndone(events, e.id)) return e;
  }
  return undefined;
}

/** Заявка на шаг назад: собранное −1; вернули последнюю — снова новая, без тары. */
export function stepBack(r: FulfillmentRequest, at: number): FulfillmentRequest {
  const left = Math.max(0, (r.pickedQty ?? 0) - 1);
  const out: FulfillmentRequest = { ...r, pickedQty: left, updatedAt: at };
  if (r.status === "done") {
    delete out.partial;
    delete out.pickedAt;
  }
  if (left === 0) {
    out.status = "new";
    delete out.toteId;
  } else out.status = "in_progress";
  return out;
}
