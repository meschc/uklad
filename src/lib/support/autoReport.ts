/**
 * Ошибки у пользователей — на сервер сами, без кнопки (аудит запуска, п.3).
 *
 * Упал экран или вылетела необработанная ошибка — кабинет отправляет короткую
 * запись на `POST /api/support/errors`: откуда, на каком экране, первую
 * строку ошибки и верх стека, всё через `scrubText`. Данных склада, введённых
 * значений, сессии и сведений о человеке в записи нет. Сервер чистит текст
 * ещё раз, склеивает одинаковые и шлёт письмо о новой ошибке и сводку за
 * сутки (`server/api/src/clientErrors.js`).
 *
 * Шум не шлём: одна и та же ошибка — один раз за загрузку страницы, всего —
 * не больше `MAX_PER_PAGE`. Демо без сервера не шлёт ничего.
 */
import { hasCabinetServer } from "@/lib/data/api";
import { scrubText } from "./journal";

export const MAX_PER_PAGE = 10;
const MAX_MESSAGE = 300;
const MAX_STACK = 2000;
const STACK_LINES = 8;

/**
 * Шум браузера, а не наша поломка: ResizeObserver жалуется на собственный цикл,
 * «Script error.» — ошибка чужого скрипта, у которой браузер скрыл текст.
 */
const NOISE = [/^ResizeObserver loop/, /^Script error\.?$/];

export interface ClientError {
  version: 1;
  /** `window`, `promise` или `screen:<экран>`. */
  source: string;
  view: string;
  message: string;
  stack?: string;
}

/** Текст и стек из того, что бросили, — бросить могут что угодно. */
function split(e: unknown): { message: string; stack: string } {
  if (e instanceof Error) return { message: `${e.name}: ${e.message}`, stack: e.stack ?? "" };
  return { message: typeof e === "string" ? e : String(e), stack: "" };
}

/** Собрать запись. `null` — шум, который слать незачем. */
export function buildClientError(source: string, view: string, e: unknown): ClientError | null {
  const { message: raw, stack } = split(e);
  const message = scrubText(raw.split("\n")[0].trim()).slice(0, MAX_MESSAGE);
  if (!message || NOISE.some((re) => re.test(message))) return null;
  const top = scrubText(stack.split("\n").slice(0, STACK_LINES).join("\n")).slice(0, MAX_STACK);
  return {
    version: 1,
    source,
    view: /^[\w-]{0,40}$/.test(view) ? view : "",
    message,
    ...(top ? { stack: top } : {}),
  };
}

type Send = (body: ClientError) => void;

/** Отправка без ожидания: `keepalive` доносит запись и при уходе со страницы. */
function postError(body: ClientError) {
  void fetch("/api/support/errors", {
    method: "POST",
    credentials: "same-origin",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    // Сеть упала — ошибка останется в журнале для «Сообщить о проблеме».
  });
}

export function createAutoReporter(send: Send | null) {
  const seen = new Set<string>();
  return function report(source: string, view: string, e: unknown) {
    if (!send || seen.size >= MAX_PER_PAGE) return;
    const body = buildClientError(source, view, e);
    if (!body) return;
    const key = `${body.source}\n${body.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    try {
      send(body);
    } catch {
      // Отчёт об ошибке не должен сам становиться ошибкой.
    }
  };
}

/** Общий на кабинет: шлёт только сборка с сервером. */
export const autoReport = createAutoReporter(
  hasCabinetServer && typeof fetch === "function" ? postError : null,
);
