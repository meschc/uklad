/**
 * Яндекс Маркет, Partner API (FBS и DBS: склад продавца).
 *
 * Ключ — Api-Key токен из кабинета («Настройки → API и модули»), заголовок
 * `Api-Key`; плюс номер кампании (магазина). Базовый адрес:
 * https://api.partner.market.yandex.ru. Пути и поля сверены с открытой
 * спецификацией github.com/yandex-market/yandex-market-partner-api (23.10.2026).
 *
 * `{campaignId}` в пути подставляет сервер из настроек подключения — номер
 * кампании живёт рядом с ключом, а не в браузере.
 *
 * Коды маркировки Маркет принимает по позиции заказа
 * (`PUT .../orders/{orderId}/identifiers`, нужен `id` позиции), а общий
 * контракт `attachMarks` передаёт коды на весь заказ — `marks.attach` у
 * Маркета появится вместе с привязкой кода к строке.
 */

import { ok, type Result } from "../data/result";
import type { ConnectorTransport } from "./transport";
import type { Connector, ExternalOrder, OrderLabel } from "./types";

interface YmItem {
  offerId?: string;
  count?: number;
  requiredInstanceTypes?: string[];
}
interface YmOrder {
  id: number;
  creationDate?: string;
  items?: YmItem[];
  delivery?: { shipments?: { shipmentDate?: string }[] };
}

/** Дата Маркета `ДД-ММ-ГГГГ[ ЧЧ:ММ:СС]` → ISO. Непонятное — как есть. */
export function ymDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /^(\d{2})-(\d{2})-(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return value;
  const [, d, mo, y, h = "00", mi = "00", s = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`;
}

/** Ответ `GET /v2/campaigns/{campaignId}/orders` → заказы в общей форме. */
export function mapYmOrders(payload: unknown): ExternalOrder[] {
  const orders = (payload as { orders?: YmOrder[] } | null)?.orders;
  if (!Array.isArray(orders)) return [];
  return orders
    .filter((o) => o && typeof o.id === "number")
    .map((o) => ({
      system: "yandex-market" as const,
      externalId: String(o.id),
      createdAt: ymDateToIso(o.creationDate) ?? "",
      shipBy: ymDateToIso(o.delivery?.shipments?.[0]?.shipmentDate),
      lines: (o.items ?? []).map((l) => ({
        externalSku: String(l.offerId ?? ""),
        vendorCode: l.offerId,
        qty: l.count ?? 0,
        requiresMarks: (l.requiredInstanceTypes ?? []).includes("CIS"),
      })),
    }));
}

export function createYandexMarketConnector(
  transport: ConnectorTransport,
  account: string,
): Connector {
  const base = "/v2/campaigns/{campaignId}";
  return {
    system: "yandex-market",
    capabilities: ["orders.fetch", "labels.fetch", "stocks.push"],

    async fetchOrders(): Promise<Result<ExternalOrder[]>> {
      // Ждут сборки: в обработке и ещё не готовы к отгрузке.
      const res = await transport.request({
        system: "yandex-market",
        account,
        method: "GET",
        path: `${base}/orders`,
        query: { status: "PROCESSING", substatus: "STARTED", limit: 50 },
      });
      return res.ok ? ok(mapYmOrders(res.data)) : res;
    },

    async fetchLabels(externalIds): Promise<Result<OrderLabel[]>> {
      // Маркет отдаёт PDF на все коробки одного заказа — по запросу на заказ.
      const labels: OrderLabel[] = [];
      for (const id of externalIds) {
        const res = await transport.request({
          system: "yandex-market",
          account,
          method: "GET",
          path: `${base}/orders/${encodeURIComponent(id)}/delivery/labels`,
          query: { format: "A7" },
        });
        if (!res.ok) return res;
        const file = (res.data as { file?: string } | null)?.file;
        if (typeof file === "string")
          labels.push({ externalId: id, mime: "application/pdf", data: file });
      }
      return ok(labels);
    },

    async pushStocks(_warehouseId, stocks) {
      // Склад Маркет берёт из кампании; остаток — по SKU продавца (offerId).
      const updatedAt = new Date().toISOString();
      const res = await transport.request({
        system: "yandex-market",
        account,
        method: "PUT",
        path: `${base}/offers/stocks`,
        body: {
          skus: stocks.map((s) => ({
            sku: s.externalSku,
            items: [{ count: Math.max(0, s.qty), updatedAt }],
          })),
        },
      });
      return res.ok ? ok(undefined) : res;
    },
  };
}
