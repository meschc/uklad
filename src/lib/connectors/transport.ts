/**
 * Транспорт подключений: единственное место, через которое адаптер ходит
 * наружу. Узкий порт по той же причине, что `StorePort` у репозиториев: в
 * тестах его подменяет голый объект, а в работе — сервер.
 *
 * Почему через сервер, а не `fetch` прямо в API площадки:
 * - ключ селлера не должен жить в браузере склада — сервер хранит его
 *   зашифрованным и подставляет сам (`account` в запросе — это номер
 *   подключения, а не ключ);
 * - у площадок лимиты на число запросов, их соблюдает одна очередь сервера;
 * - API площадок не отвечают браузеру с чужого домена (CORS).
 *
 * Контракт с сервером: `POST /api/connectors/<system>/proxy` с телом
 * `ConnectorRequest`, ответ — JSON площадки как есть. Коды ошибок сервер
 * переводит в HTTP-статус площадки, `statusToError` — в ключ словаря.
 */

import { fail, ok, type Result } from "../data/result";
import type { MsgKey } from "../i18n";
import type { ExternalSystem } from "./types";

export interface ConnectorRequest {
  system: ExternalSystem;
  /** Номер подключения селлера на сервере — по нему сервер достаёт ключ. */
  account: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Путь API площадки относительно её базового адреса. */
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
}

export interface ConnectorTransport {
  request(req: ConnectorRequest): Promise<Result<unknown>>;
}

/** Отказ сервера или площадки → ключ ошибки для экрана. */
function toError(status: number, error: unknown): MsgKey {
  if (error === "rejected") return "integr.error.rejected";
  if (error === "rate_limit" || status === 429) return "integr.error.rateLimit";
  if (error === "not_configured" || error === "no_connection") return "integr.error.notConfigured";
  if (status === 403) return "integr.error.forbidden";
  if (error === "upstream" || error === "too_large") return "integr.error.upstream";
  return "data.failed";
}

/**
 * Транспорт до запуска сервера: честно отвечает «подключение заработает после
 * сервера», а не притворяется, что заказов нет.
 */
export const offlineTransport: ConnectorTransport = {
  async request() {
    return fail("integr.error.noServer");
  },
};

let lastFailure: string | null = null;

/**
 * Что ответила площадка на последний отказ: код и её текст («400: invalid
 * filter»). Ключ словаря говорит человеку, что делать, а это — для «Проверить
 * связь», чтобы без доступа к журналам сервера было видно, где именно отказ.
 */
export function lastConnectorFailure(): string | null {
  return lastFailure;
}

/** Запрос к своему серверу: путь от `/api`, тело — JSON. */
export type ApiCall = (
  path: string,
  body: Record<string, unknown>,
) => Promise<{ status: number; body: Record<string, unknown> }>;

/**
 * Транспорт через сервер Уклада (`server/api/src/cabinet/connectors.js`).
 * Сервер держит белый список путей, шифрованный ключ селлера и лимиты; ответ
 * — `{ ok, data }`, где `data` — JSON площадки как есть. Отказ площадки
 * приходит 502 с причиной, а не её 401: тот означал бы конец сессии Уклада.
 */
export function createServerTransport(call: ApiCall): ConnectorTransport {
  return {
    async request(req) {
      try {
        const { status, body } = await call(`/connectors/${req.system}/proxy`, { ...req });
        if (status !== 200 || body.ok !== true) {
          lastFailure =
            typeof body.status === "number"
              ? `${body.status}${typeof body.detail === "string" && body.detail ? `: ${body.detail}` : ""}`
              : null;
          return fail(toError(status, body.error));
        }
        lastFailure = null;
        return ok(body.data ?? null);
      } catch (e) {
        console.error("[uklad] подключение не ответило:", e);
        return fail("integr.error.noServer");
      }
    },
  };
}
