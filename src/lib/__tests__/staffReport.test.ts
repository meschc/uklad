import { describe, expect, it } from "vitest";
import { staffReport, staffReportCsv } from "../staffReport";
import type { StaffEvent, StaffMember } from "../types";

const H = 3_600_000;
const ev = (
  staffId: string,
  type: StaffEvent["type"],
  at: number,
  extra: Partial<StaffEvent> = {},
) => ({ id: `${staffId}-${type}-${at}`, staffId, type, at, ...extra }) as StaffEvent;

const anna = { id: "a", name: "Анна", role: "Упаковщик", hourlyRate: 300 } as StaffMember;
const boris = { id: "b", name: "Борис; ст.", role: "Сборщик" } as StaffMember;

const events: StaffEvent[] = [
  ev("a", "shift_start", 0),
  ev("a", "pack_label", 1 * H, { productId: "p1" }),
  ev("a", "pack_label", 1 * H + 1, { productId: "p1" }),
  // Этикетка без товара (короб) — не пик.
  ev("a", "pack_label", 1 * H + 2),
  ev("a", "pack_error", 1 * H + 3),
  ev("a", "pack_reject", 1 * H + 4),
  ev("a", "idle_start", 2 * H),
  ev("a", "idle_end", 3 * H),
  ev("a", "shift_end", 5 * H),
  ev("b", "shift_start", 0),
  ev("b", "pick_scan", 1 * H),
  ev("b", "shift_end", 2 * H),
  // Вне периода — не считается.
  ev("b", "pick_scan", 30 * H),
];

describe("staffReport", () => {
  it("часы, простой, пики, ошибки и брак за период", () => {
    const [a, b] = staffReport(events, [anna, boris], 0, 24 * H);
    expect(a).toMatchObject({ packed: 2, picked: 0, errors: 1, rejects: 1, rate: 300 });
    expect(a.workedMs).toBe(4 * H);
    expect(a.idleMs).toBe(1 * H);
    expect(a.earned).toBe(1200);
    expect(b).toMatchObject({ picked: 1, packed: 0, rate: null, earned: null });
    expect(b.workedMs).toBe(2 * H);
  });

  it("CSV: без ставки пустая ячейка, а не ноль; ; в имени экранируется", () => {
    const csv = staffReportCsv(staffReport(events, [anna, boris], 0, 24 * H)).split("\n");
    expect(csv[0].split(";")[0]).toBe("Сотрудник");
    expect(csv[1]).toBe('Анна;Упаковщик;"4,00";"1,00";2;0;2;1;1;300;1200');
    expect(csv[2]).toBe('"Борис; ст.";Сборщик;"2,00";"0,00";0;1;1;0;0;;');
  });
});
