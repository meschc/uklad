import { apiRequest, hasCabinetServer } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/** Что сервер знает об аккаунте сверх профиля. */
export interface AccountInfo {
  email: string;
  /** Когда аккаунт сотрут; `null` — удаление не назначено. */
  deleteAt: string | null;
  /** Открытых сессий на других устройствах. */
  otherSessions: number;
}

/**
 * Аккаунт на сервере: удаление со сроком на отмену и выход на других
 * устройствах (`server/api/src/cabinet/account.js`, миграция 009).
 *
 * Без сервера всего этого нет: демо живёт в браузере, и «удалить аккаунт»
 * там — это стереть сохранение, что уже умеет «Демо-данные».
 */
export const accountRepository = {
  info: async (): Promise<Result<AccountInfo | null>> => {
    if (!hasCabinetServer) return ok(null);
    const res = await attempt(() => apiRequest("GET", "/auth/account"), "account.err.network");
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200) return fail("account.err.network");
    return ok({
      email: String(body.email ?? ""),
      deleteAt: typeof body.deleteAt === "string" ? body.deleteAt : null,
      otherSessions: typeof body.otherSessions === "number" ? body.otherSessions : 0,
    });
  },

  /** Назначить удаление. Сервер гасит все сессии, эту тоже. */
  remove: async (password: string): Promise<Result<string>> => {
    const res = await attempt(
      () => apiRequest("POST", "/auth/account/delete", { password }),
      "account.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 403) return fail("account.err.password");
    if (status === 429) return fail("account.err.tooOften");
    if (status !== 200 || typeof body.deleteAt !== "string") return fail("account.err.network");
    return ok(body.deleteAt);
  },

  restore: async (): Promise<Result<void>> => {
    const res = await attempt(
      () => apiRequest("POST", "/auth/account/restore", {}),
      "account.err.network",
    );
    if (!res.ok) return res;
    return res.data.status === 200 ? ok(undefined) : fail("account.err.network");
  },

  /** Выйти на всех устройствах, кроме этого. Сколько закрыто. */
  revokeOthers: async (): Promise<Result<number>> => {
    const res = await attempt(
      () => apiRequest("POST", "/auth/sessions/revoke-others", {}),
      "account.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200) return fail("account.err.network");
    return ok(typeof body.closed === "number" ? body.closed : 0);
  },
};
