import type { Box, CargoIntake, Pallet } from "./types";

/**
 * Грузовая приёмка: места поставки до вскрытия. Чистые расчёты — сверка мест
 * с накладной и список того, что ещё ждёт товарной приёмки.
 */

export interface PlaceDiff {
  /** Факт минус накладная; `null` — по накладной не заявлено, сверять не с чем. */
  pallets: number | null;
  boxes: number | null;
}

export function cargoDiff(c: CargoIntake): PlaceDiff {
  return {
    pallets: c.declaredPallets == null ? null : c.pallets - c.declaredPallets,
    boxes: c.declaredBoxes == null ? null : c.boxes - c.declaredBoxes,
  };
}

/** Есть ли расхождение по местам — акт нужен прямо при водителе. */
export function hasCargoDiff(c: CargoIntake): boolean {
  const d = cargoDiff(c);
  return (d.pallets ?? 0) !== 0 || (d.boxes ?? 0) !== 0;
}

export interface SealedUnits {
  pallets: Pallet[];
  /** Короба без паллеты: короба на невскрытой паллете здесь не числятся. */
  boxes: Box[];
}

/** Места поставки, принятые и ещё не вскрытые. */
export function sealedUnits(
  shipmentId: string | null,
  pallets: Pallet[],
  boxes: Box[],
): SealedUnits {
  if (!shipmentId) return { pallets: [], boxes: [] };
  return {
    pallets: pallets.filter((p) => p.sealed && p.shipmentId === shipmentId),
    boxes: boxes.filter((b) => b.sealed && b.shipmentId === shipmentId && !b.palletId),
  };
}

/** Сложить новую машину с уже принятым по поставке. */
export function mergeCargo(prev: CargoIntake | undefined, next: CargoIntake): CargoIntake {
  if (!prev) return next;
  return {
    declaredPallets: next.declaredPallets ?? prev.declaredPallets,
    declaredBoxes: next.declaredBoxes ?? prev.declaredBoxes,
    pallets: prev.pallets + next.pallets,
    boxes: prev.boxes + next.boxes,
    at: next.at,
    staffId: next.staffId ?? prev.staffId,
  };
}
