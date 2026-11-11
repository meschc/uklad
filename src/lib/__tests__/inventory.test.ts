import { describe, expect, it } from "vitest";
import {
  COUNT_STALE_DAYS,
  countCoverage,
  countDiffs,
  normalizeCount,
  planCount,
  staleBoxes,
} from "../inventory";
import type { Box, CellAddress, Dispute } from "../types";

const ADDR: CellAddress = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const DAY = 24 * 3600 * 1000;
const NOW = 100 * DAY;
const box = (over: Partial<Box> = {}): Box => ({
  id: "b1",
  barcode: "UK-BOX-1",
  createdAt: 1,
  address: ADDR,
  lines: [{ productId: "p1", qty: 10 }],
  ...over,
});
const known = new Set(["p1", "p2"]);
const input = (lines: { productId: string; qty: number }[], eventId = "e1") => ({
  boxId: "b1",
  lines,
  staffId: "s1",
  at: NOW,
  eventId,
});

describe("normalizeCount", () => {
  it("склеивает один товар и отвергает кривые числа", () => {
    expect(
      normalizeCount([
        { productId: "p1", qty: 2 },
        { productId: "p1", qty: 3 },
      ]),
    ).toEqual([{ productId: "p1", qty: 5 }]);
    for (const qty of [-1, 1.5, 100_001, Number.NaN]) {
      expect(normalizeCount([{ productId: "p1", qty }])).toBeNull();
    }
    // Две строки по сто тысяч — тоже слишком много: склейка не обходит предел.
    expect(
      normalizeCount([
        { productId: "p1", qty: 100_000 },
        { productId: "p1", qty: 1 },
      ]),
    ).toBeNull();
  });
});

describe("countDiffs", () => {
  it("видит недостачу, излишек и товар, которого в таре не было", () => {
    expect(
      countDiffs(box(), [
        { productId: "p1", qty: 7 },
        { productId: "p2", qty: 1 },
      ]),
    ).toEqual([
      { productId: "p1", expected: 10, counted: 7 },
      { productId: "p2", expected: 0, counted: 1 },
    ]);
  });
  it("пустой пересчёт — всё в таре недостача; сошлось — расхождений нет", () => {
    expect(countDiffs(box(), [])).toEqual([{ productId: "p1", expected: 10, counted: 0 }]);
    expect(countDiffs(box(), [{ productId: "p1", qty: 10 }])).toEqual([]);
  });
});

describe("planCount", () => {
  it("сошлось: отметка на таре, спорного нет", () => {
    const plan = planCount([box()], [], known, input([{ productId: "p1", qty: 10 }]));
    if ("problem" in plan) throw new Error(plan.problem);
    expect(plan.disputes).toEqual([]);
    expect(plan.box).toMatchObject({ countedAt: NOW, countedBy: "s1" });
  });

  it("не сошлось: спорное нужного вида, id не повторяется между пересчётами", () => {
    const a = planCount([box()], [], known, input([{ productId: "p1", qty: 4 }], "e1"));
    const b = planCount([box()], [], known, input([{ productId: "p1", qty: 14 }], "e2"));
    if ("problem" in a || "problem" in b) throw new Error("ожидали план");
    expect(a.disputes[0]).toMatchObject({ kind: "inventory_short", qty: 6, raisedBy: "s1" });
    expect(b.disputes[0]).toMatchObject({ kind: "inventory_over", qty: 4 });
    expect(a.disputes[0].id).not.toBe(b.disputes[0].id);
  });

  it("отказы: нет тары, не на полке, невскрытое место, чужой товар, плохие числа", () => {
    const ok = [{ productId: "p1", qty: 1 }];
    expect(planCount([], [], known, input(ok))).toEqual({ problem: "no_box" });
    expect(planCount([box({ address: undefined })], [], known, input(ok))).toEqual({
      problem: "not_stored",
    });
    expect(planCount([box({ sealed: true })], [], known, input(ok))).toEqual({
      problem: "not_stored",
    });
    expect(planCount([box()], [], known, input([{ productId: "zz", qty: 1 }]))).toEqual({
      problem: "unknown_product",
    });
    expect(planCount([box()], [], known, input([{ productId: "p1", qty: -2 }]))).toEqual({
      problem: "bad",
    });
  });

  it("пока старший не решил прошлое расхождение по таре, новый пересчёт не принимается", () => {
    const open: Dispute = {
      id: "d1",
      kind: "inventory_short",
      boxId: "b1",
      productId: "p1",
      qty: 2,
      raisedBy: "s1",
      raisedAt: 1,
    };
    expect(planCount([box()], [open], known, input([]))).toEqual({ problem: "open" });
    // Решённое и чужая тара не мешают.
    const solved = planCount([box()], [{ ...open, resolution: "returned" }], known, input([]));
    expect(solved).not.toHaveProperty("problem");
    const other = planCount([box()], [{ ...open, boxId: "b9" }], known, input([]));
    expect(other).not.toHaveProperty("problem");
  });
});

describe("давно не считали", () => {
  const boxes = [
    box({ id: "fresh", countedAt: NOW - DAY }),
    box({ id: "old", countedAt: NOW - (COUNT_STALE_DAYS + 5) * DAY }),
    box({ id: "never" }),
    box({ id: "floor", address: undefined }),
    box({ id: "sealed", sealed: true }),
  ];
  it("сначала те, что не считали ни разу, потом самые давние", () => {
    expect(staleBoxes(boxes, NOW).map((b) => b.id)).toEqual(["never", "old"]);
  });
  it("охват считает только тару на полках", () => {
    expect(countCoverage(boxes, NOW)).toEqual({ counted: 1, total: 3 });
  });
});
