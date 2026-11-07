import { apiRequest } from "./api";
import type { Changes } from "./cabinetRows";
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
/**
 * `stock` — сервер не принял движение товара со стола (сверка остатков,
 * `cabinet/deskStock.js`): остальное записано, копию нужно забрать заново.
 */
/**
 * `rejected` — сервер отказал не из-за версии: `stock` — движение товара со
 * стола не сошлось, `products` — запись убрала бы больше половины каталога.
 */
/**
 * `diverged` — правка «только изменённое» не сошлась с тем, что на сервере
 * (копия считала её не от той версии): ничего не записано, кабинет пишется
 * целиком.
 */
export type SaveOutcome =
  | { saved: number }
  | { conflict: number; rejected?: "stock" | "products" | "records" }
  | { diverged: true };

type Reply = { status: number; body: Record<string, unknown> };

function outcome({ status, body }: Reply): Result<SaveOutcome> {
  if (status === 200 && typeof body.version === "number") return ok({ saved: body.version });
  if (status === 409 && body.error === "diverged") return ok({ diverged: true });
  if (status === 409)
    return ok({
      conflict: typeof body.version === "number" ? body.version : 0,
      ...(body.error === "stock_mismatch" ? { rejected: "stock" as const } : {}),
      ...(body.error === "products_mass_delete" ? { rejected: "products" as const } : {}),
      ...(body.error === "records_mass_delete" ? { rejected: "records" as const } : {}),
    });
  if (status === 413) return fail("sync.err.tooBig");
  if (status === 400) return fail("sync.err.badData");
  if (status === 403) return fail("sync.err.forbidden");
  return fail("sync.err.network");
}

export const snapshotRepository = {
  /** Снимок компании. `null` — компания ещё ничего не сохраняла. */
  load: async (): Promise<Result<Snapshot | null>> => {
    const res = await attempt(() => apiRequest("GET", "/cabinet/snapshot"), "sync.err.network");
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return fail("sync.err.forbidden");
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
    return outcome(res.data as Reply);
  },

  /** Записать только изменённое поверх версии `version` (`cabinetRows.ts`). */
  saveChanges: async (
    version: number,
    format: number,
    changes: Changes,
  ): Promise<Result<SaveOutcome>> => {
    const res = await attempt(
      () => apiRequest("POST", "/cabinet/snapshot/changes", { version, format, ...changes }),
      "sync.err.network",
    );
    if (!res.ok) return res;
    return outcome(res.data as Reply);
  },
};
