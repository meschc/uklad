/**
 * Авито, API управления заказами и остатками (товары с Авито Доставкой).
 *
 * Доступ — пара client_id + client_secret из кабинета («Профиль → API»),
 * сервер меняет её на токен OAuth2 (client_credentials, живёт сутки) и
 * подставляет `Authorization: Bearer`. Базовый адрес: https://api.avito.ru.
 * Пути и поля — по OpenAPI Авито (order-management v1, stock-management v1),
 * сверено 23.10.2026.
 *
 * Коды маркировки Авито принимает по товару в заказе
 * (`POST /order-management/1/markings`, нужен `itemId`), поэтому, как и у
 * Маркета, `marks.attach` ждёт привязки кода к строке заказа.
 */

import { ok, type Result } from "../data/result";
import type { ConnectorTransport } from "./transport";
import type { Connector, ExternalOrder } from "./types";

interface AvitoOrder {
  id: string;
  createdAt?: string;
  items?: { avitoId: string; id?: string; count?: number }[];
  schedules?: { shipTill?: string | null };
  availableActions?: { name: string }[] | null;
}

/** Ответ `GET /order-management/1/orders` → заказы в общей форме. */
export function mapAvitoOrders(payload: unknown): ExternalOrder[] {
  const orders = (payload as { orders?: AvitoOrder[] } | null)?.orders;
  if (!Array.isArray(orders)) return [];
  return orders
    .filter((o) => o && typeof o.id === "string")
    .map((o) => {
      const marks = (o.availableActions ?? []).some((a) => a.name === "setMarkings");
      return {
        system: "avito" as const,
        externalId: o.id,
        createdAt: o.createdAt ?? "",
        shipBy: o.schedules?.shipTill ?? undefined,
        lines: (o.items ?? []).map((l) => ({
          externalSku: l.avitoId,
          vendorCode: l.id,
          qty: l.count ?? 0,
          requiresMarks: marks,
        })),
      };
    });
}

export function createAvitoConnector(transport: ConnectorTransport, account: string): Connector {
  return {
    system: "avito",
    capabilities: ["orders.fetch", "stocks.push"],

    async fetchOrders(): Promise<Result<ExternalOrder[]>> {
      const res = await transport.request({
        system: "avito",
        account,
        method: "GET",
        path: "/order-management/1/orders",
        query: { statuses: "ready_to_ship", limit: 20 },
      });
      return res.ok ? ok(mapAvitoOrders(res.data)) : res;
    },

    async pushStocks(_warehouseId, stocks) {
      // Остаток Авито ведёт по объявлению (item_id); до 200 за запрос.
      for (let i = 0; i < stocks.length; i += 200) {
        const res = await transport.request({
          system: "avito",
          account,
          method: "PUT",
          path: "/stock-management/1/stocks",
          body: {
            stocks: stocks.slice(i, i + 200).map((s) => ({
              item_id: Number(s.externalSku),
              quantity: Math.min(999999, Math.max(0, s.qty)),
            })),
          },
        });
        if (!res.ok) return res;
      }
      return ok(undefined);
    },
  };
}
