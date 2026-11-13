import { normalizeCode } from "./barcode";
import { targetCode, TARGET_PREFIX } from "./packing";
import type { FulfillmentRequest, OutboundBox } from "./types";

/**
 * Сортировка по местам отгрузки (Кирилл 13.11). Чистые правила; стол —
 * `SortStation`, запись — операции `sort_place` и `sort_close`.
 *
 * Место сортировки (`UK-SORT-…`) — одна отгрузка в одно направление:
 * «Константиново, отгрузка 2». QR места один на всю отгрузку: начали новую
 * коробку для мелочи — QR тот же. Сортировщик сканирует посылку (этикетку
 * заказа или короб поставки), экран крупно показывает направление, потом —
 * QR места этого направления. Отгрузку закрывает старший: говорит, сколько
 * получилось паллет и коробок, и печатает ярлык на каждое грузовое место
 * (`UK-OUT-…`, «место 2 из 5»). По ярлыкам мест потом грузят машину. Следующая
 * отгрузка в то же направление — следующий номер места.
 *
 * Отдельной таблицы мест нет: номер места выводится из кода (хеш направления
 * и порядковый номер), открытое место — то, у которого ещё нет грузовых мест,
 * закрытое — то, у которого они есть. Грузовые места — записи коробов
 * отгрузки с полем `place` и без товара.
 */

const SORT_PREFIX = "UK-SORT-";

/** Хеш направления — тот же, что у этикетки отправления (`targetCode`). */
function destKey(destination: string): string {
  return targetCode(destination).slice(TARGET_PREFIX.length);
}

/** Код места сортировки: направление и номер отгрузки в него. */
export function sortPointCode(destination: string, n: number): string {
  return `${SORT_PREFIX}${destKey(destination)}-${n}`;
}

/** Разобрать код места: ключ направления и номер. */
export function parseSortCode(raw: string): { key: string; n: number } | null {
  const m = /^UK-SORT-([A-Z0-9]{6})-(\d{1,5})$/.exec(normalizeCode(raw));
  return m ? { key: m[1], n: Number(m[2]) } : null;
}

/** Назначение заявок посылки: одно, если все заявки едут в одно место. */
function boxDestination(box: OutboundBox, requests: readonly FulfillmentRequest[]): string | null {
  const dests = new Set(
    requests
      .filter((r) => box.requestIds.includes(r.id))
      .map((r) => r.note?.trim())
      .filter((d): d is string => !!d),
  );
  return dests.size === 1 ? [...dests][0] : null;
}

const same = (a: string | undefined, b: string) => !!a && normalizeCode(a) === normalizeCode(b);

/** Закрыта ли отгрузка: у неё уже есть грузовые места (в том числе уехавшие). */
export function isSortClosed(list: readonly OutboundBox[], sortCode: string): boolean {
  return list.some((b) => b.place && same(b.sortCode, sortCode));
}

/**
 * Место сортировки, в которое сейчас кладут это направление: последнее
 * незакрытое, а если последнее закрыто — следующий номер.
 */
export function currentSortPoint(list: readonly OutboundBox[], destination: string): string {
  const key = destKey(destination);
  let max = 0;
  for (const b of list) {
    const p = b.sortCode ? parseSortCode(b.sortCode) : null;
    if (p && p.key === key && p.n > max) max = p.n;
  }
  if (max === 0) return sortPointCode(destination, 1);
  const last = sortPointCode(destination, max);
  return isSortClosed(list, last) ? sortPointCode(destination, max + 1) : last;
}

/** Открытые посылки (не грузовые места) на месте сортировки. */
export function pointParcels(list: readonly OutboundBox[], sortCode: string): OutboundBox[] {
  return list.filter((b) => !b.shipmentId && !b.place && same(b.sortCode, sortCode));
}

export type SortScan =
  /** Посылка принята, ждём QR места её направления. */
  | { kind: "parcel"; box: OutboundBox; destination: string; point: string }
  /** Посылка легла на место сортировки. */
  | { kind: "placed"; box: OutboundBox; point: string; destination: string }
  /** Код не посылка и не место, или такой посылки нет среди открытых. */
  | { kind: "unknown"; code: string }
  /** У посылки нет одного направления (без заявок или в разные места). */
  | { kind: "no_destination"; code: string }
  /** Посылка уже на месте сортировки — повторный скан, стоп до старшего. */
  | { kind: "dup"; code: string; point: string }
  /** Место другого направления. */
  | { kind: "wrong_point"; point: string; destination: string; pointDestination: string | null }
  /** Отгрузка этого места уже закрыта: класть в следующее. */
  | { kind: "point_closed"; point: string; next: string }
  /** Место сканируют, а посылки ещё не было. */
  | { kind: "point_first"; point: string }
  /** Вместо места — снова посылка: сначала положите прежнюю. */
  | { kind: "parcel_pending"; code: string };

