import type { SchemeId, ServiceId } from "../data/marketplaces";
import { WAREHOUSES, type Warehouse } from "../data/warehouses";
import { estimateMonth, isVolumeSet, type SellerVolume } from "./estimate";

/** Границы ползунка цены берутся из самой витрины, а не задаются на глаз. */
export const PRICE_MIN = Math.min(...WAREHOUSES.map((w) => w.price.storage));
export const PRICE_MAX = Math.max(...WAREHOUSES.map((w) => w.price.storage));

export const SORTS = [
  { id: "rating", title: "По рейтингу" },
  { id: "price", title: "Сначала дешёвые" },
  { id: "free", title: "Больше свободных мест" },
  { id: "area", title: "Крупные склады" },
] as const;

export type SortId = (typeof SORTS)[number]["id"];

export interface MarketFilters {
  q: string;
  /** Пустая строка — все города. */
  city: string;
  schemes: SchemeId[];
  marketplaces: string[];
  services: ServiceId[];
  /** Потолок по хранению, ₽ за место хранения в сутки. */
  maxStorage: number;
  verifiedOnly: boolean;
  ukladOnly: boolean;
  sort: SortId;
}

export const DEFAULT_FILTERS: MarketFilters = {
  q: "",
  city: "",
  schemes: [],
  marketplaces: [],
  services: [],
  maxStorage: PRICE_MAX,
  verifiedOnly: false,
  ukladOnly: false,
  sort: "rating",
};

/** Сколько условий человек задал руками — для кнопки «Сбросить». */
export function activeCount(f: MarketFilters): number {
  return (
    (f.q ? 1 : 0) +
    (f.city ? 1 : 0) +
    f.schemes.length +
    f.marketplaces.length +
    f.services.length +
    (f.maxStorage < PRICE_MAX ? 1 : 0) +
    (f.verifiedOnly ? 1 : 0) +
    (f.ukladOnly ? 1 : 0)
  );
}

/**
 * Переключение значения в списке-фильтре. Возвращает новый массив: состояние
 * фильтров кладётся в React, а мутация массива на месте не вызовет перерисовку.
 */
export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const matchesQuery = (w: Warehouse, q: string): boolean => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    w.name.toLowerCase().includes(s) ||
    w.city.toLowerCase().includes(s) ||
    w.address.toLowerCase().includes(s) ||
    w.legal.toLowerCase().includes(s)
  );
};

/**
 * Все условия соединяются через «и», а значения внутри одного условия — тоже
 * через «и»: выбрав Wildberries и Ozon, селлер имеет в виду склад, который
 * умеет в обе площадки, а не «хоть куда-нибудь из двух».
 *
 * Объём селлера — не условие отбора, а мера: пока он не задан, «сначала
 * дешёвые» означает дешёвое хранение, и это единственное, что можно
 * упорядочить честно. Как только объём известен, дешёвым считается склад, на
 * котором дешевле весь месяц целиком, — а это часто другой склад: хранение
 * составляет меньшую часть счёта у любого, кто отгружает много заказов.
 * Отбирать по вместимости здесь нечего: склады, которые не возьмут объём,
 * остаются в списке и говорят об этом сами (см. `estimate.ts`).
 */
export function applyFilters(
  list: Warehouse[],
  f: MarketFilters,
  volume?: SellerVolume,
): Warehouse[] {
  const found = list.filter(
    (w) =>
      matchesQuery(w, f.q) &&
      (!f.city || w.city === f.city) &&
      f.schemes.every((s) => w.schemes.includes(s)) &&
      f.marketplaces.every((m) => w.marketplaces.includes(m)) &&
      f.services.every((s) => w.services.includes(s)) &&
      w.price.storage <= f.maxStorage &&
      (!f.verifiedOnly || w.verified) &&
      (!f.ukladOnly || w.uklad),
  );

  const sorted = [...found];
  if (f.sort === "rating") sorted.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  if (f.sort === "price") {
    // Считаем один раз на склад, а не в компараторе: тот зовётся по разу на
    // сравнение, и одна и та же сумма пересчитывалась бы десятки раз.
    const priceOf =
      volume && isVolumeSet(volume)
        ? new Map(found.map((w) => [w.id, estimateMonth(w, volume).total]))
        : new Map(found.map((w) => [w.id, w.price.storage]));
    sorted.sort((a, b) => (priceOf.get(a.id) ?? 0) - (priceOf.get(b.id) ?? 0));
  }
  if (f.sort === "free") sorted.sort((a, b) => b.cellsFree - a.cellsFree);
  if (f.sort === "area") sorted.sort((a, b) => b.areaM2 - a.areaM2);
  return sorted;
}
