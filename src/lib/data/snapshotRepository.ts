import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Кабинет компании на сервере одним снимком (ADR 0010).
 *
 * Снимок — тот же объект, что кабинет держит в браузере (`persistedState`),
 * без частей, которые принадлежат устройству, а не компании (см.
 * `store/serverSync.ts`). Сервер его не разбирает; разбирает кабинет при
 * загрузке — теми же миграциями и проверкой формы, что и обычный запуск.
 */
export interface Snapshot {
  version: number;
  /** Версия формата данных (`PERSIST_VERSION`). */
  format: number;
  data: Record<string, unknown>;
}

/** Итог записи: новая версия или «на сервере уже новее». */
export type SaveOutcome = { saved: number } | { conflict: number };

export const snapshotRepository = {
  /** Снимок компании. `null` — компания ещё ничего не сохраняла. */
  load: async (): Promise<Result<Snapshot | null>> => {
    const res = await attempt(() => apiRequest("GET", "/cabinet/snapshot"), "sync.err.network");
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200) return fail("sync.err.network");
    const s = body.snapshot as Snapshot | null | undefined;
    if (!s) return ok(null);
    if (typeof s.version !== "number" || typeof s.format !== "number" || !s.data) {
      return fail("sync.err.network");
    }
    return ok({ version: s.version, format: s.format, data: s.data });
  },

  /** Записать снимок поверх версии `version` (0 — первая запись). */
  save: async (
    version: number,
    format: number,
    data: Record<string, unknown>,
  ): Promise<Result<SaveOutcome>> => {
    const res = await attempt(
      () => apiRequest("POST", "/cabinet/snapshot", { version, format, data }),
      "sync.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200 && typeof body.version === "number") return ok({ saved: body.version });
    if (status === 409)
      return ok({ conflict: typeof body.version === "number" ? body.version : 0 });
    if (status === 413) return fail("sync.err.tooBig");
    return fail("sync.err.network");
  },
};
