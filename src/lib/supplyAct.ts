import type { Dispute, ExpectedShipment, ReceivingAnswer } from "./types";

/**
 * Акт расхождений поставки глазами продавца (Кирилл 17.11): что он заявил,
 * что склад принял по факту и что стало с излишком. Только строки его товара —
 * у поставки могут быть и чужие строки, если её завёл склад.
 *
 * Излишек склад не продаёт, пока старший не решит (`heldQty`): «ждёт решения»,
 * «оставлен на складе» или «убран» (вернут продавцу).
 */
type OverageState = "pending" | "accepted" | "removed";

export interface SupplyActLine {
  lineId: string;
  productId: string;
  expected: number;
  received: number;
  /** Принято минус заявлено: меньше нуля — недостача, больше — излишек. */
  diff: number;
  /** Что с излишком по этой строке; нет — излишка нет или решение не найдено. */
  overage?: OverageState;
}

function overageState(disputes: readonly Dispute[]): OverageState | undefined {
  if (disputes.length === 0) return undefined;
  if (disputes.some((d) => !d.resolution)) return "pending";
  return disputes.some((d) => d.resolution === "accepted") ? "accepted" : "removed";
}

export function supplyAct(
  shipment: ExpectedShipment,
  mine: ReadonlySet<string>,
  disputes: readonly Dispute[],
): SupplyActLine[] {
  return shipment.lines
    .filter((l) => mine.has(l.productId))
    .map((l) => {
      const overage = overageState(
        disputes.filter((d) => d.kind === "receive_overage" && d.lineId === l.id),
      );
      return {
        lineId: l.id,
        productId: l.productId,
        expected: l.expectedQty,
        received: l.receivedQty,
        diff: l.receivedQty - l.expectedQty,
        ...(overage ? { overage } : {}),
      };
    });
}

/**
 * Есть ли что показать продавцу: излишек — сразу, недостача — только у
 * закрытой поставки (пока приёмка идёт, «не хватает» значит «ещё не дошли»).
 */
export function hasDiscrepancy(
  shipment: ExpectedShipment,
  lines: readonly SupplyActLine[],
): boolean {
  return lines.some((l) => l.diff > 0 || (shipment.status === "closed" && l.diff < 0));
}

/** Сколько суток после закрытия поставки продавец может ответить на акт (как на сервере). */
export const ANSWER_DAYS = 3;
const DAY_MS = 24 * 3_600_000;

/** До какого момента продавец может ответить; у незакрытой поставки срока ещё нет. */
export function answerDeadline(shipment: ExpectedShipment): number | undefined {
  if (shipment.status !== "closed") return undefined;
  return (shipment.closedAt ?? shipment.createdAt) + ANSWER_DAYS * DAY_MS;
}

/**
 * Где акт по ответу продавца: ждёт ответа, согласен, молчал трое суток
 * (молчание — согласие, так в оферте), возразил и ждёт склада, склад ответил.
 */
export type AnswerState = "waiting" | "open" | "agreed" | "silent" | "disputed" | "resolved";

export function answerState(
  shipment: ExpectedShipment,
  answer: ReceivingAnswer | undefined,
  now: number,
): AnswerState {
  if (answer?.answer === "agree") return "agreed";
  if (answer?.answer === "dispute") return answer.resolution ? "resolved" : "disputed";
  const until = answerDeadline(shipment);
  if (until === undefined) return "waiting";
  return now > until ? "silent" : "open";
}

/** Открытые возражения продавцов на акт приёмки: ждут ответа старшего. */
export const openObjections = (answers: readonly ReceivingAnswer[]) =>
  answers.filter((a) => a.answer === "dispute" && !a.resolution);
