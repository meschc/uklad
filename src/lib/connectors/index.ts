/**
 * Точка входа подключений. Сегодня транспорт — `offlineTransport`: каждое
 * обращение честно отвечает «заработает после сервера». Когда сервер поднят,
 * меняется одна строка — `transport` на `createServerTransport(адрес)`;
 * адаптеры и экраны остаются как есть. Что ещё нужно на сервере — README.md.
 */

import { createHonestSignConnector } from "./honestSign";
import { createOzonConnector } from "./ozon";
import { offlineTransport, type ConnectorTransport } from "./transport";
import type { Connector, ExternalSystem } from "./types";
import { createWildberriesConnector } from "./wildberries";

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
};

/**
 * Подключение системы для учётной записи селлера на сервере. `undefined` —
 * адаптера для системы ещё нет (Маркет, МойСклад — следующие).
 */
export function getConnector(
  system: ExternalSystem,
  account: string,
  t: ConnectorTransport = transport,
): Connector | undefined {
  return FACTORIES[system]?.(t, account);
}
