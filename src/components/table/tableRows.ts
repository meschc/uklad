import { formatAddress } from "@/lib/address";
import { matchesQuery, normalizeQuery } from "@/lib/productSearch";
import type { CellAddress, Product, Warehouse } from "@/lib/types";

/**
 * Что показывает таблица номенклатуры: строки «товар ↔ место ↔ остаток» и
 * правила, по которым из них остаётся видимая часть.
 *
 * Вынесено из экрана целиком, потому что это чистые вычисления над данными: их
 * можно проверить тестом, ничего не рисуя. В экране остаётся то, ради чего он
 * существует, — состояние, диалоги и разметка.
 */

/** Колонка, по которой сортируем. */
export type SortKey = "sku" | "name" | "category" | "partner" | "weight" | "qty" | "place";

/** Показывать все товары, только размещённые или только «без места». */
export type PlaceFilter = "all" | "placed" | "free";

export type Sort = { key: SortKey; dir: 1 | -1 };

/** Состояние панели фильтров: ровно то, что человек выбрал глазами. */
export type TableFilter = {
  query: string;
  /** Категория или `"all"`. */
  category: string;
  /** Партнёр: `"all"` — любой, `""` — товары без партнёра. */
  partnerId: string;
  place: PlaceFilter;
};

/** Строка таблицы. */
export type TableRow = {
  product: Product;
  /** Адрес вида «1-2-3-4» или null, если товар нигде не лежит. */
  place: string | null;
  qty: number;
};

/**
 * Собрать строки. Остаток берём готовым (`stockByProduct`) — тем же способом,
 * что тепловая карта и дашборд, иначе три экрана показывали бы три числа.
 */
export function buildRows(
  products: readonly Product[],
  placements: Record<string, CellAddress>,
  warehouse: Warehouse,
  stock: Map<string, { qty: number }>,
): TableRow[] {
  return products.map((product) => {
    const addr = placements[product.id];
    return {
      product,
      place: addr ? formatAddress(warehouse, addr) : null,
      qty: stock.get(product.id)?.qty ?? 0,
    };
  });
}

/**
 * Отфильтровать и отсортировать. Имя партнёра приходит функцией: в строке
 * лежит только его id, а сортировать надо по тому, что человек видит.
 */
export function filterAndSort(
  rows: readonly TableRow[],
  filter: TableFilter,
  sort: Sort,
  partnerName: (id?: string) => string,
): TableRow[] {
  const q = normalizeQuery(filter.query);
  const filtered = rows.filter(({ product: p, place }) => {
    if (filter.category !== "all" && p.category !== filter.category) return false;
    if (filter.partnerId !== "all" && (p.partnerId ?? "") !== filter.partnerId) return false;
    if (filter.place === "placed" && !place) return false;
    if (filter.place === "free" && place) return false;
    return matchesQuery(p, q, place);
  });

  const cmpStr = (a: string, b: string) => a.localeCompare(b, "ru");
  return [...filtered].sort((a, b) => {
    const d = sort.dir;
    switch (sort.key) {
      case "sku":
        return d * cmpStr(a.product.sku, b.product.sku);
      case "name":
        return d * cmpStr(a.product.name, b.product.name);
      case "category":
        return d * cmpStr(a.product.category, b.product.category);
      case "partner":
        return d * cmpStr(partnerName(a.product.partnerId), partnerName(b.product.partnerId));
      case "weight":
        return d * ((a.product.weightKg ?? 0) - (b.product.weightKg ?? 0));
      case "qty":
        return d * (a.qty - b.qty);
      case "place":
        // Неразмещённые — всегда в конце, независимо от направления: «где
        // лежит» сортируют, чтобы обойти склад, а не чтобы упереться в прочерки.
        if (!a.place && !b.place) return 0;
        if (!a.place) return 1;
        if (!b.place) return -1;
        return d * cmpStr(a.place, b.place);
    }
  });
}
