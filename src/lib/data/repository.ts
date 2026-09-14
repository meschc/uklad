import { useEditor } from "../store";
import type { EditorState } from "../store/state";
import { keepValid, type Guard } from "./guards";
import { attempt, type Result } from "./result";

/**
 * Слой доступа к данным (п.0.4) — один явный шов между «что» (бизнес-правила)
 * и «где это лежит» (сегодня браузер, завтра Supabase).
 *
 * Как это устроено сейчас и почему именно так:
 *
 * — Сигнатуры уже асинхронные (`Promise<T>`), хотя внутри синхронный Zustand.
 *   Вызывающий код не должен меняться, когда за этими методами появится сеть.
 * — Ответ всегда в конверте `Result` (см. `result.ts`): у каждого вызова уже
 *   есть ветка «не вышло», хотя сегодня ей неоткуда сработать.
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
  list: () => Promise<Result<T[]>>;
  get: (id: string) => Promise<Result<T | null>>;
}

/**
 * Список из стора с проверкой формы. Асинхронность здесь пока формальная —
 * именно она и есть смысл упражнения: место, где появится `await fetch`.
 *
 * Записи неверной формы отбрасываются, но ответ остаётся успешным: одна битая
 * строка в хранилище — повод для предупреждения в консоли, а не для пустого
 * экрана вместо остальных двухсот.
 */
export function readList<T>(
  select: () => unknown,
  guard: Guard<T>,
  label: string,
): Promise<Result<T[]>> {
  return attempt(() => keepValid(select(), guard, label).items);
}

/**
 * Достать одну запись из списочного чтения, не теряя конверт: провал чтения
 * остаётся провалом, отсутствие записи — успешным `null`. Иначе каждый
 * репозиторий писал бы эти четыре строки по-своему.
 */
export async function pickOne<T>(
  read: () => Promise<Result<T[]>>,
  match: (item: T) => boolean,
): Promise<Result<T | null>> {
  const res = await read();
  if (!res.ok) return res;
  return { ok: true, data: res.data.find(match) ?? null };
}
