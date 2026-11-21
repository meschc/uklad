import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";
import type { MsgKey } from "../i18n";

/** Площадки, ключ которых живёт на сервере (`server/api/src/cabinet/connectors.js`). */
export const SERVER_CONNECTOR_SYSTEMS = ["wildberries", "ozon", "yandex-market"] as const;
export type ServerConnectorSystem = (typeof SERVER_CONNECTOR_SYSTEMS)[number];

/** Подключение компании на сервере. Ключа здесь нет и не будет. */
export interface ServerConnection {
  id: string;
  system: ServerConnectorSystem;
  label: string;
  /** Client-Id Ozon или campaignId Маркета; у WB нет. */
  clientId: string | null;
  /** Партнёр-продавец, чей это магазин; null — свой товар склада. */
  partnerId: string | null;
  /** Склад, на который заказы приходят заявками; null — склад в компании один. */
  warehouseId: string | null;
  /** Итог последней подкачки заказов на сервере; null — ещё не было. */
  lastPull: OrderPullResult | null;
}

/**
 * Итог подкачки заказов одного подключения (`server/api/src/cabinet/orderPull.js`).
 * `error` — код сервера: отказ площадки (`rejected`, `rate_limit`, `upstream`)
 * или своё (`warehouse` — склад подключения не найден, `partner` — партнёра
 * больше нет на складе).
 */
export interface OrderPullResult {
  at: number;
  created?: number;
  unknown?: string[];
  /** Сколько заказов отмечено «собран» на площадке за проход. */
  assembled?: number;
  /** Номера, которые площадка не приняла как «собран», и её ответ. */
  assembleFailed?: string[];
  assembleDetail?: string;
  /** Сколько заявок площадка отменила за проход: сняты со сборки (`orderCancel.js`). */
  cancelled?: number;
  /** Остатки на площадку (`stockPush.js`): сколько товаров отправлено за проход. */
  stocked?: number;
  /** Артикулы, остаток которых площадка не приняла, и её ответ. */
  stockFailed?: string[];
  stockDetail?: string;
  /** Остатки не отправлены совсем: `ozon_warehouse` — не выбран склад Ozon. */
  stockError?: string;
  /** Склады FBS магазина на выбор, когда их несколько. */
  stockChoices?: { id: number; name: string }[];
  /** Склад Ozon, куда ушли остатки. */
  stockWarehouseId?: number;
  error?: string;
  detail?: string;
}

/** Итог «Проверить связь» (одно подключение) или прохода по всем подключениям. */
export interface OrderPullTotal {
  created: number;
  unknown: string[];
  failed: { id: string; error: string; detail: string }[];
}

const choices = (v: unknown[]) =>
  v.flatMap((w) => {
    const x = w as { id?: unknown; name?: unknown } | null;
    return x && typeof x.id === "number" ? [{ id: x.id, name: String(x.name ?? x.id) }] : [];
  });

function pullResult(v: unknown): OrderPullResult | null {
  const x = v as (Partial<OrderPullResult> & { stocks?: { warehouseId?: unknown } }) | null;
  if (!x || typeof x !== "object" || typeof x.at !== "number") return null;
  const stocks = x.stocks && typeof x.stocks === "object" ? x.stocks : null;
  return {
    at: x.at,
    ...(typeof x.created === "number" ? { created: x.created } : {}),
    ...(Array.isArray(x.unknown) ? { unknown: x.unknown.map(String) } : {}),
    ...(typeof x.assembled === "number" ? { assembled: x.assembled } : {}),
    ...(Array.isArray(x.assembleFailed) && x.assembleFailed.length
      ? { assembleFailed: x.assembleFailed.map(String) }
      : {}),
    ...(typeof x.assembleDetail === "string" ? { assembleDetail: x.assembleDetail } : {}),
    ...(typeof x.cancelled === "number" ? { cancelled: x.cancelled } : {}),
    ...(typeof x.stocked === "number" ? { stocked: x.stocked } : {}),
    ...(Array.isArray(x.stockFailed) && x.stockFailed.length
      ? { stockFailed: x.stockFailed.map(String) }
      : {}),
    ...(typeof x.stockDetail === "string" ? { stockDetail: x.stockDetail } : {}),
    ...(typeof x.stockError === "string" ? { stockError: x.stockError } : {}),
    ...(Array.isArray(x.stockChoices) ? { stockChoices: choices(x.stockChoices) } : {}),
    ...(typeof stocks?.warehouseId === "number" ? { stockWarehouseId: stocks.warehouseId } : {}),
    ...(typeof x.error === "string" ? { error: x.error } : {}),
    ...(typeof x.detail === "string" ? { detail: x.detail } : {}),
  };
}

