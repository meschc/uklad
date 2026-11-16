import { describe, expect, it } from "vitest";
import {
  COUNT_STALE_DAYS,
  countCoverage,
  countDiffs,
  frozenBoxes,
  normalizeCount,
  planCellCount,
  type CellPlace,
  planCount,
  staleBoxes,
} from "../inventory";
import type { Box, CellAddress, Dispute, Pallet } from "../types";

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

describe("frozenBoxes", () => {
  it("замораживает только тару с открытым расхождением инвентаризации", () => {
    const base = { qty: 1, raisedBy: "s1", raisedAt: 1, productId: "p1" };
    const ds: Dispute[] = [
      { ...base, id: "1", kind: "inventory_over", boxId: "b1" },
      {
        ...base,
        id: "2",
        kind: "inventory_short",
        boxId: "b2",
        resolution: "returned",
        resolvedBy: "s2",
        resolvedAt: 2,
      },
      { ...base, id: "3", kind: "shortage", boxId: "b3" },
    ];
    expect([...frozenBoxes(ds)]).toEqual(["b1"]);
  });
});

describe("planCellCount — ячейка без тары на учёте", () => {
  const FREE: CellAddress = { ...ADDR, cellIndex: 1 };
  const tote = box({ id: "t1", barcode: "UK-BOX-9", address: undefined, lines: [] });
  const at = (boxes: Box[], extra: Partial<CellPlace> = {}): CellPlace => ({
    boxes,
    pallets: [],
    placements: {},
    ...extra,
  });
  const cellInput = (lines: { productId: string; qty: number }[], boxId?: string) => ({
    cell: FREE,
    boxId,
    lines,
    staffId: "s1",
    at: NOW,
    eventId: "c1",
  });

  it("пусто — ничего не меняет; в ячейке тара на учёте — считают её", () => {
    expect(planCellCount(at([box(), tote]), known, cellInput([]))).toEqual({
      box: null,
      disputes: [],
    });
    expect(planCellCount(at([box()]), known, { ...cellInput([]), cell: ADDR })).toEqual({
      problem: "busy",
    });
  });

  it("найденное — в свободную тару: она встаёт в ячейку, излишек на неё", () => {
    const r = planCellCount(
      at([box(), tote]),
      known,
      cellInput([{ productId: "p2", qty: 2 }], "t1"),
    );
    if ("problem" in r) throw new Error(r.problem);
    expect(r.box?.address).toEqual(FREE);
    expect(r.box?.lines).toEqual([]);
    expect(r.disputes.map((d) => [d.kind, d.boxId, d.productId, d.qty])).toEqual([
      ["inventory_over", "t1", "p2", 2],
    ]);
  });

  it("без тары, в занятую тару и неизвестный товар — отказ", () => {
    const found = [{ productId: "p1", qty: 1 }];
    expect(planCellCount(at([tote]), known, cellInput(found))).toEqual({ problem: "no_tote" });
    const full = box({ id: "t2", address: undefined });
    expect(planCellCount(at([full]), known, cellInput(found, "t2"))).toEqual({
      problem: "tote_busy",
    });
    expect(planCellCount(at([tote]), known, cellInput([{ productId: "x", qty: 1 }], "t1"))).toEqual(
      {
        problem: "unknown_product",
      },
    );
  });

  it("паллета или товар прямо в ячейке — не пустая; короб с паллеты — не свободный", () => {
    const found = [{ productId: "p1", qty: 1 }];
    const pallet: Pallet = { id: "pl1", barcode: "UK-PLT-1", createdAt: 0, boxIds: [] };
    expect(
      planCellCount(at([tote], { pallets: [{ ...pallet, address: FREE }] }), known, cellInput([])),
    ).toEqual({
      problem: "busy",
    });
    expect(
      planCellCount(at([tote], { placements: { p1: FREE } }), known, cellInput(found, "t1")),
    ).toEqual({
      problem: "busy",
    });
    const onPallet = { ...tote, palletId: "pl1" };
    expect(planCellCount(at([onPallet]), known, cellInput(found, "t1"))).toEqual({
      problem: "tote_busy",
    });
    const listed = at([tote], { pallets: [{ ...pallet, address: ADDR, boxIds: ["t1"] }] });
    expect(planCellCount(listed, known, cellInput(found, "t1"))).toEqual({ problem: "tote_busy" });
  });
});
