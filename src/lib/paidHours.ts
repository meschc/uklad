import type { BreakPolicy, StaffEvent } from "./types";

/**
 * Оплачиваемые часы смены (Кирилл 16.11: «оплачивается не всегда 12 часов,
 * обычно 11»). На складе час за смену не оплачивается, даже если человек не
 * нажал «перерыв»: это обед, он положен по графику, а не по кнопке.
 *
 * Правило одной смены: оплачивается время «на смене» и «на перерыве» за
 * вычетом большего из двух — отмеченных перерывов или нормы склада
 * (`unpaidMin`, по умолчанию 60 мин). Короткие перерывы в пределах нормы
 * оплачиваются, сверх нормы — нет. Простой сюда не входит: он идёт отдельной
 * строкой, как и раньше (`idleMs`).
 *
 * Норма набегает после 4 часов работы, а не сразу: на смене до 4 часов обед
 * не положен (ТК РФ ст. 108), а у открытой смены «заработано сегодня» не
 * прыгает вниз — пятый час просто идёт как обед. Смена через полночь не
 * вычитается дважды: считаем накопленную оплату на краях окна и берём разность.
 */

const DEFAULT_UNPAID_MIN = 60;

/** С какого часа работы набегает неоплачиваемая норма. */
const NORM_AFTER_MS = 4 * 3_600_000;

/** Норма склада; у старой настройки поля нет — значит, по умолчанию. */
export function unpaidMinOf(policy: Pick<BreakPolicy, "unpaidMin"> | undefined): number {
  const v = policy?.unpaidMin;
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_UNPAID_MIN;
}

type State = "off" | "on" | "break" | "idle";
export interface Seg {
  from: number;
  to: number;
  state: State;
}

const MARK: Partial<Record<StaffEvent["type"], State>> = {
  shift_start: "on",
  break_end: "on",
  idle_end: "on",
  break_start: "break",
  idle_start: "idle",
  shift_end: "off",
};

/** Смены сотрудника отрезками состояний; открытая смена тянется до `until`. */
export function shifts(events: readonly StaffEvent[], staffId: string, until: number): Seg[][] {
  const marks = events
    .filter((e) => e.staffId === staffId && MARK[e.type])
    .sort((a, b) => a.at - b.at);
  const out: Seg[][] = [];
  let cur: Seg[] | null = null;
  let state: State = "off";
  let since = 0;
  for (const e of marks) {
    if (state !== "off" && cur && e.at > since) cur.push({ from: since, to: e.at, state });
    const next = MARK[e.type]!;
    if (e.type === "shift_start" || (state === "off" && next !== "off")) {
      cur = [];
      out.push(cur);
    }
    state = next;
    since = e.at;
  }
  if (state !== "off" && cur && until > since) cur.push({ from: since, to: until, state });
  return out;
}

/** Сколько оплачено в смене от её начала до момента `t`. */
function paidUntil(shift: readonly Seg[], t: number, normMs: number): number {
  let worked = 0;
  let breaks = 0;
  for (const s of shift) {
    if (s.from >= t) break;
    const len = Math.min(s.to, t) - s.from;
    if (s.state === "on" || s.state === "break") worked += len;
    if (s.state === "break") breaks += len;
  }
  const norm = Math.min(normMs, Math.max(0, worked - NORM_AFTER_MS));
  return worked - Math.max(breaks, norm);
}

/** Оплачиваемое время в окне [from, to). Открытая смена считается до `to`. */
export function paidMs(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
  policy: Pick<BreakPolicy, "unpaidMin"> | undefined,
): number {
  const normMs = unpaidMinOf(policy) * 60_000;
  let total = 0;
  for (const shift of shifts(events, staffId, to)) {
    if (shift.length === 0) continue;
    const a = Math.max(from, shift[0].from);
    const b = Math.min(to, shift[shift.length - 1].to);
    if (b > a) total += paidUntil(shift, b, normMs) - paidUntil(shift, a, normMs);
  }
  return total;
}
