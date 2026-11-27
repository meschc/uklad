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

  /**
   * Сменить пароль: старый обязателен. Сервер гасит все сессии и ставит этой
   * новую куку — человек остаётся в кабинете, другие устройства выходят.
   */
  changePassword: async (password: string, next: string): Promise<Result<void>> => {
    const res = await attempt(
      () => apiRequest("POST", "/auth/password", { password, next }),
      "account.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200) return ok(undefined);
    if (status === 403) return fail("account.err.password");
    if (status === 429) return fail("account.err.tooOften");
    if (body.error === "weak_password") return fail("login.err.weakPassword");
    if (body.error === "same_password") return fail("account.err.samePassword");
    return fail("account.err.network");
  },

  /**
   * Смена почты, шаг 1: пароль и новый адрес → код на новый адрес
   * (миграция 066). До ввода кода вход — по старой почте.
   */
  requestEmailChange: async (email: string, password: string): Promise<Result<void>> => {
    const res = await attempt(
      () => apiRequest("POST", "/auth/email/change", { email, password }),
      "account.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 202) return ok(undefined);
    if (status === 403) return fail("account.err.password");
    if (status === 409) return fail("account.err.emailTaken");
    if (body.error === "locked") return fail("login.err.locked");
    // Пять писем в час — свой ответ: «подождите минуту» тут не поможет.
    if (body.error === "mail_limit") return fail("account.err.mailLimit");
    if (status === 429) return fail("account.err.tooOften");
    if (body.error === "bad_email") return fail("valid.email");
    if (body.error === "same_email") return fail("account.err.sameEmail");
    return fail("account.err.network");
  },

  /** Смена почты, шаг 2: код из письма. Возвращает новую почту. */
  confirmEmailChange: async (code: string): Promise<Result<string>> => {
    const res = await attempt(
      () => apiRequest("POST", "/auth/email/confirm", { code }),
      "account.err.network",
    );
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status === 200 && typeof body.email === "string") return ok(body.email);
    if (status === 409) return fail("account.err.emailTaken");
    if (status === 429) return fail("account.err.tooOften");
    if (status === 400) return fail("login.err.badCode");
    return fail("account.err.network");
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
