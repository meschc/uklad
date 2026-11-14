/**
 * Уведомления — одна система на кабинет и рабочее место (Кирилл 13 ноя:
 * «уведомления работают криво»). Здесь только правила: тон, сколько висит,
 * как складывается стопка. Рисует `components/Toaster`, хранит стор.
 *
 * Когда что показывать — `docs/design/DESIGN-SYSTEM.md`, «Уведомления»:
 * ошибка ввода — у поля (`ui/field`), отказ сервера на форме — у кнопки
 * отправки, тост — итог действия вне формы и фоновое событие.
 */
import { UNDO_WINDOW_MS } from "./actionRisk";
import type { MsgKey } from "./i18n";

/**
 * Тон — обязателен в каждом вызове. Раньше по умолчанию был «успех», и отказ
 * показывался зелёной галочкой («В этом диапазоне нет номеров» ✓).
 *
 * - `success` — сделано то, что человек просил;
 * - `info` — событие не от его действия (новое сообщение, режим чтения);
 * - `warning` — сделано не всё или действие не выполнено, но ничего не сломано;
 * - `error` — отказ: сервер не принял, данные не сохранились.
 */
export type NoticeTone = "success" | "info" | "warning" | "error";

export interface Notice {
  id: number;
  tone: NoticeTone;
  key: MsgKey;
  vars?: Record<string, string | number>;
  /** Вернуть сделанное — у действий класса `undoable` (`lib/actionRisk`). */
  undo?: () => void;
  /** Сколько раз пришло то же самое подряд: повтор не плодит копии. */
  count: number;
}

export interface NoticeInput {
  vars?: Record<string, string | number>;
  undo?: () => void;
}

/** Больше трёх уведомлений разом не читают: старые уходят. */
const MAX_NOTICES = 3;

/**
 * Сколько висит уведомление. Текст человек должен успеть прочитать, а
 * ошибку — ещё и понять, поэтому она живёт дольше. Наведение и фокус
 * останавливают таймер (WCAG 2.2.1), крестик закрывает сразу.
 * У отменяемого действия — ровно окно отмены.
 */
export function noticeDuration(tone: NoticeTone, textLength: number, undoable: boolean): number {
  if (undoable) return UNDO_WINDOW_MS;
  const read = Math.max(4000, textLength * 70);
  const floor = tone === "error" ? 10_000 : tone === "warning" ? 7000 : 4000;
  return Math.min(16_000, Math.max(floor, read));
}

/** Одинаковые — то же сообщение с теми же числами. */
function same(a: Notice, b: Omit<Notice, "id" | "count">): boolean {
  return (
    a.key === b.key &&
    a.tone === b.tone &&
    !a.undo &&
    !b.undo &&
    JSON.stringify(a.vars ?? {}) === JSON.stringify(b.vars ?? {})
  );
}

/**
 * Новое уведомление в стопку: снизу, самое свежее ближе к руке. Повтор того
 * же (сканер выстрелил дважды) не добавляет копию, а поднимает счётчик и
 * перезапускает таймер новым `id`.
 */
export function pushNotice(
  list: readonly Notice[],
  next: Omit<Notice, "id" | "count">,
  id: number,
): Notice[] {
  const dup = list.find((n) => same(n, next));
  const rest = list.filter((n) => n !== dup);
  const item: Notice = { ...next, id, count: dup ? dup.count + 1 : 1 };
  return [...rest, item].slice(-MAX_NOTICES);
}
