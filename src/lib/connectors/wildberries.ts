/**
 * Wildberries, API маркетплейса (FBS: склад продавца).
 *
 * Ключ — токен из кабинета селлера («Настройки → Доступ к API») с категорией
 * «Маркетплейс»; живёт до 180 дней, перевыпуск — на стороне селлера.
 * Базовый адрес: https://marketplace-api.wildberries.ru (подставляет сервер).
 * Пути и форма ответов — по документации dev.wildberries.ru на 2026 год;
 * перед включением сверить, площадка меняет версии без долгого переходного
 * периода.
 *
 * У WB один заказ — один товар, поэтому у заказа ровно одна строка.
 */

import { fail, ok, type Result } from "../data/result";
import type { ConnectorTransport } from "./transport";
import type { Connector, ExternalOrder, OrderLabel, StockLevel } from "./types";

interface WbOrder {
  id: number;
  createdAt: string;
  nmId: number;
  article?: string;
  skus?: string[];
  /** Какие данные площадка ждёт при сборке: `sgtin` — коды маркировки. */
  requiredMeta?: string[];
}

/** Ответ `GET /api/v3/orders/new` → заказы в общей форме. */
export function mapWbOrders(payload: unknown): ExternalOrder[] {
  const orders = (payload as { orders?: WbOrder[] } | null)?.orders;
  if (!Array.isArray(orders)) return [];
  return orders
    .filter((o) => o && typeof o.id === "number")
    .map((o) => ({
      system: "wildberries" as const,
      externalId: String(o.id),
      createdAt: o.createdAt,
      lines: [
        {
          externalSku: String(o.nmId),
          vendorCode: o.article,
          barcode: o.skus?.[0],
          qty: 1,
          requiresMarks: o.requiredMeta?.includes("sgtin") ?? false,
        },
      ],
    }));
}

export function createWildberriesConnector(
  transport: ConnectorTransport,
  account: string,
): Connector {
  const call = (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    query?: Record<string, string | number>,
  ) => transport.request({ system: "wildberries", account, method, path, body, query });

  return {
    system: "wildberries",
    capabilities: ["orders.fetch", "labels.fetch", "stocks.push", "marks.attach"],

    async fetchOrders(): Promise<Result<ExternalOrder[]>> {
      const res = await call("GET", "/api/v3/orders/new");
      return res.ok ? ok(mapWbOrders(res.data)) : res;
    },

    async fetchLabels(externalIds): Promise<Result<OrderLabel[]>> {
      const res = await call(
        "POST",
        "/api/v3/orders/stickers",
        { orders: externalIds.map(Number) },
        { type: "png", width: 58, height: 40 },
      );
      if (!res.ok) return res;
      const stickers = (res.data as { stickers?: { orderId: number; file: string }[] })?.stickers;
      if (!Array.isArray(stickers)) return fail("data.failed");
      return ok(
        stickers.map((s) => ({
          externalId: String(s.orderId),
          mime: "image/png" as const,
          data: s.file,
        })),
      );
    },

    async pushStocks(warehouseId, stocks: StockLevel[]) {
      // Остатки WB принимает по баркоду товара: externalSku здесь — баркод.
      const res = await call("PUT", `/api/v3/stocks/${encodeURIComponent(warehouseId)}`, {
        stocks: stocks.map((s) => ({ sku: s.externalSku, amount: Math.max(0, s.qty) })),
      });
      return res.ok ? ok(undefined) : res;
    },

    async attachMarks(externalId, marks) {
      const res = await call("PUT", `/api/v3/orders/${encodeURIComponent(externalId)}/meta/sgtin`, {
        sgtins: marks,
      });
      return res.ok ? ok(undefined) : res;
    },
  };
}