/**
 * Разобрать скан. `pending` — код посылки, направление которой показано и
 * ждёт место.
 */
export function classifySortScan(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
  pending: string | null,
  raw: string,
): SortScan {
  const code = normalizeCode(raw);
  const point = parseSortCode(code);
  if (point) {
    if (!pending) return { kind: "point_first", point: code };
    const box = openParcel(list, pending);
    const destination = box && boxDestination(box, requests);
    if (!box || !destination) return { kind: "unknown", code: pending };
    if (point.key !== destKey(destination)) {
      const other = list.find((b) => same(b.sortCode, code) && !b.place);
      return {
        kind: "wrong_point",
        point: code,
        destination,
        pointDestination: other ? boxDestination(other, requests) : null,
      };
    }
    if (isSortClosed(list, code)) {
      return { kind: "point_closed", point: code, next: currentSortPoint(list, destination) };
    }
    return { kind: "placed", box, point: code, destination };
  }
  const box = openParcel(list, code);
  if (!box) return { kind: "unknown", code };
  if (box.sortCode) return { kind: "dup", code, point: box.sortCode };
  if (pending && normalizeCode(pending) !== code) return { kind: "parcel_pending", code };
  const destination = boxDestination(box, requests);
  if (!destination) return { kind: "no_destination", code };
  return { kind: "parcel", box, destination, point: currentSortPoint(list, destination) };
}

function openParcel(list: readonly OutboundBox[], code: string): OutboundBox | undefined {
  const c = normalizeCode(code);
  return list.find((b) => !b.shipmentId && !b.place && normalizeCode(b.code) === c);
}

/** Что ещё не разложено: открытые посылки с направлением и без места. */
export function unsorted(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
): { box: OutboundBox; destination: string }[] {
  return list
    .filter((b) => !b.shipmentId && !b.place && !b.sortCode)
    .map((box) => ({ box, destination: boxDestination(box, requests) }))
    .filter((x): x is { box: OutboundBox; destination: string } => !!x.destination);
}

export interface SortPointView {
  code: string;
  n: number;
  destination: string | null;
  /** Посылок на месте. */
  parcels: number;
  /** Грузовые места закрытой отгрузки; пусто — отгрузка открыта. */
  places: OutboundBox[];
}

/** Места сортировки в работе: открытые и закрытые, но ещё не уехавшие. */
export function sortPoints(
  list: readonly OutboundBox[],
  requests: readonly FulfillmentRequest[],
): SortPointView[] {
  const by = new Map<string, OutboundBox[]>();
  for (const b of list) {
    if (b.shipmentId || !b.sortCode) continue;
    const k = normalizeCode(b.sortCode);
    by.set(k, [...(by.get(k) ?? []), b]);
  }
  return [...by].map(([code, boxes]) => {
    const parcels = boxes.filter((b) => !b.place);
    return {
      code,
      n: parseSortCode(code)?.n ?? 0,
      destination: parcels.length ? boxDestination(parcels[0], requests) : null,
      parcels: parcels.length,
      places: boxes.filter((b) => b.place),
    };
  });
}

/** Коды грузовых мест отгрузки: сначала паллеты, потом коробки. */
export function placeCodes(
  sortCode: string,
  pallets: number,
  boxes: number,
): { code: string; place: "pallet" | "box" }[] {
  const base = normalizeCode(sortCode).replace(SORT_PREFIX, TARGET_PREFIX);
  const kinds = [
    ...Array.from({ length: pallets }, () => "pallet" as const),
    ...Array.from({ length: boxes }, () => "box" as const),
  ];
  return kinds.map((place, i) => ({ code: `${base}-${i + 1}`, place }));
}

/** Все открытые записи отгрузки по коду грузового места: посылки и места. */
export function shipmentOfPlace(list: readonly OutboundBox[], raw: string): OutboundBox[] {
  const place = list.find((b) => b.place && !b.shipmentId && same(b.code, raw));
  if (!place?.sortCode) return [];
  const code = place.sortCode;
  return list.filter((b) => !b.shipmentId && same(b.sortCode, code));
}
