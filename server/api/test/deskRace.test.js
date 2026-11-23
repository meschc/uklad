/**
 * Двое на одном: сервер принимает операции по одной (снимок под FOR UPDATE),
 * поэтому второй видит уже изменённые данные. Здесь — что остаётся в данных,
 * когда два стола пришли с одним и тем же, и что бывает при серии нажатий и
 * повторе после обрыва связи (тот же `eventId`).
 */
/* global require, structuredClone */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyPickUnit } = require("../src/cabinet/deskPick");
const { applyPackDone } = require("../src/cabinet/deskPack");
const { applyRecvUnit } = require("../src/cabinet/deskReceive");

const AT = 1_800_000_000_000;
const CELL = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const qtyOf = (lines, p) => lines.find((l) => l.productId === p)?.qty ?? 0;

const pickData = (shelf, ask) => ({
  products: [{ id: "p1", partnerId: "s1" }],
  boxes: [
    { id: "b1", barcode: "UK-BOX-1", address: CELL, lines: [{ productId: "p1", qty: shelf }] },
    { id: "t1", barcode: "UK-BOX-7", lines: [] },
  ],
  placements: {},
  requests: [{ id: "r1", productId: "p1", qty: ask, status: "new", note: "Тула" }],
  staffEvents: [],
});
const pick = (n, over = {}) => ({
  eventId: `ev-${n}`,
  at: AT + n,
  requestId: "r1",
  productId: "p1",
  toteId: "t1",
  cell: CELL,
  ...over,
});

test("двое снимают последнюю штуку: первый проходит, второй — stock, полка не уходит в минус", () => {
  const first = applyPickUnit(pickData(1, 5), pick(1), "stf-ivan");
  assert.equal(first.flag, undefined);
  const second = applyPickUnit(first.data, pick(2), "stf-olga");
  assert.equal(second.flag, "stock");
  assert.equal(second.data, undefined);
  assert.equal(qtyOf(first.data.boxes[0].lines, "p1"), 0);
  assert.equal(qtyOf(first.data.boxes[1].lines, "p1"), 1);
});

test("1000 нажатий подряд: собрано ровно заказанное, остальное — stock", () => {
  let d = pickData(100, 5);
  let applied = 0;
  let refused = 0;
  for (let i = 1; i <= 1000; i++) {
    const r = applyPickUnit(d, pick(i), i % 2 ? "stf-ivan" : "stf-olga");
    if (r.flag) {
      assert.equal(r.flag, "stock");
      refused++;
    } else {
      d = r.data;
      applied++;
    }
  }
  assert.deepEqual([applied, refused], [5, 995]);
  assert.equal(d.requests[0].pickedQty, 5);
  assert.equal(qtyOf(d.boxes[0].lines, "p1"), 95);
  assert.equal(qtyOf(d.boxes[1].lines, "p1"), 5);
});

test("обрыв связи: повтор операции с тем же eventId ничего не меняет", () => {
  const once = applyPickUnit(pickData(3, 3), pick(1), "stf-ivan").data;
  const again = applyPickUnit(structuredClone(once), pick(1), "stf-ivan");
  assert.deepEqual(again.data, once);
});

const packData = () => ({
  products: [{ id: "p1", partnerId: "s1" }],
  boxes: [{ id: "t1", barcode: "UK-BOX-1", lines: [{ productId: "p1", qty: 2 }] }],
  outboundBoxes: [],
  requests: [{ id: "r1", productId: "p1", qty: 2, status: "done", toteId: "t1", note: "Тула" }],
  disputes: [],
  staffEvents: [],
});
const done = (who, code) => ({
  eventId: `done-${who}`,
  staffId: who,
  at: AT,
  toteId: "t1",
  outboundCode: code,
  outboundId: `out-${who}`,
  lines: [{ productId: "p1", qty: 2 }],
  requestIds: ["r1"],
  shortages: [],
});

test("двое закрывают одну тару: второй — stock, в коробе товар один раз", () => {
  const first = applyPackDone(packData(), done("stf-ivan", "uk-out-1"), "stf-ivan");
  assert.equal(first.flag, undefined);
  const second = applyPackDone(first.data, done("stf-olga", "uk-out-2"), "stf-olga");
  assert.equal(second.flag, "stock");
  const total = first.data.outboundBoxes.reduce((n, b) => n + qtyOf(b.lines, "p1"), 0);
  assert.equal(total, 2);
});

test("обрыв связи: закрытие тары повторяется с тем же eventId — товар не уходит дважды", () => {
  const first = applyPackDone(packData(), done("stf-ivan", "uk-out-1"), "stf-ivan").data;
  const again = applyPackDone(first, done("stf-ivan", "uk-out-1"), "stf-ivan");
  assert.equal(again.flag, undefined);
  assert.deepEqual(again.data, first);
});

const recvData = () => ({
  warehouse: { floors: [{ id: "f1", modules: [{ id: "m1" }] }] },
  products: [{ id: "p1" }],
  boxes: [{ id: "b1", barcode: "UK-BOX-1", lines: [] }],
  pallets: [],
  expectedShipments: [
    {
      id: "s1",
      status: "pending",
      lines: [{ id: "l1", productId: "p1", expectedQty: 5, receivedQty: 0 }],
    },
  ],
  receivingEvents: [],
  requests: [],
});
const recv = (n) => ({
  eventId: `rv-${n}`,
  at: AT + n,
  productId: "p1",
  qty: 5,
  boxId: "b1",
  shipmentId: "s1",
  lineId: "l1",
});

test("двое считают одну коробку: оба счёта проходят — приёмка считает, а не знает штуку", () => {
  // Без кода по штуке сервер не отличит второй пересчёт той же коробки от
  // новой. Защита — излишек против заявленного: старший видит 10 при ожидаемых 5.
  const a = applyRecvUnit(recvData(), recv(1), "stf-ivan");
  const b = applyRecvUnit(a.data, recv(2), "stf-olga");
  assert.equal(b.flag, undefined);
  const line = b.data.expectedShipments[0].lines[0];
  assert.equal(line.receivedQty, 10);
  assert.ok(line.receivedQty > line.expectedQty);
  assert.equal(qtyOf(b.data.boxes[0].lines, "p1"), 10);
});

test("приёмка: повтор того же события после обрыва не считает второй раз", () => {
  const a = applyRecvUnit(recvData(), recv(1), "stf-ivan").data;
  const again = applyRecvUnit(a, recv(1), "stf-ivan");
  assert.equal(again.data, a);
});
