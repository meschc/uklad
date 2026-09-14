import { applyFilters, byReputation, type MarketFilters } from "../lib/filters";
import type { SellerVolume } from "../lib/estimate";
import { groupByWarehouse, type Complaint, type Review } from "./deals";
import { COMPLAINTS, REVIEWS, WAREHOUSES, type Warehouse } from "./warehouses";

/**
 * Единственное место витрины, знающее, откуда берутся склады (п.3.2.5).
 *
 * Сегодня за ним генератор из зерна, завтра — выгрузка настоящего реестра. Всё
 * остальное — карточки, страница склада, счётчики на лендинге, карта сайта —
 * ходит сюда и про источник не знает, поэтому подмена стоит одного файла, а не
 * правки двадцати компонентов.
 *
 * ПОЧЕМУ СИНХРОННО, в отличие от `@/lib/data` с его `Promise<Result<T>>`.
 * Витрина статическая: `npm run build` пререндеривает каждую страницу склада в
 * готовый HTML, и на этом держатся и выдача, и скорость первой отрисовки.
 * Асинхронное чтение здесь означало бы пустые страницы в пререндере — то есть
 * витрину без содержимого для поисковика. Реестр приедет с сервера НА СБОРКЕ:
 * скрипт положит выгрузку рядом, а этот файл станет читать её вместо
 * генератора. Асинхронность появится там, где данные и правда меняются при
 * человеке, — в приложении склада, а не на витрине.
 */

/** Цифры по всей витрине: их показывает лендинг и подвал. */
export interface WarehouseStats {
  /** Складов на витрине. */
  total: number;
  /** Городов и хабов. */
  cities: number;
  /** Свободных мест хранения суммарно. */
  freeCells: number;
  /** Самое дешёвое хранение, ₽ за место в сутки. */
  cheapest: number;
  /** Сколько складов работают на Укладе. */
  withUklad: number;
}

export interface WarehousesRepository {
  list: () => Warehouse[];
  get: (id: string) => Warehouse | undefined;
  /** Отбор витрины. На сервере это станет запросом, а не фильтром в браузере. */
  search: (filters: MarketFilters, volume?: SellerVolume) => Warehouse[];
  stats: () => WarehouseStats;
  /** Лучшие проверенные склады Уклада — для тизера на лендинге. */
  featured: (limit: number) => Warehouse[];
  /** Отзывы о складе, свежие сверху. Пусто — с ним через Уклад ещё не работали. */
  reviews: (id: string) => Review[];
  /** Жалобы на склад, свежие сверху: и открытые, и те, на которые ответили. */
  complaints: (id: string) => Complaint[];
}

/**
 * Цифры считаются один раз на модуль, а не на каждый рендер: набор за время
 * жизни страницы не меняется, а счётчиков на лендинге пять штук в разных
 * секциях, и каждая пересчитывала бы весь список заново.
 */
function buildStats(list: Warehouse[]): WarehouseStats {
  return {
    total: list.length,
    cities: new Set(list.map((w) => w.city)).size,
    freeCells: list.reduce((sum, w) => sum + w.cellsFree, 0),
    cheapest: Math.min(...list.map((w) => w.price.storage)),
    withUklad: list.filter((w) => w.uklad).length,
  };
}

/** Свежие записи сверху — и у отзывов, и у жалоб читают прежде всего последние. */
const newestFirst = <T extends { createdAt: number }>(items: T[]): T[] =>
  [...items].sort((a, b) => b.createdAt - a.createdAt);

export function createWarehousesRepository(
  list: Warehouse[] = WAREHOUSES,
  reviews: readonly Review[] = REVIEWS,
  complaints: readonly Complaint[] = COMPLAINTS,
): WarehousesRepository {
  const stats = buildStats(list);
  const byId = new Map(list.map((w) => [w.id, w]));
  const reviewsBy = groupByWarehouse(reviews);
  const complaintsBy = groupByWarehouse(complaints);

  return {
    list: () => list,
    get: (id) => byId.get(id),
    search: (filters, volume) => applyFilters(list, filters, volume),
    stats: () => stats,
    // Понижение за жалобы работает именно здесь, а не только в сортировке
    // списка: тизер на лендинге — самый верх выдачи, какой на витрине есть, и
    // склад с двумя неотвеченными жалобами за квартал в нём быть не должен.
    featured: (limit) =>
      list
        .filter((w) => w.uklad && w.verified && !w.reputation.demoted)
        .sort(byReputation)
        .slice(0, limit),
    reviews: (id) => newestFirst(reviewsBy.get(id) ?? []),
    complaints: (id) => newestFirst(complaintsBy.get(id) ?? []),
  };
}

export const warehousesRepository = createWarehousesRepository();
