/**
 * Заявка продавца: разбор тела и «хватит ли свободного». Ошибка здесь —
 * заявка с чужим статусом, дробным количеством или больше, чем лежит.
 * Сама запись и чужой товар — `sellerRequests.pg.test.mjs`.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readBody, shortOf, requestId, cancelProblem } = require("../src/cabinet/sellerRequests");
const { UNPAID_ALLOWED } = require("../src/cabinet/planLimits");

const NOW = 1_800_000_000_000;
const DAY = 24 * 3_600_000;
const base = { key: "key-12345678", items: [{ productId: "p-1", qty: 2 }] };

test("тело: только «что и сколько», поля склада не проходят", () => {
  const b = readBody({ ...base, status: "done", pickedQty: 2, by: "warehouse" }, NOW);
  assert.deepEqual(b, {
    key: "key-12345678",
    lines: [{ productId: "p-1", qty: 2 }],
    note: undefined,
    vehicle: undefined,
    truckDate: undefined,
  });
});

test("тело: плохое количество, ключ, дата и площадка — отказ", () => {
  for (const qty of [0, -1, 1.5, 1_000_001, "2", null]) {
    assert.equal(readBody({ ...base, items: [{ productId: "p-1", qty }] }, NOW), null);
  }
  assert.equal(readBody({ ...base, key: "short" }, NOW), null);
  assert.equal(readBody({ ...base, key: "ключ-кириллицей" }, NOW), null);
  assert.equal(readBody({ ...base, items: [] }, NOW), null);
  assert.equal(readBody({ ...base, items: [{ productId: "../x", qty: 1 }] }, NOW), null);
  assert.equal(readBody({ ...base, truckDate: NOW - 2 * DAY }, NOW), null);
  assert.equal(readBody({ ...base, truckDate: NOW + 400 * DAY }, NOW), null);
  assert.equal(readBody({ ...base, note: "x".repeat(201) }, NOW), null);
  assert.equal(readBody({ ...base, source: "avito", externalId: "1" }, NOW), null);
  assert.equal(readBody({ ...base, source: "ozon" }, NOW), null);
  assert.deepEqual(
    readBody({ ...base, source: "ozon", externalId: " OZ-1 ", truckDate: NOW + DAY }, NOW),
    {
      key: "key-12345678",
      lines: [{ productId: "p-1", qty: 2 }],
      note: undefined,
      vehicle: undefined,
      truckDate: NOW + DAY,
      source: "ozon",
      externalId: "OZ-1",
    },
  );
});

test("свободное: строки одного товара складываются, неизвестное не держит", () => {
  const free = new Map([
    ["p-1", 5],
    ["p-2", undefined],
  ]);
  const line = (productId, qty) => ({ productId, qty });
  assert.equal(shortOf([line("p-1", 5)], free), null);
  assert.deepEqual(shortOf([line("p-1", 3), line("p-1", 3)], free), { productId: "p-1", free: 5 });
  assert.equal(shortOf([line("p-2", 100)], free), null);
  assert.deepEqual(shortOf([line("p-3", 1)], free), { productId: "p-3", free: 0 });
});

test("повтор с тем же ключом даёт те же id; неоплаченный кабинет заявку не заводит", () => {
  assert.equal(requestId("key-12345678", 0), requestId("key-12345678", 0));
  assert.notEqual(requestId("key-12345678", 0), requestId("key-12345678", 1));
  assert.ok(!UNPAID_ALLOWED.some((re) => re.test("/api/requests")));
});

test("отмена: «новая» с тарой, посылкой или началом сборки — уже начата", () => {
  const r = { by: "seller", status: "new" };
  assert.equal(cancelProblem(r), null);
  for (const over of [
    { toteId: "box-1" },
    { startedAt: 1 },
    { packedAt: 1 },
    { shipmentId: "s" },
  ]) {
    assert.equal(cancelProblem({ ...r, ...over }), "started");
  }
  assert.equal(cancelProblem({ ...r, pickedQty: 1 }), "started");
  assert.equal(cancelProblem({ ...r, reservedShipmentId: "exp" }), "reserved");
  assert.equal(cancelProblem({ ...r, by: undefined }), "not_yours");
});

test("поставка: строк во всех ждущих — не больше 5000; продавцу — только поля ожидания", () => {
  const { supplyRefusal, toSellerSupply } = require("../src/cabinet/sellerSupplies");
  const own = new Set(["p-1"]);
  const big = (n) => ({
    by: "seller",
    status: "pending",
    lines: Array.from({ length: n }, () => ({ productId: "p-1" })),
  });
  const b = (n) => ({ lines: Array.from({ length: n }, () => ({ productId: "p-1", qty: 1 })) });
  assert.equal(supplyRefusal({ expectedShipments: [big(4900)] }, own, b(100)), null);
  assert.deepEqual(supplyRefusal({ expectedShipments: [big(4900)] }, own, b(101)), {
    status: 409,
    error: "too_many",
  });
  const s = toSellerSupply(
    {
      id: "s",
      status: "pending",
      countedBy: "st-1",
      lines: [
        { id: "l1", productId: "p-1", expectedQty: 2, receivedQty: 0, by: "st-1" },
        { id: "l2", productId: "p-2", expectedQty: 1, receivedQty: 0 },
      ],
    },
    own,
  );
  assert.deepEqual(s, {
    id: "s",
    status: "pending",
    lines: [{ id: "l1", productId: "p-1", expectedQty: 2, receivedQty: 0 }],
  });
});
