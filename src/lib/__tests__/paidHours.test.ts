import { describe, expect, it } from "vitest";
import { paidMs, unpaidMinOf } from "../paidHours";
import type { StaffEvent } from "../types";

const H = 3_600_000;
const M = 60_000;
const ev = (type: StaffEvent["type"], at: number, staffId = "a") =>
  ({ id: `${staffId}-${type}-${at}`, staffId, type, at }) as StaffEvent;
const policy = { unpaidMin: 60 };

describe("paidMs", () => {
  it("12 часов без отметок — 11 оплачиваемых", () => {
    const e = [ev("shift_start", 0), ev("shift_end", 12 * H)];
    expect(paidMs(e, "a", 0, 24 * H, policy)).toBe(11 * H);
  });

  it("короткие перерывы в пределах часа оплачиваются, сверх часа — нет", () => {
    const within = [
      ev("shift_start", 0),
      ev("break_start", 2 * H),
      ev("break_end", 2 * H + 15 * M),
      ev("break_start", 6 * H),
      ev("break_end", 6 * H + 40 * M),
      ev("shift_end", 12 * H),
    ];
    expect(paidMs(within, "a", 0, 24 * H, policy)).toBe(11 * H);
    const over = [
      ev("shift_start", 0),
      ev("break_start", 6 * H),
      ev("break_end", 7 * H + 30 * M),
      ev("shift_end", 12 * H),
    ];
    expect(paidMs(over, "a", 0, 24 * H, policy)).toBe(10 * H + 30 * M);
  });

  it("смена до 4 часов — без вычета, от 4 до 5 — пятый час как обед", () => {
    const short = [ev("shift_start", 0), ev("shift_end", 4 * H)];
    expect(paidMs(short, "a", 0, 24 * H, policy)).toBe(4 * H);
    const open = [ev("shift_start", 0)];
    expect(paidMs(open, "a", 0, 4 * H + 30 * M, policy)).toBe(4 * H);
    expect(paidMs(open, "a", 0, 6 * H, policy)).toBe(5 * H);
  });

  it("простой не входит, как и раньше", () => {
    const e = [
      ev("shift_start", 0),
      ev("idle_start", 1 * H),
      ev("idle_end", 3 * H),
      ev("shift_end", 5 * H),
    ];
    expect(paidMs(e, "a", 0, 24 * H, policy)).toBe(3 * H);
  });

  it("ночная смена через полночь вычитает норму один раз", () => {
    const e = [ev("shift_start", 20 * H), ev("shift_end", 32 * H)];
    const night = paidMs(e, "a", 0, 24 * H, policy);
    const morning = paidMs(e, "a", 24 * H, 48 * H, policy);
    expect(night).toBe(4 * H);
    expect(morning).toBe(7 * H);
    expect(night + morning).toBe(11 * H);
  });

  it("норма 0 — оплачивается всё время смены без отмеченных перерывов", () => {
    const e = [ev("shift_start", 0), ev("shift_end", 12 * H)];
    expect(paidMs(e, "a", 0, 24 * H, { unpaidMin: 0 })).toBe(12 * H);
  });

  it("старая настройка без поля — час по умолчанию", () => {
    expect(unpaidMinOf(undefined)).toBe(60);
    expect(unpaidMinOf({})).toBe(60);
  });
});
