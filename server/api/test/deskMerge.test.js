/**
 * Заказ в двух тарах: вторая тара пересыпается в ту, что на столе, только
 * если в ней одни части заказов этой тары. Ошибка здесь — чужой заказ в
 * посылке или заказ, уехавший двумя посылками на одну этикетку.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyToteMerge, orderSplit } = require("../src/cabinet/deskMerge");
const { applyPackDone } = require("../src/cabinet/deskPack");

const AT = 1_800_000_000_000;
const data = () => ({
  products: [
    { id: "p1", partnerId: "s1" },
    { id: "p2", partnerId: "s1" },
  ],
  boxes: [
    { id: "t1", barcode: "UK-BOX-1", lines: [{ productId: "p1", qty: 1 }] },
    { id: "t2", barcode: "UK-BOX-2", lines: [{ productId: "p2", qty: 2 }] },
    { id: "b1", barcode: "UK-BOX-7", address: { moduleId: "m1" }, lines: [] },
  ],
  outboundBoxes: [],
  requests: [
    {
      id: "r1",
      productId: "p1",
      qty: 1,
      status: "done",
      toteId: "t1",
      externalId: "OZ-1",
      source: "ozon",
    },
    {
      id: "r2",
      productId: "p2",
      qty: 2,
      status: "done",
      toteId: "t2",
      externalId: "OZ-1",
      source: "ozon",
    },
  ],
  disputes: [],
  staffEvents: [],
});
const merge = (over = {}) => ({
  eventId: "ev-m",
  staffId: "stf-ivan",
  at: AT,
  toteId: "t1",
  fromToteId: "t2",
  ...over,
});

test("вторая тара заказа пересыпается в тару на столе", () => {
  const r = applyToteMerge(data(), merge(), "stf-ivan");
  const box = Object.fromEntries(r.data.boxes.map((b) => [b.id, b.lines]));
  assert.deepEqual(box.t1, [
    { productId: "p1", qty: 1 },
    { productId: "p2", qty: 2 },
  ]);
  assert.deepEqual(box.t2, []);
  assert.deepEqual(
    r.data.requests.map((x) => x.toteId),
    ["t1", "t1"],
  );
  assert.equal(r.data.staffEvents[0].type, "pack_merge");
  // Повтор той же операции ничего не меняет.
  assert.equal(applyToteMerge(r.data, merge(), "stf-ivan").data, r.data);
});

test("тару с чужим заказом, недособранную или полку не пересыпают", () => {
  const foreign = data();
  foreign.requests.push({
    id: "r3",
    productId: "p2",
    qty: 1,
    status: "done",
    toteId: "t2",
    externalId: "OZ-2",
    source: "ozon",
  });
  assert.equal(applyToteMerge(foreign, merge(), "stf-ivan").flag, "mixed");

  const picking = data();
  picking.requests[1].status = "in_progress";
  assert.equal(applyToteMerge(picking, merge(), "stf-ivan").flag, "mixed");

  assert.equal(applyToteMerge(data(), merge({ fromToteId: "b1" }), "stf-ivan").flag, "bad");
  assert.equal(applyToteMerge(data(), merge({ fromToteId: "t1" }), "stf-ivan").flag, "bad");
});

test("закрытие тары не делает заказ упакованным наполовину", () => {
  assert.equal(orderSplit(data().requests, ["r1"]), true);
  assert.equal(orderSplit(data().requests, ["r1", "r2"]), false);
  const r = applyPackDone(
    data(),
    {
      eventId: "ev-done",
      staffId: "stf-ivan",
      at: AT,
      toteId: "t1",
      outboundCode: "OZ-LABEL-1",
      outboundId: "out1",
      lines: [{ productId: "p1", qty: 1 }],
      requestIds: ["r1"],
      shortages: [],
    },
    "stf-ivan",
  );
  assert.equal(r.flag, "mixed");
});
