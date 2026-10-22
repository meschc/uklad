/**
 * Единый номер Уклада (cab-uklad-id): к одному товару Уклада привязаны его
 * номера во внешних системах — артикул селлера, nmID и баркоды WB, SKU и
 * offer_id Ozon, GTIN. Адаптеры возвращают заказы в номерах площадки, а
 * сборка работает с товарами Уклада; перевод — здесь, в одном месте.
 *
 * Связка хранится плоским списком: так проще слить с сервером и найти товар
 * по любому номеру. Один внешний номер — максимум один товар Уклада.
 */

import type { ExternalSystem } from "./types";

export type ExternalRefKind =
  | "sku" // номер товара на площадке: nmID, SKU, offerId
  | "vendorCode" // артикул селлера
  | "barcode" // баркод площадки или EAN
  | "gtin"; // GTIN из кода маркировки

export interface ExternalRef {
  /** `null` — номер общий для всех систем (EAN, GTIN, артикул селлера). */
  system: ExternalSystem | null;
  kind: ExternalRefKind;
  value: string;
  productId: string;
}

function keyOf(r: Pick<ExternalRef, "system" | "kind" | "value">): string {
  return `${r.system ?? "*"}|${r.kind}|${r.value.trim()}`;
}

/** Индекс для быстрого поиска: строится один раз на список. */
export function indexRefs(refs: readonly ExternalRef[]): Map<string, string> {
  return new Map(refs.map((r) => [keyOf(r), r.productId]));
}

/**
 * Товар Уклада по номеру внешней системы. Сначала номер этой системы, потом
 * общий — так nmID одной площадки не спутается с SKU другой.
 */
export function resolveProduct(
  index: Map<string, string>,
  system: ExternalSystem,
  kind: ExternalRefKind,
  value: string,
): string | undefined {
  return (
    index.get(keyOf({ system, kind, value })) ?? index.get(keyOf({ system: null, kind, value }))
  );
}

/**
 * Добавить связку. Если номер уже занят другим товаром — вернуть конфликт, а
 * не перезаписать молча: иначе одна коробка уедет по чужому заказу.
 */
export function linkRef(
  refs: readonly ExternalRef[],
  next: ExternalRef,
): { refs: ExternalRef[]; conflictWith?: string } {
  const key = keyOf(next);
  const existing = refs.find((r) => keyOf(r) === key);
  if (existing && existing.productId !== next.productId) {
    return { refs: [...refs], conflictWith: existing.productId };
  }
  if (existing) return { refs: [...refs] };
  return { refs: [...refs, { ...next, value: next.value.trim() }] };
}
