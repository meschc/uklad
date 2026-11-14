/**
 * Точка входа подключений. В сборке с сервером адаптеры ходят через него
 * (`createServerTransport`: ключ селлера и белый список путей — на сервере);
 * демо без сервера отвечает `offlineTransport` — ошибкой связи, а не пустым
 * списком заказов.
 */

import { createAvitoConnector } from "./avito";
import { createHonestSignConnector } from "./honestSign";
import { createMegamarketConnector } from "./megamarket";
import { createMoyskladConnector } from "./moysklad";
import { createOzonConnector } from "./ozon";
import { apiRequest, hasCabinetServer } from "../data/api";
import { createServerTransport, offlineTransport, type ConnectorTransport } from "./transport";
import type { Connector, ExternalSystem } from "./types";
import { createWildberriesConnector } from "./wildberries";
import { createYandexMarketConnector } from "./yandexMarket";

export * from "./types";
export * from "./identity";
const transport: ConnectorTransport = hasCabinetServer
  ? createServerTransport((path, body) => apiRequest("POST", path, body))
  : offlineTransport;

const FACTORIES: Partial<
  Record<ExternalSystem, (t: ConnectorTransport, account: string) => Connector>
> = {
  wildberries: createWildberriesConnector,
  ozon: createOzonConnector,
  "honest-sign": createHonestSignConnector,
  "yandex-market": createYandexMarketConnector,
  avito: createAvitoConnector,
  megamarket: createMegamarketConnector,
  moysklad: createMoyskladConnector,
};

/**
 * Подключение системы для учётной записи селлера на сервере. `undefined` —
 * адаптера для системы нет.
 */
export function getConnector(
  system: ExternalSystem,
  account: string,
  t: ConnectorTransport = transport,
): Connector | undefined {
  return FACTORIES[system]?.(t, account);
}
