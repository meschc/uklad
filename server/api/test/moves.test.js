/**
 * Журнал движений по снимку: сервер сам выводит, что где прибыло и убыло.
 * Ошибка здесь молчит дважды: лишнее движение выглядит как настоящая работа,
 * а пропущенное оставляет штуку без следа. Поэтому проверяем и обычную работу,
 * и то, что движениями быть не должно (переключение склада, перестановка).
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { diffMoves } = require("../src/cabinet/moves");

const box = (id, lines) => ({ id, barcode: id, lines });
const cell = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 2 };

test("упаковка: из тары убыло, в короб отгрузки прибыло", () => {
  const before = {
    warehouse: { id: "wh1" },
    boxes: [box("t1", [{ productId: "p1", qty: 3 }])],
    outboundBoxes: [],
  };
  const after = {
    warehouse: { id: "wh1" },
    boxes: [box("t1", [{ productId: "p1", qty: 1 }])],
    outboundBoxes: [{ id: "o1", code: "UK-OUT-1", lines: [{ productId: "p1", qty: 2 }] }],
  };
  assert.deepEqual(diffMoves(before, after), [
    { warehouse: "wh1", kind: "box", ref: "t1", product: "p1", delta: -2 },
    { warehouse: "wh1", kind: "outbound", ref: "o1", product: "p1", delta: 2 },
  ]);
});

test("переключение склада — не движение: работа меняется местами целиком", () => {
  const a = [box("ta", [{ productId: "p1", qty: 4 }])];
  const b = [box("tb", [{ productId: "p2", qty: 1 }])];
  const before = { warehouse: { id: "wh1" }, boxes: a, warehouseData: { wh2: { boxes: b } } };
  const after = { warehouse: { id: "wh2" }, boxes: b, warehouseData: { wh1: { boxes: a } } };
  assert.deepEqual(diffMoves(before, after), []);
});

test("перестановка строк и тара без изменений — не движение", () => {
  const lines = [
    { productId: "p1", qty: 1 },
    { productId: "p2", qty: 2 },
  ];
  const before = { boxes: [box("t1", lines), box("t2", [])] };
  const after = { boxes: [box("t2", []), box("t1", [...lines].reverse())] };
  assert.deepEqual(diffMoves(before, after), []);
});

test("ячейка: сняли с одной, положили в другую; удалённая тара — всё убыло", () => {
  const before = {
    placements: { p1: cell },
    boxes: [box("t1", [{ productId: "p2", qty: 5 }])],
  };
  const after = { placements: { p1: { ...cell, cellIndex: 3 } }, boxes: [] };
  assert.deepEqual(diffMoves(before, after), [
    { warehouse: null, kind: "box", ref: "t1", product: "p2", delta: -5 },
    { warehouse: null, kind: "cell", ref: "f1/m1/0/2", product: "p1", delta: -1 },
    { warehouse: null, kind: "cell", ref: "f1/m1/0/3", product: "p1", delta: 1 },
  ]);
});

test("первая запись — всё прибыло; мусор в строках не ломает разбор", () => {
  const after = {
    boxes: [
      box("t1", [{ productId: "p1", qty: 2 }, { productId: "", qty: 9 }, { qty: 1 }]),
      { lines: [{ productId: "p1", qty: 1 }] },
      "не короб",
    ],
  };
  assert.deepEqual(diffMoves({}, after), [
    { warehouse: null, kind: "box", ref: "t1", product: "p1", delta: 2 },
  ]);
  assert.deepEqual(diffMoves(null, null), []);
});
