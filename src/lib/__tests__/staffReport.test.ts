import { describe, expect, it } from "vitest";
import { staffReport, staffReportCsv } from "../staffReport";
import type { StaffEvent, StaffMember } from "../types";

const H = 3_600_000;
// Будний день, 09:00 по местному времени: ни ночи, ни праздника в окне.
const T0 = new Date(2026, 2, 10, 9, 0).getTime();
const ev = (
  staffId: string,
  type: StaffEvent["type"],
  at: number,
  extra: Partial<StaffEvent> = {},
) => ({ id: `${staffId}-${type}-${at}`, staffId, type, at: T0 + at, ...extra }) as StaffEvent;

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
  ev("a", "pack_reprint", 1 * H + 5, { code: "UK-L-1" }),
  ev("a", "idle_start", 2 * H),
  ev("a", "idle_end", 3 * H),
  ev("a", "shift_end", 5 * H),
  ev("b", "shift_start", 0),
  ev("b", "pick_scan", 1 * H, { station: "picking" }),
  ev("b", "shift_end", 2 * H),
  // Вне периода — не считается.
  ev("b", "pick_scan", 30 * H),
];

describe("staffReport", () => {
  it("часы, простой, пики, ошибки и брак за период", () => {
    const [a, b] = staffReport(events, [anna, boris], T0, T0 + 24 * H);
    expect(a).toMatchObject({
      packed: 2,
      picked: 0,
      errors: 1,
      rejects: 1,
      reprints: 1,
      rate: 300,
    });
    expect(a.workedMs).toBe(4 * H);
    expect(a.idleMs).toBe(1 * H);
    expect(a.earned).toBe(1200);
    expect(b).toMatchObject({ picked: 1, packed: 0, rate: null, earned: null });
    expect(b.workedMs).toBe(2 * H);
  });

  it("CSV: без ставки пустая ячейка, а не ноль; ; в имени экранируется", () => {
    const csv = staffReportCsv(staffReport(events, [anna, boris], T0, T0 + 24 * H)).split("\n");
    expect(csv[0].split(";")[0]).toBe("Сотрудник");
    expect(csv[1]).toBe(
      'Анна;Упаковщик;"4,00";"4,00";"1,00";2;0;2;1;1;1;300;1200;"0,00";0;"0,00";0;0;0;0;1200;',
    );
    expect(csv[2]).toBe(
      '"Борис; ст.";Сборщик;"2,00";"2,00";"0,00";0;1;1;0;0;0;;;"0,00";;"0,00";;0;0;0;;"Сборка 2,00"',
    );
  });

  it("12 часов смены — по ставке за 11, час обеда не оплачивается", () => {
    const day = [ev("a", "shift_start", 0), ev("a", "shift_end", 12 * H)];
    const [a] = staffReport(day, [anna], T0, T0 + 24 * H, { unpaidMin: 60 });
    expect(a.workedMs).toBe(12 * H);
    expect(a.paidMs).toBe(11 * H);
    expect(a.earned).toBe(3300);
  });
});

describe("к выплате", () => {
  it("по ставке + ночные + премии − удержания", () => {
    // Ночная смена: 20:00–08:00, ночных часов 8 (22–06).
    const night = new Date(2026, 2, 10, 20, 0).getTime();
    const day = [
      { id: "s", staffId: "a", type: "shift_start", at: night },
      { id: "e", staffId: "a", type: "shift_end", at: night + 12 * H },
    ] as StaffEvent[];
    const adj = [
      {
        id: "1",
        staffId: "a",
        kind: "bonus",
        amount: 500,
        reason: "план",
        at: night,
        createdAt: 0,
      },
      {
        id: "2",
        staffId: "a",
        kind: "deduction",
        amount: 200,
        reason: "брак",
        at: night,
        createdAt: 0,
      },
      // Чужая и вне периода — не в счёт.
      { id: "3", staffId: "b", kind: "bonus", amount: 999, reason: "", at: night, createdAt: 0 },
      {
        id: "4",
        staffId: "a",
        kind: "bonus",
        amount: 999,
        reason: "",
        at: night - 48 * H,
        createdAt: 0,
      },
    ] as const;
    const [a] = staffReport(
      day,
      [anna],
      night - 1,
      night + 24 * H,
      { unpaidMin: 60, nightPct: 20 },
      [...adj],
    );
    expect(a.nightMs).toBe(8 * H);
    expect(a.earned).toBe(3300);
    expect(a.nightPay).toBe(480); // 8 ч × 300 × 20%
    expect(a.bonus).toBe(500);
    expect(a.deduction).toBe(200);
    expect(a.toPay).toBe(3300 + 480 + 500 - 200);
  });

  it("без ставки «к выплате» нет, а не ноль", () => {
    const [b] = staffReport(events, [boris], T0, T0 + 24 * H);
    expect(b.toPay).toBeNull();
    expect(b.nightPay).toBeNull();
  });
});
