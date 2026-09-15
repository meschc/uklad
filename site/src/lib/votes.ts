/**
 * Голос за пункт роадмапа.
 *
 * Бэкенда у витрины нет, поэтому голос живёт в браузере посетителя: он
 * подсвечивает уже отданные голоса и прибавляется к числу из `roadmap.ts`.
 * Это честная механика ровно в одну сторону — человек видит, за что голосовал,
 * но общий счётчик от его клика не растёт для других. Когда появится сервер,
 * меняется этот файл, а не карточки: наружу торчат только `readVotes` и
 * `toggleVote`.
 *
 * Любое обращение к localStorage обёрнуто: в приватном окне и при запрете
 * cookies он бросает исключение, и витрина из-за голосов падать не должна.
 */
const KEY = "uklad-roadmap-votes-v1";

export type Votes = Record<string, true>;

export function readVotes(): Votes {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Votes = {};
    for (const id of Object.keys(parsed as Record<string, unknown>)) out[id] = true;
    return out;
  } catch {
    return {};
  }
}

/** Переключить голос и вернуть новое состояние (старое не мутируем). */
export function toggleVote(votes: Votes, id: string): Votes {
  const next = { ...votes };
  if (next[id]) delete next[id];
  else next[id] = true;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Голос не сохранился — в этой сессии он всё равно виден, и это лучше,
    // чем оборвать клик исключением.
  }
  return next;
}
