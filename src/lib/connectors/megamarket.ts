/**
 * Мегамаркет, Merchant API: остатки склада продавца.
 *
 * Ключ — токен из кабинета («Настройки → Подключение по API»). Мегамаркет
 * ждёт его не в заголовке, а в теле запроса (`data.token`) — подставляет
 * сервер. Базовый адрес: https://api.megamarket.tech. Метод
 * `offerService/stock/update` сверен с partner-wiki.megamarket.ru (23.10.2026).
 *
 * Заказы (`orderService/order/search` + `order/get`) отвечают живому адресу,
 * но полная схема ответа открыта только из кабинета партнёра: адаптер заказов
 * пишется по живому кабинету первого склада, а не по догадке.
 */

import { ok } from "../data/result";
import type { ConnectorTransport } from "./transport";
import type { Connector } from "./types";

export function createMegamarketConnector(
  transport: ConnectorTransport,
  account: string,
): Connector {
  return {
    system: "megamarket",
    capabilities: ["stocks.push"],

    async pushStocks(_warehouseId, stocks) {
      const res = await transport.request({
        system: "megamarket",
        account,
        method: "POST",
        path: "/api/merchantIntegration/v1/offerService/stock/update",
        body: {
          meta: {},
          data: {
            stocks: stocks.map((s) => ({ offerId: s.externalSku, quantity: Math.max(0, s.qty) })),
          },
        },
      });
      return res.ok ? ok(undefined) : res;
    },
  };
}
