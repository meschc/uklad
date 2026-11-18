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
}

function statusError(status: number, error: unknown): MsgKey {
  if (status === 403) return "integr.error.forbidden";
  if (status === 503 || error === "not_configured") return "integr.error.serverKey";
  if (status === 400) return "integr.error.badInput";
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
