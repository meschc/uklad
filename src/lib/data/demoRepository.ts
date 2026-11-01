import { apiRequest } from "./api";
import { attempt, fail, ok, type Result } from "./result";

/**
 * Пропуск в демо-кабинет (сборка с сервером).
 *
 * Кабинет без входа закрыт целиком; открывает демо только ссылка из письма
 * на заявку: сервер ставит по ней куку `HttpOnly`, а кабинет спрашивает здесь,
 * жив ли пропуск. Сам токен браузеру не виден и обратно не приходит.
 */
export const demoRepository = {
  /** До какого момента открыто демо. `null` — пропуска нет или срок вышел. */
  pass: async (): Promise<Result<{ until: string } | null>> => {
    const res = await attempt(() => apiRequest("GET", "/demo/pass"), "sync.err.network");
    if (!res.ok) return res;
    const { status, body } = res.data;
    if (status !== 200) return fail("sync.err.network");
    return ok(body.ok === true && typeof body.until === "string" ? { until: body.until } : null);
  },
};
