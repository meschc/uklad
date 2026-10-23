/**
 * Ozon Seller API (FBS: склад продавца).
 *
 * Ключ — пара Client-Id + Api-Key из кабинета («Настройки → Seller API»),
 * роль ключа — с доступом к отправлениям и остаткам. Базовый адрес:
 * https://api-seller.ozon.ru (подставляет сервер вместе с заголовками ключа).
 * Пути и форма ответов — по docs.ozon.ru на 2026 год; перед включением сверить.
 *
 * Коды маркировки Ozon принимает отдельной цепочкой «экземпляров»
 * (`/v5/fbs/posting/product/exemplar/...`) со своей проверкой — она не
 * заложена, пока не будет живого кабинета для сверки формата: `marks.attach`
 * у Ozon в списке возможностей нет.
 */

import { fail, ok, type Result } from "../data/result";
import type { ConnectorTransport } from "./transport";
import type { Connector, ExternalOrder, OrderLabel } from "./types";

interface OzonPosting {
  posting_number: string;
  in_process_at: string;
  shipment_date?: string;
  products?: { sku: number; offer_id?: string; quantity: number }[];
}

/** Ответ `POST /v3/posting/fbs/unfulfilled/list` → заказы в общей форме. */
export function mapOzonPostings(payload: unknown): ExternalOrder[] {
  const postings = (payload as { result?: { postings?: OzonPosting[] } } | null)?.result?.postings;
  if (!Array.isArray(postings)) return [];
  return postings
    .filter((p) => p && typeof p.posting_number === "string")
    .map((p) => ({
      system: "ozon" as const,
      externalId: p.posting_number,
      createdAt: p.in_process_at,
      shipBy: p.shipment_date,
      lines: (p.products ?? []).map((l) => ({
        externalSku: String(l.sku),
        vendorCode: l.offer_id,
        qty: l.quantity,
        // Признак маркировки у Ozon приходит отдельным запросом по экземплярам.
        requiresMarks: false,
      })),
    }));
}

export function createOzonConnector(transport: ConnectorTransport, account: string): Connector {
  const post = (path: string, body: unknown) =>
    transport.request({ system: "ozon", account, method: "POST", path, body });

  return {
    system: "ozon",
    capabilities: ["orders.fetch", "labels.fetch", "stocks.push"],

    async fetchOrders(): Promise<Result<ExternalOrder[]>> {
      const now = Date.now();
      const res = await post("/v3/posting/fbs/unfulfilled/list", {
        dir: "ASC",
        filter: {
          cutoff_from: new Date(now - 7 * 864e5).toISOString(),
          cutoff_to: new Date(now + 14 * 864e5).toISOString(),
        },
        limit: 1000,
        offset: 0,
      });
      return res.ok ? ok(mapOzonPostings(res.data)) : res;
    },

    async fetchLabels(externalIds): Promise<Result<OrderLabel[]>> {
      // Ozon отдаёт один PDF на все отправления; сервер кладёт его в `file`.
      const res = await post("/v2/posting/fbs/package-label", {
        posting_number: externalIds,
      });
      if (!res.ok) return res;
      const file = (res.data as { file?: string } | null)?.file;
      if (typeof file !== "string") return fail("data.failed");
      return ok([{ externalId: externalIds.join(","), mime: "application/pdf", data: file }]);
    },

    async pushStocks(warehouseId, stocks) {
      // Остатки Ozon принимает по артикулу селлера (offer_id).
      const res = await post("/v2/products/stocks", {
        stocks: stocks.map((s) => ({
          offer_id: s.externalSku,
          stock: Math.max(0, s.qty),
          warehouse_id: Number(warehouseId),
        })),
      });
      return res.ok ? ok(undefined) : res;
    },
  };
}
