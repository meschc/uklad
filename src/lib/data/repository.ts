import { useEditor } from "../store";
import type { EditorState } from "../store/state";
import type { Guard } from "./guards";

/**
 * Слой доступа к данным (п.0.4) — один явный шов между «что» (бизнес-правила)
 * и «где это лежит» (сегодня браузер, завтра Supabase).
 *
 * Как это устроено сейчас и почему именно так:
 *
 * — Сигнатуры уже асинхронные (`Promise<T>`), хотя внутри синхронный Zustand.
 *   Вызывающий код не должен меняться, когда за этими методами появится сеть.
 * — Репозиторий — путь КОМАНД и разовых чтений (импорт/экспорт, проверки,
 *   диалоги). Реактивный рендер по-прежнему подписан на стор: стор здесь и есть
 *   локальный кэш, ровно как он останется кэшем при настоящем backend.
 * — На выходе `list()` — проверка формы (`Guard`), а не слепое доверие данным.
 *
 * Порт наружу (`StorePort`) специально узкий: подменив его, репозитории можно
 * протестировать или перевести на сеть, не трогая экраны.
 */

export interface StorePort {
  get: () => EditorState;
  set: (patch: Partial<EditorState>) => void;
}

/** Порт по умолчанию — реальный стор приложения. */
export const storePort: StorePort = {
  get: () => useEditor.getState(),
  set: (patch) => useEditor.setState(patch),
};

/** Общий контракт репозитория одного домена. */
export interface Repository<T> {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T | null>;
}

/**
 * Список из стора с проверкой формы. Асинхронность здесь пока формальная —
 * именно она и есть смысл упражнения: место, где появится `await fetch`.
 */
export async function readList<T>(
  select: () => unknown,
  guard: Guard<T>,
  label: string,
): Promise<T[]> {
  const raw = select();
  if (!Array.isArray(raw)) return [];
  const bad = raw.filter((x) => !guard(x)).length;
  if (bad > 0) {
    console.warn(`[uklad] ${label}: записей неверной формы — ${bad}`);
  }
  return raw.filter(guard);
}
