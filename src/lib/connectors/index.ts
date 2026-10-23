/**
 * Точка входа подключений. Пока сервер не поднят, транспорт — `offlineTransport`:
 * каждое обращение отвечает ошибкой связи с сервером. Когда сервер поднят,
 * меняется одна строка — `transport` на `createServerTransport(адрес)`;
 * адаптеры и экраны остаются как есть. Что ещё нужно на сервере — README.md.
 */

import { createAvitoConnector } from "./avito";
import { createHonestSignConnector } from "./honestSign";
import { createMegamarketConnector } from "./megamarket";
import { createMoyskladConnector } from "./moysklad";
import { createOzonConnector } from "./ozon";
import { offlineTransport, type ConnectorTransport } from "./transport";
import type { Connector, ExternalSystem } from "./types";
import { createWildberriesConnector } from "./wildberries";
import { createYandexMarketConnector } from "./yandexMarket";

export * from "./types";
export * from "./identity";
export { createServerTransport, offlineTransport } from "./transport";
export { signInHonestSign, type MarkSigner } from "./honestSign";

export const transport: ConnectorTransport = offlineTransport;

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
