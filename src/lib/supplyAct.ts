import type { Dispute, ExpectedShipment } from "./types";

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
