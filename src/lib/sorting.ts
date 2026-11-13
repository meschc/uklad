import { normalizeCode, PALLET_PREFIX } from "./barcode";
import type { FulfillmentRequest, OutboundBox } from "./types";

/**
 * Сортировка: посылки и короба отгрузки — на паллеты по назначению (склад
 * площадки, ПВЗ). Чистые правила; стол — `SortStation`, запись — операция
 * `sort_place`.
 *
 * Два скана на место: сначала посылка (код короба отгрузки), экран крупно
 * показывает её назначение цветом и звуком; потом паллета этого назначения.
 * Паллета принимает назначение первой посылки и дальше берёт только его.
 * Посылку, уже лежащую на паллете, второй раз не кладут: повторный скан
 * останавливает стол до старшего — обычно это значит, что похожая посылка
 * ушла не туда.
 */

/** Назначение заявок короба: одно, если все заявки едут в одно место. */
function boxDestination(box: OutboundBox, requests: readonly FulfillmentRequest[]): string | null {
  const dests = new Set(
    requests
      .filter((r) => box.requestIds.includes(r.id))
      .map((r) => r.note?.trim())
      .filter((d): d is string => !!d),
  );
  return dests.size === 1 ? [...dests][0] : null;
}

/** Открытые короба на паллете сортировки. */
export function palletBoxes(list: readonly OutboundBox[], pallet: string): OutboundBox[] {
  const code = normalizeCode(pallet);
  return list.filter((b) => !b.shipmentId && b.palletCode && normalizeCode(b.palletCode) === code);
}

/** Назначение паллеты — по первой посылке на ней; пустая — `null`. */
function palletDestination(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
  pallet: string,
): string | null {
  const first = palletBoxes(list, pallet)[0];
  return first ? boxDestination(first, requests) : null;
}

export type SortScan =
  /** Посылка принята, ждём паллету её назначения. */
  | { kind: "parcel"; box: OutboundBox; destination: string }
  /** Посылка легла на паллету. */
  | { kind: "placed"; box: OutboundBox; pallet: string; destination: string }
  /** Код не посылка и не паллета, или такой посылки нет среди открытых. */
  | { kind: "unknown"; code: string }
  /** У посылки нет одного назначения (без заявок или в разные места). */
  | { kind: "no_destination"; code: string }
  /** Посылка уже лежит на паллете — повторный скан, стоп до старшего. */
  | { kind: "dup"; code: string; pallet: string }
  /** Паллета другого назначения. */
  | { kind: "wrong_pallet"; pallet: string; palletDestination: string; destination: string }
  /** Паллету сканируют, а посылки ещё не было. */
  | { kind: "pallet_first"; pallet: string }
  /** Вместо паллеты — снова посылка: сначала положите прежнюю. */
  | { kind: "parcel_pending"; code: string };

/**
 * Разобрать скан. `pending` — код посылки, назначение которой показано и
 * ждёт паллету.
 */
export function classifySortScan(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
  pending: string | null,
  raw: string,
): SortScan {
  const code = normalizeCode(raw);
  if (code.startsWith(PALLET_PREFIX)) {
    if (!pending) return { kind: "pallet_first", pallet: code };
    const box = openBox(list, pending);
    const destination = box && boxDestination(box, requests);
    if (!box || !destination) return { kind: "unknown", code: pending };
    const has = palletDestination(list, requests, code);
    if (has && has !== destination) {
      return { kind: "wrong_pallet", pallet: code, palletDestination: has, destination };
    }
    return { kind: "placed", box, pallet: code, destination };
  }
  const box = openBox(list, code);
  if (!box) return { kind: "unknown", code };
  if (box.palletCode) return { kind: "dup", code, pallet: box.palletCode };
  if (pending && normalizeCode(pending) !== code) return { kind: "parcel_pending", code };
  const destination = boxDestination(box, requests);
  if (!destination) return { kind: "no_destination", code };
  return { kind: "parcel", box, destination };
}

function openBox(list: readonly OutboundBox[], code: string): OutboundBox | undefined {
  const c = normalizeCode(code);
  return list.find((b) => !b.shipmentId && normalizeCode(b.code) === c);
}

/** Что ещё не разложено: открытые короба с назначением и без паллеты. */
export function unsorted(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
): { box: OutboundBox; destination: string }[] {
  return list
    .filter((b) => !b.shipmentId && !b.palletCode)
    .map((box) => ({ box, destination: boxDestination(box, requests) }))
    .filter((x): x is { box: OutboundBox; destination: string } => !!x.destination);
}

/** Паллеты сортировки в работе: код, назначение, сколько посылок. */
export function sortPallets(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
): { pallet: string; destination: string | null; count: number }[] {
  const by = new Map<string, OutboundBox[]>();
  for (const b of list) {
    if (b.shipmentId || !b.palletCode) continue;
    const k = normalizeCode(b.palletCode);
    by.set(k, [...(by.get(k) ?? []), b]);
  }
  return [...by].map(([pallet, boxes]) => ({
    pallet,
    destination: boxDestination(boxes[0], requests),
    count: boxes.length,
  }));
}
