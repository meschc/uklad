/**
 * Сборка операциями: сервер сам снимает штуку с места и кладёт в тару.
 * Ошибка здесь — штука, снятая с полки дважды (снимком и операцией), или
 * тара, в которой смешались два продавца: и то и другое всплывает только
 * на упаковке или на претензии.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyPickUnit, applyPickDone } = require("../src/cabinet/deskPick");

const AT = 1_800_000_000_000;
const CELL = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const data = () => ({
  products: [
    { id: "p1", partnerId: "s1" },
    { id: "p9", partnerId: "s2" },
  ],
  boxes: [
    { id: "b1", barcode: "UK-BOX-1", address: CELL, lines: [{ productId: "p1", qty: 2 }] },
    { id: "t1", barcode: "UK-BOX-7", lines: [] },
    { id: "t9", barcode: "UK-BOX-9", lines: [{ productId: "p9", qty: 1 }] },
  ],
  placements: {},
  requests: [{ id: "r1", productId: "p1", qty: 2, status: "new", note: "Тула" }],
  staffEvents: [],
});
const unit = (over = {}) => ({
  eventId: "ev-1",
  at: AT,
  requestId: "r1",
  productId: "p1",
  toteId: "t1",
  cell: CELL,
  ...over,
});

test("штука с полки в тару: полка −1, тара +1, заявка в работе, запись в журнале", () => {
  const r = applyPickUnit(data(), unit(), "stf-ivan");
  assert.equal(r.flag, undefined);
  assert.deepEqual(r.data.boxes[0].lines, [{ productId: "p1", qty: 1 }]);
  assert.deepEqual(r.data.boxes[1].lines, [{ productId: "p1", qty: 1 }]);
  const req = r.data.requests[0];
  assert.deepEqual(
    [req.pickedQty, req.toteId, req.status, req.startedAt],
    [1, "t1", "in_progress", AT],
  );
  assert.deepEqual(r.data.staffEvents, [
    {
      id: "ev-1",
      staffId: "stf-ivan",
      type: "pick_scan",
      at: AT,
      station: "picking",
      productId: "p1",
      code: "UK-BOX-7",
    },
  ]);
});

test("повтор той же штуки, уже пришедшей снимком, ничего не меняет", () => {
  const once = applyPickUnit(data(), unit(), "stf-ivan").data;
  assert.equal(applyPickUnit(once, unit(), "stf-ivan").data, once);
});

test("сверх заявки, с пустого места и в другую тару — нельзя", () => {
  let d = applyPickUnit(data(), unit(), "stf-ivan").data;
  d = applyPickUnit(d, unit({ eventId: "ev-2" }), "stf-ivan").data;
  assert.equal(applyPickUnit(d, unit({ eventId: "ev-3" }), "stf-ivan").flag, "stock");
  const empty = data();
  empty.boxes[0].lines = [];
  assert.equal(applyPickUnit(empty, unit(), "stf-ivan").flag, "stock");
  const started = applyPickUnit(data(), unit(), "stf-ivan").data;
  started.boxes.push({ id: "t2", barcode: "UK-BOX-8", lines: [] });
  assert.equal(
    applyPickUnit(started, unit({ eventId: "ev-2", toteId: "t2" }), "stf-ivan").flag,
    "tote",
  );
});

test("тара с чужим продавцом, другим назначением или на полке — нельзя", () => {
  const seller = data();
  seller.requests.push({
    id: "r9",
    productId: "p9",
    qty: 1,
    pickedQty: 1,
    status: "in_progress",
    toteId: "t9",
    note: "Тула",
  });
  assert.equal(applyPickUnit(seller, unit({ toteId: "t9" }), "stf-ivan").flag, "mixed");
  const d = data();
  d.requests.push({
    id: "r2",
    productId: "p1",
    qty: 1,
    status: "in_progress",
    toteId: "t1",
    note: "Казань",
  });
  assert.equal(applyPickUnit(d, unit(), "stf-ivan").flag, "mixed");
  assert.equal(applyPickUnit(data(), unit({ toteId: "b1" }), "stf-ivan").flag, "tote");
});

test("короб с принятым товаром без заявок — не тара сборки", () => {
  // Свой продавец, своё назначение, но лежит не собранное, а принятое:
  // в заказ оно уйти не должно, даже того же товара.
  const d = data();
  d.boxes[1].lines = [{ productId: "p1", qty: 3 }];
  assert.equal(applyPickUnit(d, unit(), "stf-ivan").flag, "tote");
  // Та же тара, когда в неё уже собирают открытую заявку, — можно.
  d.requests.push({
    id: "r0",
    productId: "p1",
    qty: 3,
    pickedQty: 3,
    status: "done",
    toteId: "t1",
    note: "Тула",
  });
  assert.equal(applyPickUnit(d, unit(), "stf-ivan").flag, undefined);
});

test("прямое размещение снимается, если в ячейке нет короба", () => {
  const d = data();
  d.boxes[0].lines = [];
  d.placements = { p1: CELL };
  const r = applyPickUnit(d, unit(), "stf-ivan");
  assert.deepEqual(r.data.placements, {});
  assert.deepEqual(r.data.boxes[1].lines, [{ productId: "p1", qty: 1 }]);
});

test("собрана: целиком — только всё, частично — хоть одну", () => {
  const d = data();
  assert.equal(applyPickDone(d, { requestId: "r1", at: AT }).flag, "stock");
  assert.equal(applyPickDone(d, { requestId: "r1", at: AT, partial: true }).flag, "stock");
  const one = applyPickUnit(d, unit(), "stf-ivan").data;
  const part = applyPickDone(one, { requestId: "r1", at: AT, partial: true }).data;
  assert.deepEqual([part.requests[0].status, part.requests[0].partial], ["done", true]);
  // Повтор того же — то же самое.
  assert.equal(applyPickDone(part, { requestId: "r1", at: AT, partial: true }).data, part);
});
