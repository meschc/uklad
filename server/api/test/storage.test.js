// Хранение как услуга (миграция 037): занятость склада по продавцам.
/* global require, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { storageTally, parsePeriod } = require("../src/cabinet/storage");

const at = (moduleId, shelfIndex, cellIndex = 0, floorId = "f1") => ({
  floorId,
  moduleId,
  shelfIndex,
  cellIndex,
});

/** Склад: секция «m1» — нижняя полка паллетная, верхняя обычная. */
function cabinet(extra = {}) {
  return {
    warehouse: {
      id: "wh1",
      floors: [
        {
          id: "f1",
          modules: [
            {
              id: "m1",
              shelves: [
                { id: "s0", cells: 2, palletPlace: true },
                { id: "s1", cells: 4 },
              ],
            },
          ],
        },
      ],
    },
    products: [
      { id: "p1", partnerId: "romashka" },
      { id: "p2", partnerId: "vasilek" },
      { id: "own" },
    ],
    boxes: [],
    ...extra,
  };
}

test("паллето-место — ячейка паллетной полки, сколько бы тары в ней ни стояло", () => {
  const data = cabinet({
    boxes: [
      { id: "b1", address: at("m1", 0, 0), lines: [{ productId: "p1", qty: 5 }] },
      { id: "b2", address: at("m1", 0, 0), lines: [{ productId: "p1", qty: 1 }] },
      { id: "b3", address: at("m1", 0, 1), lines: [{ productId: "p1", qty: 2 }] },
    ],
  });
  assert.deepEqual(storageTally(data), [
    { warehouse: "wh1", partner: "romashka", pallets: 2, boxes: 0 },
  ]);
});

test("на обычной полке каждая тара — короб; без адреса, пустая и невскрытая не считаются", () => {
  const data = cabinet({
    boxes: [
      { id: "b1", address: at("m1", 1, 0), lines: [{ productId: "p2", qty: 3 }] },
      { id: "b2", address: at("m1", 1, 0), lines: [{ productId: "p2", qty: 1 }] },
      { id: "b3", lines: [{ productId: "p2", qty: 9 }] },
      { id: "b4", address: at("m1", 1, 1), lines: [{ productId: "p2", qty: 0 }] },
      { id: "b5", address: at("m1", 1, 2), sealed: true, lines: [] },
    ],
  });
  assert.deepEqual(storageTally(data), [
    { warehouse: "wh1", partner: "vasilek", pallets: 0, boxes: 2 },
  ]);
});

test("тара двух продавцов занимает место у каждого; свой товар — без продавца", () => {
  const data = cabinet({
    boxes: [
      {
        id: "b1",
        address: at("m1", 1, 0),
        lines: [
          { productId: "p1", qty: 1 },
          { productId: "p2", qty: 1 },
          { productId: "own", qty: 1 },
        ],
      },
    ],
  });
  assert.deepEqual(
    storageTally(data).map((r) => [r.partner, r.boxes]),
    [
      ["", 1],
      ["romashka", 1],
      ["vasilek", 1],
    ],
  );
});

test("товар в ячейке без тары — один короб на ячейку, на паллетной полке — паллето-место", () => {
  const data = cabinet({ placements: { p1: at("m1", 1, 3), p2: at("m1", 0, 1) } });
  assert.deepEqual(storageTally(data), [
    { warehouse: "wh1", partner: "romashka", pallets: 0, boxes: 1 },
    { warehouse: "wh1", partner: "vasilek", pallets: 1, boxes: 0 },
  ]);
});

test("у неактивного склада своя тара и свой план", () => {
  const data = cabinet({
    otherWarehouses: [
      {
        id: "wh2",
        floors: [
          { id: "g1", modules: [{ id: "x", shelves: [{ id: "s", cells: 1, palletPlace: true }] }] },
        ],
      },
    ],
    warehouseData: {
      wh2: {
        boxes: [{ id: "b9", address: at("x", 0, 0, "g1"), lines: [{ productId: "p2", qty: 4 }] }],
      },
    },
  });
  assert.deepEqual(storageTally(data), [
    { warehouse: "wh2", partner: "vasilek", pallets: 1, boxes: 0 },
  ]);
});

test("этаж-алиас берёт полки источника", () => {
  const data = cabinet();
  data.warehouse.floors.push({ id: "f2", aliasOf: "f1", modules: [] });
  data.boxes = [{ id: "b1", address: at("m1", 0, 0, "f2"), lines: [{ productId: "p1", qty: 1 }] }];
  assert.equal(storageTally(data)[0].pallets, 1);
});

test("период отчёта: дни, склад и потолок длины", () => {
  const u = (q) => new URL(`https://x/api/cabinet/storage?${q}`);
  assert.deepEqual(parsePeriod(u("from=2026-11-01&to=2026-11-15&warehouse=wh1")), {
    from: "2026-11-01",
    to: "2026-11-15",
    warehouse: "wh1",
  });
  assert.equal(parsePeriod(u("from=2026-11-15&to=2026-11-01&warehouse=wh1")), null);
  assert.equal(parsePeriod(u("from=2024-01-01&to=2026-11-01&warehouse=wh1")), null);
  assert.equal(parsePeriod(u("from=2026-11-01&to=2026-11-15")), null);
  assert.equal(parsePeriod(u("from=1.11&to=2026-11-15&warehouse=wh1")), null);
});
