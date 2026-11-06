import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Вход стола на сервере (`server/api/src/cabinet/desks.js`). Руководитель,
 * сидя за компьютером, делает его столом: его вход здесь гаснет, браузер
 * получает пропуск стола с узким правом. Стол гасят бейджем руководителя на
 * самом столе или с экрана «Устройства» другого компьютера.
 */
export interface DeskServer {
  /**
   * Сделать этот браузер столом. Перед этим правки руководителя дописываются
   * на сервер: после открытия стола писать от его имени уже некому.
   */
  open: (deviceRef: string, name: string) => Promise<Result<void>>;
  revoke: (deviceRef: string) => Promise<Result<void>>;
  /**
   * Отвязать стол бейджем руководителя: `false` — бейдж не руководителя,
   * `null` — этот браузер не стол с пропуском (привязан ещё под входом
   * руководителя), отвязывать надо по-старому.
   */
  unbind: (code: string) => Promise<Result<boolean | null>>;
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
  unbind: async (code) => {
    const res = await attempt(() => apiRequest("POST", "/desk/unbind", { code }));
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200) return ok(true);
    if (status === 404 && body.error === "not_manager") return ok(false);
    if (status === 429 || status >= 500) return fail("data.failed");
    return ok(null);
  },
};
