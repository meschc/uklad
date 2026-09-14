import type { SchemeId, ServiceId } from "../data/marketplaces";
import { WAREHOUSES, type Warehouse } from "../data/warehouses";
import { c } from "./copy";
import { estimateMonth, isVolumeSet, type SellerVolume } from "./estimate";

/**
 * Границы ползунка цены берутся из самой витрины, а не задаются на глаз.
 *
 * Единственное место, которое читает `WAREHOUSES` напрямую, минуя
 * `warehousesRepository`: репозиторий сам зовёт отсюда `applyFilters`, и
 * обратная ссылка замкнула бы модули в кольцо. Обмен неравноценный, но
 * односторонний — границы ползунка нужны отбору, а отбору репозиторий не нужен.
 */
export const PRICE_MIN = Math.min(...WAREHOUSES.map((w) => w.price.storage));
export const PRICE_MAX = Math.max(...WAREHOUSES.map((w) => w.price.storage));

export const SORTS = [
  { id: "rating", title: c("По рейтингу", "By rating") },
  { id: "price", title: c("Сначала дешёвые", "Cheapest first") },
  { id: "free", title: c("Больше свободных мест", "Most free slots") },
  { id: "area", title: c("Крупные склады", "Largest warehouses") },
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

/**
 * Поиск идёт сразу по обоим языкам, а не по языку страницы. Селлер приходит
 * по ссылке от перевозчика или из переписки и набирает то, что у него перед
 * глазами: «Химки» или «Khimki». Отвечать «ничего не найдено» на правильное
 * название только потому, что оно набрано не тем алфавитом, — обидно и глупо.
 */
const matchesQuery = (w: Warehouse, q: string): boolean => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [w.name, w.cityTitle, w.address, w.legal].some(
    (copy) => copy.ru.toLowerCase().includes(s) || copy.en.toLowerCase().includes(s),
  );
};

/**
 * Порядок по репутации — и в списке, и в тизере на лендинге.
 *
 * Три правила подряд, и каждое отвечает на свой вопрос. Склад с
 * подтверждёнными жалобами уходит вниз независимо от оценки: это и есть
 * механическое автопонижение, обещанное на странице жалоб, — не арбитраж, а
 * место в выдаче. Склад без отзывов идёт после складов с отзывами: у него не
 * плохая оценка, у него её нет, и вперёд она его вывести не может. Дальше —
 * оценка, а при равной оценке выше тот, за чьей стоит больше отзывов: 5,0 по
 * одному отзыву и 5,0 по восемнадцати — разной силы утверждения.
 */
export function byReputation(a: Warehouse, b: Warehouse): number {
  const x = a.reputation;
  const y = b.reputation;
  return (
    Number(x.demoted) - Number(y.demoted) ||
    Number(x.rating === null) - Number(y.rating === null) ||
    (y.rating ?? 0) - (x.rating ?? 0) ||
    y.reviews - x.reviews
  );
}

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
  if (f.sort === "rating") sorted.sort(byReputation);
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
