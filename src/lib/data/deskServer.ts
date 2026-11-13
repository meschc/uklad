import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Вход стола на сервере (`server/api/src/cabinet/desks.js`). Руководитель,
 * сидя за компьютером, делает его столом: его вход здесь гаснет, браузер
 * получает пропуск стола с узким правом. Стол гасят бейджем руководителя на
 * самом столе или с экрана «Устройства» другого компьютера.
 */
/** Строка журнала устройства: операция стола и кто был за ним. */
export interface DeviceJournalEntry {
  at: number;
  /** Сотрудник (`warehouse.staff[].id`); нет — за столом никого не было. */
  staffRef: string | null;
  /** Вид операции стола (`DeskOpKind` на сервере) или отметки в демо. */
  kind: string;
  /** Сервер не смог применить факт как есть — разбирает старший. */
  flagged?: boolean;
  /** С чем была операция: товар, тара, заказ, отправление (миграция 028). */
  refs?: JournalRefs;
}

export interface JournalRefs {
  productId?: string;
  toteId?: string;
  boxId?: string;
  palletId?: string;
  orderId?: string;
  outboundCode?: string;
  code?: string;
  qty?: number;
}

export interface DeskServer {
  /**
   * Сделать этот браузер столом. Перед этим правки руководителя дописываются
   * на сервер: после открытия стола писать от его имени уже некому.
   */
  open: (deviceRef: string, name: string) => Promise<Result<void>>;
  revoke: (deviceRef: string) => Promise<Result<void>>;
  /** Журнал устройства (миграция 026), новые сверху. */
  journal: (deviceRef: string) => Promise<Result<DeviceJournalEntry[]>>;
  /**
   * Отвязать стол бейджем руководителя: `false` — бейдж не руководителя,
   * `null` — этот браузер не стол с пропуском (привязан ещё под входом
   * руководителя), отвязывать надо по-старому.
   */
  unbind: (code: string) => Promise<Result<boolean | null>>;
  /**
   * Сотрудник вышел со стола: сервер перестаёт принимать отметки за него.
   * Не стол (рабочее место под входом руководителя) — у сервера такого
   * маршрута нет, ответ 404, и выход идёт как обычно.
   */
  leave: () => Promise<Result<void>>;
}

export const serverDesks: DeskServer = {
  open: async (deviceRef, name) => {
    // Динамический импорт: синхронизация живёт в сторе, а стор зависит от
    // слоя данных — прямой импорт замкнул бы круг.
    const { flushServerSync } = await import("../store/serverSync");
    if (!(await flushServerSync())) return fail("data.failed");
    const res = await attempt(() => apiRequest("POST", "/cabinet/desks", { deviceRef, name }));
    if (!res.ok) return res;
    return res.data.status === 200 ? ok(undefined) : fail("data.failed");
  },
  revoke: async (deviceRef) => {
    const res = await attempt(() => apiRequest("POST", "/cabinet/desks/revoke", { deviceRef }));
    if (!res.ok) return res;
    return res.data.status === 200 ? ok(undefined) : fail("data.failed");
  },
  journal: async (deviceRef) => {
    const res = await attempt(() =>
      apiRequest("GET", `/cabinet/desks/journal?device=${encodeURIComponent(deviceRef)}`),
    );
    if (!res.ok) return res;
    if (res.data.status !== 200) return fail("data.failed");
    const entries = (res.data.body as { entries?: DeviceJournalEntry[] }).entries;
    return ok(Array.isArray(entries) ? entries : []);
  },
  unbind: async (code) => {
    const res = await attempt(() => apiRequest("POST", "/desk/unbind", { code }));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200) return ok(true);
    if (status === 404 && body.error === "not_manager") return ok(false);
    if (status === 429 || status >= 500) return fail("data.failed");
    return ok(null);
  },
  leave: async () => {
    const res = await attempt(() => apiRequest("POST", "/desk/leave", {}));
    if (!res.ok) return res;
    return res.data.status === 200 ? ok(undefined) : fail("data.failed");
  },
};
