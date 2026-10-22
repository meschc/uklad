import type { StaffEvent, StationSession } from "./types";

/**
 * Рабочее место и смена сотрудника — чистые правила, о хранилище не знают.
 *
 * Здесь две вещи, которые ошибаются молча: в каком состоянии смена и сколько
 * часов отработано (а значит, сколько заработано). Неверный ответ выглядит как
 * обычный — его заметят только в день зарплаты. Правила упаковки — в `packing.ts`.
 */

/** Префикс бейджа сотрудника. Латиницей, как и номера тары: так его читает любой сканер. */
export const BADGE_PREFIX = "UK-STF-";

/** Вход по бейджу живёт одну смену с запасом (узел карты «вход на ТСД по QR»). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Код, который печатается на бейдже сотрудника.
 *
 * ТОЛЬКО ДЛЯ ДЕМО БЕЗ СЕРВЕРА. Бейдж держится на одном id: кто видел чужой
 * бейдж или знает id, напечатает копию и войдёт за другого — смены и заработок
 * запишутся на того человека. На сервере в QR кладём случайный секрет бейджа
 * (не меньше 128 бит), который отзывается и перевыпускается при потере, а id в
 * коде не бывает вовсе. Переносить эту функцию на сервер как есть нельзя.
 */
export function badgeCode(staffId: string): string {
  return `${BADGE_PREFIX}${staffId}`;
}

/**
 * Достать id сотрудника из скана бейджа. Регистр не важен: дешёвые сканеры
 * иногда отдают строку в другом регистре, чем она напечатана.
 */
export function parseBadge(raw: string): string | null {
  const code = raw.trim();
  if (code.toUpperCase().startsWith(BADGE_PREFIX)) {
    const id = code.slice(BADGE_PREFIX.length);
    return id || null;
  }
  return null;
}

export function isSessionLive(session: StationSession | null, now: number): boolean {
  return !!session && now < session.expiresAt;
}

// --- Смена ----------------------------------------------------------------------

export type ShiftState = "off" | "on" | "break";

const SHIFT_TYPES = new Set(["shift_start", "break_start", "break_end", "shift_end"]);

/** Отметки смены одного сотрудника по времени. Сканы и упаковки в счёт часов не входят. */
function shiftMarks(events: readonly StaffEvent[], staffId: string): StaffEvent[] {
  return events
    .filter((e) => e.staffId === staffId && SHIFT_TYPES.has(e.type))
    .sort((a, b) => a.at - b.at);
}

/** Где сейчас сотрудник: не на смене, работает или на перерыве. */
export function shiftState(events: readonly StaffEvent[], staffId: string): ShiftState {
  const last = shiftMarks(events, staffId).at(-1);
  if (!last || last.type === "shift_end") return "off";
  return last.type === "break_start" ? "break" : "on";
}

/** Какие отметки допустимы из состояния — кнопки меню и проверка команды одни. */
export function allowedMarks(state: ShiftState): StaffEvent["type"][] {
  if (state === "off") return ["shift_start"];
  if (state === "break") return ["break_end", "shift_end"];
  return ["break_start", "shift_end"];
}

/**
 * Отработанное время в окне [from, to): только «на смене», перерывы не входят.
 *
 * Считаем по переходам, а не по парам «начал — закончил»: человек забывает
 * отметить конец перерыва и сразу закрывает смену, и парный подсчёт тогда
 * засчитал бы ему весь перерыв как работу (или потерял бы всю смену). Здесь
 * каждый отрезок между соседними отметками честно принадлежит одному состоянию.
 * Открытая смена считается до `to` — обычно это «сейчас».
 */
export function workedMs(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
): number {
  let total = 0;
  let state: ShiftState = "off";
  let since = 0;
  const add = (end: number) => {
    if (state !== "on") return;
    const a = Math.max(since, from);
    const b = Math.min(end, to);
    if (b > a) total += b - a;
  };
  for (const e of shiftMarks(events, staffId)) {
    if (e.at >= to) break;
    add(e.at);
    if (e.type === "shift_start" || e.type === "break_end") state = "on";
    else if (e.type === "break_start") state = "break";
    else state = "off";
    since = e.at;
  }
  add(to);
  return total;
}

/** Заработок за отработанное время, ₽, округлён до рубля. Без ставки — null, а не ноль. */
export function earnings(ms: number, hourlyRate: number | undefined): number | null {
  if (!hourlyRate || hourlyRate <= 0) return null;
  return Math.round((ms / 3_600_000) * hourlyRate);
}

/** Начало суток по местному времени — окно «сегодня» в меню сотрудника. */
export function startOfDay(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Начало месяца — окно «за месяц». */
export function startOfMonth(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}
