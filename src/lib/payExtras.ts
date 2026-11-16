import type { BreakPolicy, PayAdjustment, PayAdjustmentKind, StaffEvent } from "./types";
import { shifts } from "./paidHours";

/**
 * Надбавки и корректировки к оплате по ставке (Кирилл 16.11: «премии и
 * надбавки тоже учесть, за ночные смены сразу»).
 *
 * Сами собой считаются две надбавки по ТК РФ: за ночные часы (22:00–06:00,
 * ст. 96 и 154) и за работу в нерабочий праздник (ст. 112 и 153). Часы для
 * них — только время «на смене»: перерыв и простой надбавку не дают.
 * Остальное — премии, разовые надбавки и удержания — старший вписывает
 * руками (`PayAdjustment`); правил «ошибка = 200 ₽» нет намеренно.
 */

const H = 3_600_000;
const DEFAULT_NIGHT_PCT = 20;
const DEFAULT_HOLIDAY_PCT = 100;

/** Нерабочие праздники (ТК РФ ст. 112), месяц-день. Переносы выходных сюда не входят. */
const HOLIDAYS = new Set([
  "01-01",
  "01-02",
  "01-03",
  "01-04",
  "01-05",
  "01-06",
  "01-07",
  "01-08",
  "02-23",
  "03-08",
  "05-01",
  "05-09",
  "06-12",
  "11-04",
]);

const pct = (v: number | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback;

export const nightPctOf = (p: Pick<BreakPolicy, "nightPct"> | undefined) =>
  pct(p?.nightPct, DEFAULT_NIGHT_PCT);
export const holidayPctOf = (p: Pick<BreakPolicy, "holidayPct"> | undefined) =>
  pct(p?.holidayPct, DEFAULT_HOLIDAY_PCT);

function isHoliday(dayStart: number): boolean {
  const d = new Date(dayStart);
  const md = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return HOLIDAYS.has(md);
}

/** Начало местных суток, в которые попадает `t`, и следующих. */
function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function nextDay(day: number): number {
  const d = new Date(day);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}
function at(day: number, hour: number): number {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

const overlap = (a: number, b: number, c: number, d: number) =>
  Math.max(0, Math.min(b, d) - Math.max(a, c));

/** Часы «на смене» в окне [from, to): ночные и праздничные. */
export function specialHours(
  events: readonly StaffEvent[],
  staffId: string,
  from: number,
  to: number,
): { nightMs: number; holidayMs: number } {
  let nightMs = 0;
  let holidayMs = 0;
  for (const shift of shifts(events, staffId, to)) {
    for (const seg of shift) {
      if (seg.state !== "on") continue;
      const a = Math.max(seg.from, from);
      const b = Math.min(seg.to, to);
      if (b <= a) continue;
      // Ночь, начавшаяся накануне (00:00–06:00), — от вчерашних суток.
      for (let day = dayStart(a) - 1; day < b;) {
        const d = dayStart(day);
        const next = nextDay(d);
        nightMs += overlap(a, b, at(d, 22), at(next, 6));
        if (d >= dayStart(a) && isHoliday(d)) holidayMs += overlap(a, b, d, next);
        day = next;
      }
    }
  }
  return { nightMs, holidayMs };
}

const rub = (ms: number, rate: number, p: number) => Math.round((ms / H) * rate * (p / 100));

/** Надбавки в рублях по ставке. Без ставки — null: числа, которого нет, не выдумываем. */
export function autoAllowances(
  hours: { nightMs: number; holidayMs: number },
  rate: number | null,
  policy: Pick<BreakPolicy, "nightPct" | "holidayPct"> | undefined,
): { night: number | null; holiday: number | null } {
  if (rate == null) return { night: null, holiday: null };
  return {
    night: rub(hours.nightMs, rate, nightPctOf(policy)),
    holiday: rub(hours.holidayMs, rate, holidayPctOf(policy)),
  };
}

/** Корректировки сотрудника за период по видам, ₽. */
export function adjustmentTotals(
  list: readonly PayAdjustment[],
  staffId: string,
  from: number,
  to: number,
): Record<PayAdjustmentKind, number> {
  const out: Record<PayAdjustmentKind, number> = { deduction: 0, bonus: 0, allowance: 0 };
  for (const a of list) {
    if (a.staffId !== staffId || a.at < from || a.at >= to) continue;
    out[a.kind] += a.amount;
  }
  return out;
}

/** Знак вида: удержание вычитается, остальное прибавляется. */
export const signOf = (kind: PayAdjustmentKind) => (kind === "deduction" ? -1 : 1);
