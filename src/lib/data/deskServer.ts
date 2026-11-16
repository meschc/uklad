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
  /** Смена процесса (`station_switch`): на какой процесс перешёл. */
  station?: string;
  /** Кто из старших подтвердил смену процесса. */
  approvedBy?: string;
}

/**
 * Привязали или отвязали стол — по пропускам на сервере (миграция 040), с
 * тем, кто это сделал: руководитель по имени или сотрудник по бейджу.
 */
export interface DeviceEvent {
  at: number;
  kind: "bound" | "revoked";
  byName?: string;
  byStaff?: string;
}

export interface DeviceJournalData {
  entries: DeviceJournalEntry[];
  /** Нет — сервер старше миграции 040 или демо: события берём из устройства. */
  events?: DeviceEvent[];
}

export interface DeskServer {
  /**
   * Сделать этот браузер столом. Перед этим правки руководителя дописываются
   * на сервер: после открытия стола писать от его имени уже некому.
   */
  open: (deviceRef: string, name: string) => Promise<Result<void>>;
  revoke: (deviceRef: string) => Promise<Result<void>>;
  /** Журнал устройства (миграция 026), новые сверху. */
  journal: (deviceRef: string) => Promise<Result<DeviceJournalData>>;
  /**
   * Отвязать стол бейджем руководителя: `false` — бейдж не руководителя,
   * `null` — этот браузер не стол с пропуском (привязан ещё под входом
   * руководителя), отвязывать надо по-старому.
   */
  unbind: (code: string) => Promise<Result<boolean | null>>;
  /**
   * Отвязать стол паролем руководителя — когда бейджа старшего нет под рукой.
   * `false` — учётная запись не управляет персоналом этой компании. Новой
   * сессии входа не открывает: после отвязки сюда входят как обычно.
   */
  unbindByPassword: (email: string, password: string) => Promise<Result<boolean>>;
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
    if (res.data.status === 409 && res.data.body.error === "desk_warehouse") {
      return fail("ws.deskNoWarehouse");
    }
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
    const body = res.data.body as { entries?: DeviceJournalEntry[]; events?: DeviceEvent[] };
    return ok({
      entries: Array.isArray(body.entries) ? body.entries : [],
      ...(Array.isArray(body.events) ? { events: body.events } : {}),
    });
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
  unbindByPassword: async (email, password) => {
    const res = await attempt(() => apiRequest("POST", "/desk/unbind", { email, password }));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200) return ok(true);
    if (status === 404 && body.error === "not_manager") return ok(false);
    if (status === 422) return fail("login.err.badCredentials");
    if (status === 429)
      return fail(body.error === "locked" ? "login.err.locked" : "login.err.tooOften");
    return fail("data.failed");
  },
  leave: async () => {
    const res = await attempt(() => apiRequest("POST", "/desk/leave", {}));
    if (!res.ok) return res;
    return res.data.status === 200 ? ok(undefined) : fail("data.failed");
  },
};
