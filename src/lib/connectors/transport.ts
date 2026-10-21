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

/** HTTP-статус ответа площадки → ключ ошибки для экрана. */
export function statusToError(status: number): MsgKey {
  if (status === 401 || status === 403) return "integr.error.rejected";
  if (status === 429) return "integr.error.rateLimit";
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

/**
 * Требования к серверному прокси (проверка безопасности PR #23), без них
 * включать нельзя:
 * 1. Белый список method + шаблон пути на каждую систему; прочее — 403.
 * 2. `account` проверяется по сессии: подключение принадлежит компании
 *    пользователя, роль имеет право на вызов.
 * 3. Origin строго u-klad.ru, CORS без `*`; `baseUrl` — только свой домен,
 *    из адресной строки не настраивается.
 * 4. Ключи селлеров зашифрованы (ключ шифрования в env, не в базе), в журналы
 *    и ответы не попадают; ответ площадки — без её заголовков.
 * 5. Лимит частоты на пользователя и на подключение.
 * 6. Токен ГИС МТ и коды с криптохвостом — только на сервере, коротко, без
 *    записи в журналы.
 *
 * Транспорт через сервер Уклада. `fetchImpl` подменяется в тестах. Включается
 * одной строкой в `connectors/index.ts`, когда сервер поднят.
 */
export function createServerTransport(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): ConnectorTransport {
  return {
    async request(req) {
      try {
        const res = await fetchImpl(`${baseUrl}/api/connectors/${req.system}/proxy`, {
          method: "POST",
          credentials: "include", // сессия пользователя Уклада, не ключ селлера
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        });
        if (!res.ok) return fail(statusToError(res.status));
        const text = await res.text();
        return ok(text ? (JSON.parse(text) as unknown) : null);
      } catch (e) {
        console.error("[uklad] подключение не ответило:", e);
        return fail("data.failed");
      }
    },
  };
}
