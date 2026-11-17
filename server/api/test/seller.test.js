/**
 * Кабинет продавца: из спорного он видит только лишнее с приёмки по своему
 * товару — без того, кто нашёл и решил, и без заметок старшего.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { forSeller } = require("../src/cabinet/seller");

test("продавцу — лишнее с приёмки по своему товару, без людей и заметок", () => {
  const out = forSeller(
    {
      products: [
        { id: "p1", partnerId: "s1" },
        { id: "p2", partnerId: "s2" },
      ],
      disputes: [
        {
          id: "ovr-1",
          kind: "receive_overage",
          productId: "p1",
          qty: 2,
          boxId: "b1",
          raisedBy: "stf-ivan",
          raisedAt: 1,
          resolution: "accepted",
          resolvedBy: "stf-olga",
          resolvedAt: 2,
          note: "пересчитали",
        },
        {
          id: "ovr-2",
          kind: "receive_overage",
          productId: "p2",
          qty: 1,
          raisedBy: "x",
          raisedAt: 1,
        },
        { id: "d-3", kind: "shortage", productId: "p1", qty: 1, raisedBy: "x", raisedAt: 1 },
      ],
    },
    "s1",
  );
  assert.deepEqual(out.disputes, [
    {
      id: "ovr-1",
      kind: "receive_overage",
      productId: "p1",
      qty: 2,
      raisedAt: 1,
      resolution: "accepted",
      resolvedAt: 2,
      raisedBy: "warehouse",
      resolvedBy: "warehouse",
    },
  ]);
});
