import { describe, expect, it } from "vitest";
import { buildInventoryAct, type InventoryLogEntry } from "../inventoryAct";
import type { Box, CellAddress, Dispute, Floor } from "../types";

const A: CellAddress = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const FREE: CellAddress = { ...A, cellIndex: 2 };
const floors = [{ id: "f1", name: "1", modules: [] }] as Floor[];
const box = (id: string, address?: CellAddress): Box =>
  ({ id, barcode: `UK-${id}`, createdAt: 0, lines: [], ...(address ? { address } : {}) }) as Box;
const boxes = [box("b1", A), box("b2", { ...A, cellIndex: 1 }), box("t1", FREE)];
const dispute = (over: Partial<Dispute>): Dispute => ({
  id: "x",
  kind: "inventory_short",
  qty: 1,
  raisedBy: "s1",
  raisedAt: 0,
  ...over,
});
const count = (over: Partial<InventoryLogEntry>): InventoryLogEntry => ({
  kind: "inv_count",
  at: 1000,
  staff: "s1",
  eventId: "e1",
  lines: [],
  ...over,
});

describe("buildInventoryAct", () => {
  it("учёт выводится из спорного: недостача, излишек и сошлось", () => {
    const rows = buildInventoryAct(
      [
        count({
          eventId: "e1",
          boxId: "b1",
          lines: [
            { productId: "mug", qty: 9 },
            { productId: "tea", qty: 4 },
            { productId: "jam", qty: 2 },
          ],
        }),
      ],
      [
        dispute({
          id: "inv-e1-mug",
          kind: "inventory_short",
          productId: "mug",
          qty: 1,
          resolution: "written_off",
          note: "бой",
        }),
        dispute({ id: "inv-e1-tea", kind: "inventory_over", productId: "tea", qty: 1 }),
      ],
      boxes,
      floors,
    );
    expect(rows.map((r) => [r.productId, r.book, r.fact, r.decision, r.note ?? null])).toEqual([
      ["jam", 2, 2, "matched", null],
      ["mug", 10, 9, "written_off", "бой"],
      ["tea", 3, 4, "pending", null],
    ]);
    expect(rows[0].place).toEqual(A);
  });

  it("товар, которого не нашли вовсе, — строка с фактом 0 из спорного", () => {
    const rows = buildInventoryAct(
      [count({ eventId: "e2", boxId: "b2", lines: [] })],
      [dispute({ id: "inv-e2-mug", productId: "mug", qty: 3, resolution: "returned" })],
      boxes,
      floors,
    );
    expect(rows.map((r) => [r.productId, r.book, r.fact, r.decision])).toEqual([
      ["mug", 3, 0, "closed"],
    ]);
  });

  it("пустая тара и пустая ячейка — по строке «пусто, сошлось»", () => {
    const rows = buildInventoryAct(
      [
        count({ eventId: "e3", boxId: "b2", lines: [] }),
        count({
          kind: "inv_cell",
          eventId: "e4",
          cell: { ...A, shelfIndex: 1 },
          lines: [],
          at: 2000,
        }),
      ],
      [],
      boxes,
      floors,
    );
    expect(rows.map((r) => [r.productId, r.book, r.fact, r.decision, r.boxId ?? null])).toEqual([
      [null, 0, 0, "matched", "b2"],
      [null, 0, 0, "matched", null],
    ]);
  });

  it("находка в пустой ячейке: учёт 0, всё — излишек с решением старшего", () => {
    const rows = buildInventoryAct(
      [
        count({
          kind: "inv_cell",
          eventId: "e5",
          cell: FREE,
          boxId: "t1",
          lines: [{ productId: "tea", qty: 2 }],
        }),
      ],
      [
        dispute({
          id: "inv-e5-tea",
          kind: "inventory_over",
          productId: "tea",
          qty: 2,
          resolution: "accepted",
        }),
      ],
      boxes,
      floors,
    );
    expect(rows.map((r) => [r.productId, r.book, r.fact, r.decision, r.place])).toEqual([
      ["tea", 0, 2, "adopted", FREE],
    ]);
  });

  it("пересчёты другого склада в акт не попадают; строки — по времени", () => {
    const rows = buildInventoryAct(
      [
        count({ eventId: "late", boxId: "b1", at: 3000, lines: [{ productId: "mug", qty: 1 }] }),
        count({ eventId: "other", boxId: "foreign", lines: [{ productId: "mug", qty: 1 }] }),
        count({ kind: "inv_cell", eventId: "other2", cell: { ...A, floorId: "f9" }, lines: [] }),
        count({ eventId: "early", boxId: "b1", at: 500, lines: [{ productId: "mug", qty: 1 }] }),
      ],
      [],
      boxes,
      floors,
    );
    expect(rows.map((r) => r.at)).toEqual([500, 3000]);
  });
});
