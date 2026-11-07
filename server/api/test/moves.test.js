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

const { invalidWork } = require("../src/cabinet/moves");
const { mergeDeskWrite } = require("../src/cabinet/desks");

test("тару перенесли из ячейки в ячейку — движение места, внутри без изменений", () => {
  const t = (cellIndex) => ({
    boxes: [{ ...box("t1", [{ productId: "p1", qty: 2 }]), address: { ...cell, cellIndex } }],
  });
  assert.deepEqual(diffMoves(t(2), t(3)), [
    { warehouse: null, kind: "box_at", ref: "f1/m1/0/2#t1", product: "p1", delta: -2 },
    { warehouse: null, kind: "box_at", ref: "f1/m1/0/3#t1", product: "p1", delta: 2 },
  ]);
});

test("работу, которую журнал не запишет честно, сервер отклоняет, а не пропускает", () => {
  const withLine = (l) => ({ boxes: [box("t1", [l])] });
  assert.equal(invalidWork(withLine({ productId: "p1", qty: 2 })), false);
  assert.equal(invalidWork({ boxes: [{ id: "b1" }] }), false);
  // Количество не целым числом: сверка и журнал прочли бы его по-разному.
  assert.equal(invalidWork(withLine({ productId: "p1", qty: "3" })), true);
  assert.equal(invalidWork(withLine({ productId: "p1", qty: 1.5 })), true);
  assert.equal(invalidWork(withLine({ qty: 1 })), true);
  // Слишком длинный id места — движение без следа.
  assert.equal(invalidWork({ boxes: [box("x".repeat(301), [])] }), true);
  assert.equal(invalidWork({ warehouseData: { wh2: { outboundBoxes: [{ id: 7 }] } } }), true);
  assert.equal(invalidWork({ placements: { p1: { ...cell, moduleId: "m".repeat(400) } } }), true);
});

test("за столом никого — товар со стола не двигается", () => {
  const current = {
    warehouse: { id: "wh1", staff: [] },
    products: [{ id: "p1", sku: "A", name: "Кружка" }],
    boxes: [box("t1", [{ productId: "p1", qty: 3 }])],
    outboundBoxes: [],
  };
  const incoming = {
    ...current,
    boxes: [box("t1", [{ productId: "p1", qty: 1 }])],
    outboundBoxes: [{ id: "o1", code: "UK-OUT-1", lines: [{ productId: "p1", qty: 2 }] }],
  };
  const nobody = mergeDeskWrite(current, incoming, {});
  assert.deepEqual(nobody.mismatch, ["p1"]);
  assert.deepEqual(nobody.data.boxes, current.boxes);
  const someone = mergeDeskWrite(current, incoming, { staff: "stf-ivan" });
  assert.deepEqual(someone.mismatch, []);
});
