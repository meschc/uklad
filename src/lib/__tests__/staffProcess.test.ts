import { describe, expect, it } from "vitest";
import { currentProcess, processMs } from "../staffProcess";
import type { StaffEvent } from "../types";

const H = 3_600_000;
let n = 0;
const ev = (type: StaffEvent["type"], at: number, station?: StaffEvent["station"]): StaffEvent => ({
  id: `e${n++}`,
  staffId: "stf-ivan",
  type,
  at,
  ...(station ? { station } : {}),
});

// Смена с 9:00: упаковка до 11:00, перерыв 11:00–11:30, потом сборка до 13:00.
const day = [
  ev("shift_start", 9 * H, "pack"),
  ev("pack_scan", 9.5 * H, "pack"),
  ev("break_start", 11 * H, "pack"),
  ev("break_end", 11.5 * H),
  ev("pick_scan", 11.5 * H, "picking"),
  ev("pick_scan", 12 * H, "picking"),
];

describe("участок сам следует за человеком", () => {
  it("перешёл с упаковки на сборку — сейчас сборка с первого скана там", () => {
    expect(currentProcess(day, "stf-ivan")).toEqual({ station: "picking", since: 11.5 * H });
  });

  it("часы делятся по участкам, перерыв не входит", () => {
    expect(processMs(day, "stf-ivan", 0, 13 * H)).toEqual({ pack: 2 * H, picking: 1.5 * H });
  });

  it("смена закрыта — участка нет; новая смена начинается с чистого участка", () => {
    const closed = [...day, ev("shift_end", 13 * H, "picking")];
    expect(currentProcess(closed, "stf-ivan")).toBeNull();
    const next = [...closed, ev("shift_start", 33 * H), ev("pack_scan", 34 * H, "pack")];
    expect(currentProcess(next, "stf-ivan")).toEqual({ station: "pack", since: 34 * H });
    // Час до первого скана отдан упаковке, а не потерян.
    expect(processMs(next, "stf-ivan", 30 * H, 35 * H)).toEqual({ pack: 2 * H });
  });
});
