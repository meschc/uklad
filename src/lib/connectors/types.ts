/**
 * Общий контракт подключений к внешним системам (маркетплейсы, ГИС МТ).
 *
 * Экраны и стор знают только эти типы. Как именно Wildberries называет заказ
 * или Ozon — остаток, знает адаптер своей системы (`wildberries.ts`,
 * `ozon.ts`, `honestSign.ts`): он строит запрос и переводит ответ в общую
 * форму. Сам запрос уходит через `ConnectorTransport` — в браузере ключей
 * селлера нет, их подставляет сервер Уклада (см. `transport.ts`).
 */

import type { Result } from "../data/result";

/** Система, с которой идёт обмен. Совпадает с `IntegrationSpec.id`. */
export type ExternalSystem = "wildberries" | "ozon" | "yandex-market" | "honest-sign" | "moysklad";

/** Что подключение умеет. Экран прячет действие, которого нет в списке. */
export type ConnectorCapability =
  | "orders.fetch" // забрать новые заказы на сборку (FBS)
  | "labels.fetch" // этикетки площадки для заказов
  | "stocks.push" // передать остатки склада площадке
  | "marks.attach" // передать коды маркировки в собранный заказ
  | "marks.verify"; // проверить коды маркировки в ГИС МТ

/** Строка заказа площадки в общей форме. */
export interface ExternalOrderLine {
  /** Идентификатор товара на площадке (nmID / SKU / offer). */
  externalSku: string;
  /** Артикул селлера, если площадка его возвращает. */
  vendorCode?: string;
  barcode?: string;
  qty: number;
  /** Площадка требует коды маркировки для этой строки. */
  requiresMarks: boolean;
}

/** Заказ площадки, который склад должен собрать. */
export interface ExternalOrder {
  system: ExternalSystem;
  /** Номер на стороне площадки — по нему же уходят коды и этикетки. */
  externalId: string;
  createdAt: string; // ISO
  /** Крайний срок отгрузки, если площадка его называет. */
  shipBy?: string; // ISO
  lines: ExternalOrderLine[];
}

/** Остаток, который склад сообщает площадке. */
export interface StockLevel {
  externalSku: string;
  qty: number;
}

/** Этикетка заказа: файл, который уходит на принтер как есть. */
export interface OrderLabel {
  externalId: string;
  mime: "application/pdf" | "image/png" | "image/svg+xml";
  /** Содержимое в base64. */
  data: string;
}

/** Статус кода маркировки по ответу ГИС МТ. */
export type MarkStatus =
  | "emitted" // эмитирован, ещё не в обороте
  | "applied" // нанесён
  | "introduced" // в обороте — можно продавать
  | "retired" // выбыл: продан, списан
  | "unknown";

export interface MarkCheck {
  cis: string;
  status: MarkStatus;
  gtin?: string;
  /** ИНН владельца — сверяем с ИНН селлера, чтобы не принять чужой товар. */
  ownerInn?: string;
}

/**
 * Подключение одной системы для одного селлера. Все методы необязательны:
 * чего система не умеет, того в адаптере нет, а `capabilities` говорит об
 * этом заранее. Ответ всегда в конверте `Result` — как у репозиториев.
 */
export interface Connector {
  system: ExternalSystem;
  capabilities: readonly ConnectorCapability[];
  fetchOrders?(): Promise<Result<ExternalOrder[]>>;
  fetchLabels?(externalIds: string[]): Promise<Result<OrderLabel[]>>;
  pushStocks?(warehouseId: string, stocks: StockLevel[]): Promise<Result<void>>;
  /** `marks` — код идентификации (`MarkingCode.cis`) по строкам заказа. */
  attachMarks?(externalId: string, marks: string[]): Promise<Result<void>>;
  verifyMarks?(cis: string[]): Promise<Result<MarkCheck[]>>;
}
