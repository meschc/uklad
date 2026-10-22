import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS,
  badgeCode,
  earnings,
  isSessionLive,
  parseBadge,
  shiftState,
  workedMs,
} from "../workstation";
import type { StaffEvent } from "../types";

const H = 3_600_000;
let n = 0;
const ev = (type: StaffEvent["type"], at: number, staffId = "s1"): StaffEvent => ({
  id: `e${n++}`,
  staffId,
  type,
  at,
});
describe("бейдж и вход", () => {
  it("код бейджа разбирается обратно в id, чужие коды — нет", () => {
    expect(parseBadge(badgeCode("staff_42"))).toBe("staff_42");
    expect(parseBadge("uk-stf-staff_42")).toBe("staff_42");
    expect(parseBadge("UK-BOX-0001")).toBeNull();
    expect(parseBadge("UK-STF-")).toBeNull();
  });

  it("вход живёт 12 часов", () => {
    const s = { staffId: "s1", station: "pack" as const, startedAt: 0, expiresAt: SESSION_TTL_MS };
    expect(isSessionLive(s, SESSION_TTL_MS - 1)).toBe(true);
    expect(isSessionLive(s, SESSION_TTL_MS)).toBe(false);
    expect(isSessionLive(null, 0)).toBe(false);
  });
});

describe("смена и часы", () => {
  it("перерыв не считается работой", () => {
    const events = [
      ev("shift_start", 0),
      ev("break_start", 2 * H),
      ev("break_end", 3 * H),
      ev("shift_end", 8 * H),
    ];
    expect(workedMs(events, "s1", 0, 24 * H)).toBe(7 * H);
    expect(shiftState(events, "s1")).toBe("off");
  });

  it("смену закрыли прямо с перерыва — перерыв всё равно не засчитан", () => {
    const events = [ev("shift_start", 0), ev("break_start", 4 * H), ev("shift_end", 5 * H)];
    expect(workedMs(events, "s1", 0, 24 * H)).toBe(4 * H);
  });

  it("открытая смена считается до «сейчас» и режется окном", () => {
    const events = [ev("shift_start", 22 * H)];
    expect(shiftState(events, "s1")).toBe("on");
    // Ночная смена: в «сегодня», начавшееся в полночь, идёт только своя часть.
    expect(workedMs(events, "s1", 24 * H, 26 * H)).toBe(2 * H);
  });

  it("чужие отметки и сканы в часы не входят", () => {
    const events = [ev("shift_start", 0, "s2"), ev("pack_done", H), ev("shift_start", 2 * H)];
    expect(workedMs(events, "s1", 0, 3 * H)).toBe(H);
  });

  it("без ставки заработок не ноль, а «не задан»", () => {
    expect(earnings(7.5 * H, 400)).toBe(3000);
    expect(earnings(H, undefined)).toBeNull();
  });
});
