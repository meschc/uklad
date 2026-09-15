import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "@/lib/safeStorage";
import type { RoadmapItem } from "../data/roadmap";

/**
 * Голоса за пункты дорожной карты.
 *
 * Витрина — статика на файловом хостинге: сервера, который сложил бы голоса
 * всех посетителей, у неё нет. Поэтому голос устроен в два шага, и оба честные:
 *
 *  1. **Отметка** живёт в браузере того, кто её поставил. Нажатие ничего никуда
 *     не отправляет, и карточка так и говорит — «отмечено», а не «учтено».
 *  2. **Отправка** идёт формой внизу страницы, тем же путём, что и остальные
 *     заявки (`lib/leads`): отмеченные пункты уходят письмом вместе с идеей и
 *     согласием на обработку данных. Вот после этого голос действительно у нас.
 *
 * Чего здесь нет намеренно — **общей цифры рядом с пунктом**. Сложить голоса
 * негде, а нарисовать «17» под идеей можно за минуту, и выглядело бы это ровно
 * как настоящий счётчик. Дорожная карта — обещание наружу; цифра появится в тот
 * день, когда её будет откуда взять, и ни днём раньше.
 *
 * Хранилище может быть недоступно (приватное окно, запрет хранилища) — тогда
 * отметки живут до перезагрузки страницы. Это неприятно, но не ломает ничего:
 * отправить отмеченное человек всё равно успевает в той же вкладке.
 */

const KEY = "uklad.roadmap-votes";

/**
 * Сколько пунктов можно отметить.
 *
 * Ограничение не техническое, а смысловое: список из сорока отмеченных пунктов
 * — это не приоритет, а «хочу всё», и очерёдность он не меняет. Заодно решается
 * вопрос длины: отмеченное уходит в письмо одной строкой заголовков, и у неё на
 * приёмнике есть предел (`MAX_FIELD_VALUE` в `server/leads/lead.js`).
 */
export const MAX_VOTES = 10;

const EMPTY: readonly string[] = [];

/**
 * Разобранный список — он же снимок для React.
 *
 * `useSyncExternalStore` сравнивает снимки по ссылке и зацикливается, если
 * каждый вызов возвращает новый массив. Поэтому список читается из хранилища
 * один раз и дальше живёт здесь, а новый массив появляется только при правке.
 */
let cache: readonly string[] | null = null;

const listeners = new Set<() => void>();

/**
 * Разбор записи хранилища. Отдельной функцией — в неё приходит что угодно:
 * запись мог оставить старый выпуск сайта, а мог и человек руками из консоли.
 */
export function parseVotes(raw: string | null): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  const ids = parsed.filter((id): id is string => typeof id === "string" && id !== "");
  return [...new Set(ids)].slice(0, MAX_VOTES);
}

/** Отмеченные пункты в порядке нажатий. */
export function readVotes(): readonly string[] {
  if (cache === null) cache = parseVotes(readLocal(KEY));
  return cache;
}

function commit(next: readonly string[]): void {
  cache = next;
  writeLocal(KEY, JSON.stringify(next));
  for (const notify of listeners) notify();
}

/**
 * Отметить пункт или снять отметку.
 *
 * Сверх предела отметка не ставится, и старая при этом не вытесняется: молча
 * сбросить чужой выбор ради нового — худшее, что может сделать кнопка. Что
 * предел достигнут, доска говорит подписью, а не бездействием.
 */
export function toggleVote(id: string): void {
  const votes = readVotes();

  if (votes.includes(id)) {
    commit(votes.filter((voted) => voted !== id));
    return;
  }

  if (votes.length >= MAX_VOTES) return;
  commit([...votes, id]);
}

/** Снять все отметки — кнопка «очистить» под формой. */
export function clearVotes(): void {
  commit(EMPTY);
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/**
 * Отметки для компонентов. На сборке страниц хранилища нет и быть не может —
 * там отмечать некому, поэтому пререндер всегда видит пустой список.
 */
export function useVotes(): readonly string[] {
  return useSyncExternalStore(subscribe, readVotes, () => EMPTY);
}

/**
 * Можно ли голосовать за пункт.
 *
 * За готовое — нельзя: оно уже работает, и голос ничего не сдвинет. Всё
 * остальное — от начатого до идеи — очерёдность имеет, и голос на неё влияет.
 */
export function isVotable(item: RoadmapItem): boolean {
  return item.status !== "done";
}

/** Отмеченные пункты в порядке доски — так их и перечисляет форма. */
export function votedItems(items: readonly RoadmapItem[], votes: readonly string[]): RoadmapItem[] {
  const marked = new Set(votes);
  return items.filter((item) => marked.has(item.id));
}
