import { describe, expect, it } from "vitest";
import { specialHours, nightPctOf, holidayPctOf } from "../payExtras";
import type { StaffEvent } from "../types";

const H = 3_600_000;
const ev = (type: StaffEvent["type"], at: number) =>
  ({ id: `${type}-${at}`, staffId: "a", type, at }) as StaffEvent;

describe("specialHours", () => {
  it("ночь 22–06 через полночь, перерыв ночных часов не даёт", () => {
    const s = new Date(2026, 2, 10, 20).getTime();
    const e = [
      ev("shift_start", s),
      ev("break_start", s + 4 * H), // 00:00–01:00
      ev("break_end", s + 5 * H),
      ev("shift_end", s + 12 * H),
    ];
    expect(specialHours(e, "a", s - 1, s + 24 * H).nightMs).toBe(7 * H);
  });

  it("окно режет ночь: до полуночи — одни сутки, после — другие", () => {
    const s = new Date(2026, 2, 10, 20).getTime();
    const mid = new Date(2026, 2, 11).getTime();
    const e = [ev("shift_start", s), ev("shift_end", s + 12 * H)];
    expect(specialHours(e, "a", s, mid).nightMs).toBe(2 * H);
    expect(specialHours(e, "a", mid, mid + 24 * H).nightMs).toBe(6 * H);
  });

  it("праздник — часы смены в нерабочий праздничный день", () => {
    const s = new Date(2026, 4, 9, 9).getTime(); // 9 мая
    const e = [ev("shift_start", s), ev("shift_end", s + 8 * H)];
    expect(specialHours(e, "a", s - H, s + 24 * H)).toEqual({ nightMs: 0, holidayMs: 8 * H });
  });

  it("будний день — ни ночи, ни праздника", () => {
    const s = new Date(2026, 2, 10, 9).getTime();
    const e = [ev("shift_start", s), ev("shift_end", s + 8 * H)];
    expect(specialHours(e, "a", s, s + 24 * H)).toEqual({ nightMs: 0, holidayMs: 0 });
  });

  it("проценты по умолчанию — по ТК: 20 за ночь, 100 за праздник", () => {
    expect(nightPctOf(undefined)).toBe(20);
    expect(holidayPctOf({})).toBe(100);
    expect(nightPctOf({ nightPct: 0 })).toBe(0);
  });
});
