/**
 * Заказы площадки → заявки склада. Чистое правило, о хранилище не знает.
 *
 * Строку заказа узнаём по артикулу продавца (`offer_id` Ozon, `vendorCode`
 * WB, `offerId` Маркета) или по штрихкоду. Совпадение должно быть одно: два
 * товара с одним артикулом у разных продавцов — не угадываем, а показываем
 * «товар не найден». Заказ с хотя бы одной неузнанной строкой не заводим
 * частично: половину посылки собрать нельзя.
 *
 * Номер заказа, который уже есть среди заявок этой площадки в любом статусе,
 * второй раз не заводится. Отменённый складом заказ тоже: иначе подкачка
 * воскрешала бы его каждые полторы минуты.
 */

import type { ExternalOrder } from "./connectors/types";
import type { FulfillmentRequest, OrderSource, Product } from "./types";

interface OrderImportItem {
  productId: string;
  qty: number;
  source: OrderSource;
  externalId: string;
}

export interface OrderImportPlan {
  items: OrderImportItem[];
  /** Сколько заказов станут заявками. */
  orders: number;
  /** Номера заказов, в которых есть товар, которого нет в номенклатуре. */
  unknown: string[];
}

const norm = (v: string | undefined) => v?.trim().toLowerCase() || "";

const IMPORTABLE: readonly string[] = ["ozon", "wildberries", "yandex-market"];

/** Индекс «код → товары»: по артикулу и по штрихкоду. */
function codeIndex(products: Product[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const add = (code: string, id: string) => {
    if (!code) return;
    const set = map.get(code) ?? new Set<string>();
    set.add(id);
    map.set(code, set);
  };
  for (const p of products) {
    add(norm(p.sku), p.id);
    add(norm(p.barcode), p.id);
  }
  return map;
}

/** Один товар по артикулу или штрихкоду строки; ноль или два — null. */
function matchLine(
  index: Map<string, Set<string>>,
  line: ExternalOrder["lines"][number],
): string | null {
  for (const code of [norm(line.vendorCode), norm(line.barcode)]) {
    const hit = code ? index.get(code) : undefined;
    if (hit?.size === 1) return [...hit][0];
    if (hit && hit.size > 1) return null;
  }
  return null;
}

export function planOrderImport(
  orders: ExternalOrder[],
  products: Product[],
  requests: FulfillmentRequest[],
): OrderImportPlan {
  const index = codeIndex(products);
  const known = new Set(
    requests
      .filter((r) => r.source && r.externalId)
      .map((r) => `${r.source}:${norm(r.externalId)}`),
  );
  const plan: OrderImportPlan = { items: [], orders: 0, unknown: [] };
  for (const order of orders) {
    if (!IMPORTABLE.includes(order.system)) continue;
    const source = order.system as OrderSource;
    const key = `${source}:${norm(order.externalId)}`;
    if (!order.externalId || known.has(key)) continue;
    known.add(key);
    const lines = order.lines.filter((l) => l.qty > 0);
    const matched = lines.map((l) => matchLine(index, l));
    if (!lines.length || matched.some((m) => m === null)) {
      plan.unknown.push(order.externalId);
      continue;
    }
    plan.orders += 1;
    lines.forEach((l, i) =>
      plan.items.push({
        productId: matched[i] as string,
        qty: l.qty,
        source,
        externalId: order.externalId,
      }),
    );
  }
  return plan;
}
