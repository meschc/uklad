import type { BreakPolicy, StaffEvent, StationSession } from "./types";

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

export type ShiftState = "off" | "on" | "break" | "idle";

const SHIFT_TYPES = new Set([
  "shift_start",
  "break_start",
  "break_end",
  "idle_start",
  "idle_end",
  "shift_end",
]);

/** Отметки смены одного сотрудника по времени. Сканы и упаковки в счёт часов не входят. */
function shiftMarks(events: readonly StaffEvent[], staffId: string): StaffEvent[] {
  return events
    .filter((e) => e.staffId === staffId && SHIFT_TYPES.has(e.type))
    .sort((a, b) => a.at - b.at);
}

/**
 * Должности руководства. Их бейджи не показываются подсказкой на экране входа
 * (в процессах руководство не работает), и только ими отвязывают устройство.
 */
/**
 * Демо-подсказки рабочего места: бейджи сотрудников на входе и руководителей
 * на отвязке стола. Это вход за любого одним кликом — в боевой сборке
 * (`VITE_DEMO=0`) их нет. По умолчанию сборка демонстрационная.
 */
export const DEMO_BADGES = import.meta.env.VITE_DEMO !== "0";

export const MANAGER_ROLE = /управля|заместител|руковод|директор|manager/i;

/** Сколько живёт отмена случайной отметки (нажал перерыв локтем). */
export const MARK_UNDO_MS = 5_000;

/** Когда началось текущее состояние смены — для таймера перерыва в шапке. */
export function stateSince(events: readonly StaffEvent[], staffId: string): number | null {
  return shiftMarks(events, staffId).at(-1)?.at ?? null;
}

/** Где сейчас сотрудник: не на смене, работает или на перерыве. */
export function shiftState(events: readonly StaffEvent[], staffId: string): ShiftState {
  const last = shiftMarks(events, staffId).at(-1);
  if (!last || last.type === "shift_end") return "off";
  if (last.type === "break_start") return "break";
  return last.type === "idle_start" ? "idle" : "on";
}

/** Какие отметки допустимы из состояния — кнопки меню и проверка команды одни. */
export function allowedMarks(state: ShiftState): StaffEvent["type"][] {
  if (state === "off") return ["shift_start"];
  if (state === "break") return ["break_end", "shift_end"];
  if (state === "idle") return ["idle_end", "break_start", "shift_end"];
  return ["break_start", "idle_start", "shift_end"];
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
  return stateMs(events, staffId, from, to, "on");
}

/**
 * Время в простое за окно — отдельной строкой, а не вычетом из часов:
 * простой «нет работы» оплачивается, решает это склад, а не экран.
 */
export function idleMs(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
): number {
  return stateMs(events, staffId, from, to, "idle");
}

function stateMs(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
  want: ShiftState,
): number {
  let total = 0;
  let state: ShiftState = "off";
  let since = 0;
  const add = (end: number) => {
    if (state !== want) return;
    const a = Math.max(since, from);
    const b = Math.min(end, to);
    if (b > a) total += b - a;
  };
  for (const e of shiftMarks(events, staffId)) {
    if (e.at >= to) break;
    add(e.at);
    if (e.type === "shift_start" || e.type === "break_end" || e.type === "idle_end") state = "on";
    else if (e.type === "break_start") state = "break";
    else if (e.type === "idle_start") state = "idle";
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

// --- Перерывы ---------------------------------------------------------------------

export const DEFAULT_BREAK_POLICY: BreakPolicy = {
  everyMin: 60,
  shortMin: 10,
  lunchFrom: 13 * 60,
  lunchMin: 45,
  autoIdleMin: 15,
};

/**
 * Автопростой: сотрудник на смене, но дольше `autoIdleMin` минут не было ни
 * одного его действия. Возвращает момент последнего действия (с него и
 * считается простой) или null. Ничего не пишет — это вывод, а не отметка.
 */
export function autoIdleSince(
  events: readonly StaffEvent[],
  staffId: string,
  policy: BreakPolicy,
  now: number,
): number | null {
  if (!policy.autoIdleMin || shiftState(events, staffId) !== "on") return null;
  let last = 0;
  for (const e of events) if (e.staffId === staffId && e.at > last) last = e.at;
  return now - last >= policy.autoIdleMin * 60_000 ? last : null;
}

/** Начало текущей смены (последняя отметка «начал смену»), если смена открыта. */
export function shiftStartedAt(events: readonly StaffEvent[], staffId: string): number | null {
  if (shiftState(events, staffId) === "off") return null;
  return (
    shiftMarks(events, staffId)
      .filter((e) => e.type === "shift_start")
      .at(-1)?.at ?? null
  );
}

export interface NextBreak {
  kind: "short" | "lunch";
  /** С какого момента перерыв доступен. */
  at: number;
  /** Сколько минут он длится по расписанию. */
  minutes: number;
}

/**
 * Ближайший перерыв по расписанию. Короткий — через `everyMin` минут работы
 * после начала смены или конца прошлого перерыва; обед — с `lunchFrom`, если
 * сегодня в смене обеда ещё не было (перерыв, начатый после `lunchFrom`).
 * Из двух берём тот, что раньше: обед заодно закрывает и короткий.
 */
export function nextBreak(
  events: readonly StaffEvent[],
  staffId: string,
  policy: BreakPolicy,
  now: number,
): NextBreak | null {
  const start = shiftStartedAt(events, staffId);
  if (start == null) return null;
  const marks = shiftMarks(events, staffId).filter((e) => e.at >= start);
  const lastResume = marks.filter((e) => e.type === "break_end").at(-1)?.at ?? start;
  const lunchAt = startOfDay(now) + policy.lunchFrom * 60_000;
  const hadLunch = marks.some((e) => e.type === "break_start" && e.at >= lunchAt);
  const short: NextBreak = {
    kind: "short",
    at: lastResume + policy.everyMin * 60_000,
    minutes: policy.shortMin,
  };
  if (hadLunch || lunchAt < start) return short;
  const lunch: NextBreak = { kind: "lunch", at: lunchAt, minutes: policy.lunchMin };
  return lunch.at <= short.at ? lunch : short;
}