function statusError(status: number, error: unknown): MsgKey {
  if (status === 403) return "integr.error.forbidden";
  if (status === 503 || error === "not_configured") return "integr.error.serverKey";
  if (status === 400) return "integr.error.badInput";
  if (status === 429) return "integr.error.rateLimit";
  return "integr.error.noServer";
}

const isSystem = (v: unknown): v is ServerConnectorSystem =>
  (SERVER_CONNECTOR_SYSTEMS as readonly unknown[]).includes(v);

/**
 * Подключения к площадкам: ключ уходит на сервер при сохранении и обратно в
 * браузер не возвращается. Обмен с площадкой — через адаптеры
 * (`lib/connectors`), они по номеру подключения ходят через тот же сервер.
 */
export const connectorsRepository = {
  list: async (): Promise<Result<ServerConnection[]>> => {
    const res = await attempt(() => apiRequest("GET", "/connectors"), "integr.error.noServer");
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200) return fail(statusError(status, body.error));
    const rows: unknown[] = Array.isArray(body.connections) ? body.connections : [];
    return ok(
      rows.flatMap((r) => {
        const x = r as Partial<ServerConnection> | null;
        if (!x || typeof x.id !== "string" || !isSystem(x.system)) return [];
        return [
          {
            id: x.id,
            system: x.system,
            label: String(x.label ?? ""),
            clientId: typeof x.clientId === "string" ? x.clientId : null,
            partnerId: typeof x.partnerId === "string" ? x.partnerId : null,
            warehouseId: typeof x.warehouseId === "string" ? x.warehouseId : null,
            lastPull: pullResult(x.lastPull),
          },
        ];
      }),
    );
  },

  save: async (input: {
    system: ServerConnectorSystem;
    label: string;
    clientId?: string;
    partnerId?: string;
    warehouseId?: string;
    token: string;
  }): Promise<Result<string>> => {
    const res = await attempt(
      () => apiRequest("POST", "/connectors/save", { ...input }),
      "integr.error.noServer",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200 || typeof body.id !== "string") return fail(statusError(status, body.error));
    return ok(body.id);
  },

  /**
   * Сервер сейчас же спрашивает площадку и заводит новые заказы заявками:
   * одно подключение (`id`, «Проверить связь») или все. Без кнопки он делает
   * то же раз в полторы минуты, кабинет для этого открывать не нужно.
   */
  pull: async (id?: string): Promise<Result<OrderPullTotal>> => {
    const res = await attempt(
      () => apiRequest("POST", "/connectors/pull", id ? { id } : {}),
      "integr.error.noServer",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200) return fail(statusError(status, body.error));
    const failed: unknown[] = Array.isArray(body.failed) ? body.failed : [];
    return ok({
      created: typeof body.created === "number" ? body.created : 0,
      unknown: Array.isArray(body.unknown) ? body.unknown.map(String) : [],
      failed: failed.flatMap((f) => {
        const x = f as { id?: unknown; error?: unknown; detail?: unknown } | null;
        return x && typeof x.id === "string"
          ? [{ id: x.id, error: String(x.error ?? ""), detail: String(x.detail ?? "") }]
          : [];
      }),
    });
  },

  rename: async (input: { id: string; label: string }): Promise<Result<void>> => {
    const res = await attempt(
      () => apiRequest("POST", "/connectors/rename", { ...input }),
      "integr.error.noServer",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    return status === 200 ? ok(undefined) : fail(statusError(status, body.error));
  },

  /** Склад магазина на Ozon, куда сервер выгружает остатки. */
  platformWarehouse: async (input: { id: string; warehouseId: number }): Promise<Result<void>> => {
    const res = await attempt(
      () => apiRequest("POST", "/connectors/platform-warehouse", { ...input }),
      "integr.error.noServer",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    return status === 200 ? ok(undefined) : fail(statusError(status, body.error));
  },

  remove: async (id: string): Promise<Result<void>> => {
    const res = await attempt(
      () => apiRequest("POST", "/connectors/delete", { id }),
      "integr.error.noServer",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    return status === 200 || status === 404 ? ok(undefined) : fail(statusError(status, body.error));
  },
};
