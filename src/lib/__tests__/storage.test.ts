import { describe, expect, it } from "vitest";
import { storageDay, storageEntries, storageTally, type StorageRow } from "../storage";
import { serviceReport } from "../operations";
import type { Box, CellAddress, Floor, Product } from "../types";

/**
 * Хранение как услуга: что считается паллето-местом и коробом и как из суток
 * сервера собирается строка счёта. Ошибка здесь — деньги продавцу мимо факта.
 */

const at = (shelfIndex: number, cellIndex = 0): CellAddress => ({
  floorId: "f1",
  moduleId: "m1",
  shelfIndex,
  cellIndex,
});
const floors = [
  {
    id: "f1",
    name: "1",
    modules: [
      {
        id: "m1",
        type: "section",
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        rotation: 0,
        shelves: [
          { id: "s0", cells: 2, palletPlace: true },
          { id: "s1", cells: 4 },
        ],
      },
    ],
  },
] as Floor[];
const products = [
  { id: "p1", partnerId: "romashka" },
  { id: "p2", partnerId: "vasilek" },
] as Product[];
const box = (id: string, address: CellAddress | undefined, productId: string, qty = 1) =>
  ({ id, barcode: id, createdAt: 0, address, lines: [{ productId, qty }] }) as Box;

describe("storageTally", () => {
  it("паллетная ячейка — одно место на продавца, тара на обычной полке — короб каждая", () => {
    const boxes = [
      box("b1", at(0, 0), "p1"),
      box("b2", at(0, 0), "p1"),
      box("b3", at(1, 0), "p1"),
      box("b4", at(1, 0), "p2"),
      box("b5", undefined, "p2"),
      box("b6", at(1, 1), "p2", 0),
    ];
    expect(storageTally({ floors, boxes, products, placements: {} })).toEqual([
      { partner: "romashka", pallets: 1, boxes: 1 },
      { partner: "vasilek", pallets: 0, boxes: 1 },
    ]);
  });

  it("товар без тары в ячейке — один короб на ячейку", () => {
    expect(storageTally({ floors, boxes: [], products, placements: { p1: at(1, 2) } })).toEqual([
      { partner: "romashka", pallets: 0, boxes: 1 },
    ]);
  });
});

describe("storageEntries", () => {
  const row = (day: string, partner: string, pallets: number, boxes = 0): StorageRow => ({
    day,
    partner,
    pallets,
    boxes,
  });
  const ms = (day: string) => Date.parse(`${day}T12:00:00+03:00`);

  it("сутки без записей берут последнюю строку до них, ноль обрывает хранение", () => {
    const rows = [row("2026-11-01", "romashka", 2), row("2026-11-04", "romashka", 0)];
    const e = storageEntries(rows, ms("2026-11-01"), ms("2026-11-10"), "2026-11-10");
    expect(e.map((x) => [x.id, x.qty])).toEqual([
      ["stor:p:2026-11-01:romashka", 2],
      ["stor:p:2026-11-02:romashka", 2],
      ["stor:p:2026-11-03:romashka", 2],
    ]);
  });

  it("строка до периода — опора для первых суток; будущих суток нет", () => {
    const rows = [row("2026-10-20", "vasilek", 1, 3)];
    const e = storageEntries(rows, ms("2026-11-01"), ms("2026-11-30"), "2026-11-02");
    expect(e.map((x) => [x.kind, storageDay(x.at), x.qty, x.partnerId])).toEqual([
      ["storage_pallet", "2026-11-01", 1, "vasilek"],
      ["storage_box", "2026-11-01", 3, "vasilek"],
      ["storage_pallet", "2026-11-02", 1, "vasilek"],
      ["storage_box", "2026-11-02", 3, "vasilek"],
    ]);
  });

  it("в отчёте — паллето-сутки по ставке, без цены — «—», а не ноль", () => {
    const rows = [row("2026-11-01", "romashka", 2, 5)];
    const log = storageEntries(rows, ms("2026-11-01"), ms("2026-11-03"), "2026-11-03");
    const settings = { enabled: {}, prices: { storage_pallet: 40 } };
    const r = serviceReport(log, settings, { from: 0, to: Infinity, partnerId: "romashka" });
    expect(r.rows.map((x) => [x.kind, x.qty, x.sum])).toEqual([
      ["storage_pallet", 6, 240],
      ["storage_box", 15, null],
    ]);
    expect(r.unpriced).toBe(true);
  });
});
