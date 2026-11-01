import type { MsgKey } from "../i18n";
import { apiRequest, type ApiResponse } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Вход в кабинет через сервер (`server/api/src/cabinet/auth.js`).
 *
 * Здесь только перевод ответов сервера на язык интерфейса: какой код ответа
 * что значит для человека. Правила (сколько попыток, когда код истекает)
 * живут на сервере, клиент их не дублирует — иначе две копии разъедутся.
 *
 * Сервер намеренно отвечает одинаково на «нет такой почты» и «не тот
 * пароль», на «нет такой почты» и «код отправлен». Экран не должен
 * пытаться различить эти случаи: кто зарегистрирован, знает только
 * владелец почты.
 */

/** Компания вошедшего, как её видит сервер. */
export interface ServerOrg {
  id: string;
  name: string;
  warehouse: boolean;
  seller: boolean;
  role: string;
}

/** Кто вошёл: компании и та, в которой он сейчас работает. */
export interface ServerMe {
  kind: "password" | "badge";
  orgs: ServerOrg[];
  current: { orgId: string; memberId: string; warehouseId: string | null } | null;
}

/** Итог входа: вошёл, или пароль верный, но почту ещё не подтвердили. */
export type LoginOutcome = "signedIn" | "unverified";

/** Общие отказы: частые попытки, сбой сервера. */
function common(res: ApiResponse): MsgKey {
  if (res.status === 429) {
    return res.body.error === "locked" ? "login.err.locked" : "login.err.tooOften";
  }
  return "data.failed";
}

/** Сетевой сбой и ответ с отказом — оба становятся `Result` с ключом словаря. */
async function call<T>(
  run: () => Promise<ApiResponse>,
  read: (res: ApiResponse) => Result<T>,
): Promise<Result<T>> {
  const res = await attempt(run, "login.err.network");
  return res.ok ? read(res.data) : res;
}

export const authRepository = {
  /** Регистрация не даёт входа: на почту уходит код (`verify`). */
  register: (email: string, password: string, kind: "warehouse" | "seller") =>
    call(
      () => apiRequest("POST", "/auth/register", { email, password, kind, consent: true }),
      (res): Result<void> => (res.status === 202 ? ok(undefined) : fail(common(res))),
    ),

  /** Код из письма после регистрации — и сразу вход. */
  verify: (email: string, code: string) =>
    call(
      () => apiRequest("POST", "/auth/verify", { email, code }),
      (res): Result<void> =>
        res.status === 200
          ? ok(undefined)
          : fail(res.body.error === "bad_code" ? "login.err.badCode" : common(res)),
    ),

  /** Прислать код ещё раз: подтверждения или сброса пароля. */
  sendCode: (email: string, purpose: "verify" | "reset") =>
    call(
      () =>
        apiRequest("POST", purpose === "verify" ? "/auth/resend" : "/auth/reset/request", {
          email,
        }),
      (res): Result<void> => (res.status === 202 ? ok(undefined) : fail(common(res))),
    ),

  /** Новый пароль по коду из письма — и сразу вход. */
  reset: (email: string, code: string, password: string) =>
    call(
      () => apiRequest("POST", "/auth/reset", { email, code, password }),
      (res): Result<void> => {
        if (res.status === 200) return ok(undefined);
        if (res.body.error === "bad_code") return fail("login.err.badCode");
        if (res.body.error === "weak_password") return fail("login.err.weakPassword");
        return fail(common(res));
      },
    ),

  login: (email: string, password: string) =>
    call(
      () => apiRequest("POST", "/auth/login", { email, password }),
      (res): Result<LoginOutcome> => {
        if (res.status === 200) return ok("signedIn");
        if (res.status === 403 && res.body.error === "email_unverified") return ok("unverified");
        if (res.status === 401) return fail("login.err.badCredentials");
        return fail(common(res));
      },
    ),

  logout: () =>
    call(
      () => apiRequest("POST", "/auth/logout", {}),
      (res): Result<void> => (res.status === 200 ? ok(undefined) : fail(common(res))),
    ),

  /** Кто вошёл. `null` — сессии нет или она истекла. */
  me: () =>
    call(
      () => apiRequest("GET", "/auth/me"),
      (res): Result<ServerMe | null> => {
        if (res.status === 401) return ok(null);
        if (res.status !== 200) return fail(common(res));
        const b = res.body as Partial<ServerMe>;
        return ok({
          kind: b.kind === "badge" ? "badge" : "password",
          orgs: Array.isArray(b.orgs) ? b.orgs : [],
          current: b.current ?? null,
        });
      },
    ),
};

/**
 * Роль в интерфейсе по компании: склад видит склад, селлер — свои остатки.
 * Компания с обеими ветками (свой склад у продавца) входит складом: оттуда
 * видно всё, а кабинет продавца — режим просмотра тех же данных.
 */
export function roleOf(me: ServerMe): { orgId: string; role: "warehouse" | "seller" } | null {
  const org = me.orgs.find((o) => o.id === me.current?.orgId) ?? me.orgs[0];
  if (!org) return null;
  return { orgId: org.id, role: org.warehouse ? "warehouse" : "seller" };
}
