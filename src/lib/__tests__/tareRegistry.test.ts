import { describe, expect, it } from "vitest";
import type { Box, Pallet } from "@/lib/types";
import { buildTareRows, tareContents } from "@/lib/tareRegistry";

const addr = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const box = (id: string, n: number, patch: Partial<Box> = {}): Box => ({
  id,
  barcode: `UK-BOX-${n}`,
  createdAt: 1,
  lines: [],
  ...patch,
});
const pallet = (id: string, n: number, patch: Partial<Pallet> = {}): Pallet => ({
  id,
  barcode: `UK-PLT-${n}`,
  createdAt: 1,
  boxIds: [],
  ...patch,
});

describe("реестр тары", () => {
  it("номер, выданный без печати, остаётся в реестре «не напечатан»", () => {
    const [r] = buildTareRows([box("b1", 7)], []);
    expect(r).toMatchObject({ code: "UK-BOX-7", n: 7, state: "unprinted", units: 0 });
  });

  it("состояния коробки: пустая, с товаром, на паллете, не вскрыта", () => {
    const rows = buildTareRows(
      [
        box("b1", 1, { printedAt: 5, printCount: 2 }),
        box("b2", 2, { lines: [{ productId: "p1", qty: 3 }], address: addr }),
        box("b3", 3, { lines: [{ productId: "p1", qty: 1 }], palletId: "pl1" }),
        box("b4", 4, { sealed: true, address: addr }),
        // Пустая, но стоит на месте — не «не напечатана», а «пустая».
        box("b5", 5, { address: addr }),
      ],
      [],
    );
    expect(rows.map((r) => r.state)).toEqual(["empty", "filled", "onPallet", "sealed", "empty"]);
    expect(rows[0].printCount).toBe(2);
  });

  it("паллета считает коробки, позиции и штуки по всем коробкам", () => {
    const boxes = [
      box("b1", 1, {
        palletId: "pl",
        lines: [
          { productId: "p1", qty: 2 },
          { productId: "p2", qty: 1 },
        ],
      }),
      box("b2", 2, { palletId: "pl", lines: [{ productId: "p1", qty: 5 }] }),
    ];
    const pallets = [pallet("pl", 9, { boxIds: ["b1", "b2"], address: addr }), pallet("pl2", 10)];
    const rows = buildTareRows(boxes, pallets);
    const p = rows.find((r) => r.id === "pl")!;
    expect(p).toMatchObject({
      kind: "pallet",
      state: "filled",
      boxCount: 2,
      positions: 2,
      units: 8,
    });
    expect(rows.find((r) => r.id === "pl2")!.state).toBe("unprinted");
    expect(tareContents(p, boxes, pallets)).toEqual([
      { productId: "p1", qty: 7 },
      { productId: "p2", qty: 1 },
    ]);
  });

  it("продавец видит только тару со своим товаром и только свои строки", () => {
    const boxes = [
      box("b1", 1, {
        palletId: "pl",
        lines: [
          { productId: "mine", qty: 2 },
          { productId: "theirs", qty: 9 },
        ],
      }),
      box("b2", 2, { palletId: "pl", lines: [{ productId: "theirs", qty: 4 }] }),
      box("b3", 3),
    ];
    const pallets = [pallet("pl", 1, { boxIds: ["b1", "b2"] })];
    const visible = new Set(["mine"]);
    const rows = buildTareRows(boxes, pallets, visible);
    expect(rows.map((r) => r.id)).toEqual(["b1", "pl"]);
    expect(rows[0]).toMatchObject({ units: 2, positions: 1 });
    expect(rows[1]).toMatchObject({ units: 2, boxCount: 1 });
    expect(tareContents(rows[1], boxes, pallets, visible)).toEqual([{ productId: "mine", qty: 2 }]);
    expect(tareContents(rows[1], boxes, pallets)).toEqual([
      { productId: "mine", qty: 2 },
      { productId: "theirs", qty: 13 },
    ]);
  });
});
