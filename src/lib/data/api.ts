/**
 * Транспорт кабинета к своему серверу (`server/api`).
 *
 * Адрес берётся из `VITE_API_URL` при сборке. Образ сервера
 * (`deploy/web.Dockerfile`) ставит `/api` — тот же домен, Caddy передаёт
 * запросы серверу. Демо на GitHub Pages собирается без адреса: там сервера
 * нет, и кабинет работает по-старому, в браузере.
 *
 * Сессия живёт в куке `HttpOnly`: JavaScript её не видит и не хранит, поэтому
 * украденный скриптом токен — не наш сценарий. Запросы идут с
 * `credentials: "same-origin"`, тело — только JSON: сервер отвергает POST без
 * своего Origin и без `application/json` (защита от подделки запроса).
 */

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Есть ли у сборки сервер кабинета. Нет — вход и данные остаются в браузере. */
export const hasCabinetServer = BASE !== "";

/**
 * Запросы без сессии: на них 401 значит «не тот пароль или код», а не «сессия
 * кончилась». Всё остальное с ответом 401 — сессии больше нет.
 */
const PUBLIC_PATHS = new Set([
  "/auth/register",
  "/auth/verify",
  "/auth/resend",
  "/auth/reset/request",
  "/auth/reset",
  "/auth/login",
  "/auth/logout",
  "/auth/badge",
]);

let onUnauthorized: (() => void) | null = null;

/** Кто узнаёт, что сессии больше нет. Ставит кабинет, пока вход серверный. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

/** Ответ сервера: код и разобранное тело (`{}`, если тела нет или оно не JSON). */
export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Один запрос к серверу. Сетевой сбой бросает исключение — его превращает в
 * ответ `attempt()` репозитория; коды 4xx/5xx возвращаются как есть, их смысл
 * знает репозиторий, а не транспорт.
 */
export async function apiRequest(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResponse> {
  if (!hasCabinetServer) throw new Error("у сборки нет сервера кабинета");
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let parsed: Record<string, unknown> = {};
  try {
    const data: unknown = await res.json();
    if (data && typeof data === "object") parsed = data as Record<string, unknown>;
  } catch {
    // пустое тело или не JSON — смысл несёт код ответа
  }
  if (res.status === 401 && !PUBLIC_PATHS.has(path)) onUnauthorized?.();
  return { status: res.status, body: parsed };
}
