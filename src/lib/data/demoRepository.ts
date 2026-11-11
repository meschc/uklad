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
  /**
   * След демо: какие экраны, куда нажимали, сколько пробыли (`lib/demoTrack`).
   * Сбой не показываем — демо работает и без счётчика.
   */
  track: async (events: DemoEvent[]): Promise<Result<true>> => {
    const res = await attempt(
      () => apiRequest("POST", "/demo/events", { events }),
      "sync.err.network",
    );
    return res.ok ? ok(true) : res;
  },
};

/** Событие демо: вид, короткая подпись (экран или кнопка), без введённого. */
export interface DemoEvent {
  k: "start" | "view" | "click" | "beat" | "leave";
  v?: string;
}
