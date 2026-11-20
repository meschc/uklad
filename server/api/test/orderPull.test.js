// Подкачка заказов на сервере (`orderPull.js`): разбор ответов площадок и
// правило «заказ → заявки». Живой проход с базой — в connectors.pg.test.mjs.
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require, Response */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapOzon,
  mapWb,
  mapYm,
  planImport,
  productsFor,
  newRequests,
  knownIn,
  connectionWarehouse,
  fetchOrders,
} = require("../src/cabinet/orderPull");

const P = [
  { id: "a", sku: "ART-A", barcode: "111" },
  { id: "b", sku: "ART-B", barcode: "222" },
  { id: "c1", sku: "DUP" },
  { id: "c2", sku: "dup" },
];
const order = (externalId, lines) => ({ externalId, lines });

test("заказ из двух товаров — две заявки с одним номером", () => {
  const plan = planImport(
    [
      order("O-1", [
        { vendorCode: "art-a", qty: 2 },
        { vendorCode: "ART-B", qty: 1 },
      ]),
    ],
    P,
    new Set(),
  );
  assert.equal(plan.orders, 1);
  assert.deepEqual(plan.items, [
    { productId: "a", qty: 2, externalId: "O-1" },
    { productId: "b", qty: 1, externalId: "O-1" },
  ]);
});

test("товар узнаётся и по штрихкоду", () => {
  const plan = planImport(
    [order("1", [{ vendorCode: "?", barcode: "222", qty: 1 }])],
    P,
    new Set(),
  );
  assert.equal(plan.items[0].productId, "b");
});

test("неизвестный товар — заказ целиком в «не найден», без половины", () => {
  const plan = planImport(
    [
      order("2", [
        { vendorCode: "ART-A", qty: 1 },
        { vendorCode: "NOPE", qty: 1 },
      ]),
    ],
    P,
    new Set(),
  );
  assert.deepEqual([plan.orders, plan.items, plan.unknown], [0, [], ["2"]]);
});

test("один артикул у двух товаров — не угадываем", () => {
  const plan = planImport([order("3", [{ vendorCode: "DUP", qty: 1 }])], P, new Set());
  assert.deepEqual(plan.unknown, ["3"]);
});

test("уже бывший номер (в любом статусе, на любом складе) второй раз не заводится", () => {
  const full = {
    requests: [{ source: "ozon", externalId: "X-1", status: "cancelled" }],
    warehouseData: { w2: { requests: [{ source: "ozon", externalId: "x-2" }] } },
  };
  const known = knownIn(full, "ozon");
  const plan = planImport(
    [
      order("X-1", [{ vendorCode: "ART-A", qty: 1 }]),
      order("X-2", [{ vendorCode: "ART-A", qty: 1 }]),
      order("X-3", [{ vendorCode: "ART-A", qty: 1 }]),
      order("X-3", [{ vendorCode: "ART-A", qty: 1 }]),
    ],
    P,
    known,
  );
  assert.deepEqual(
    plan.items.map((i) => i.externalId),
    ["X-3"],
  );
  // Номер другой площадки — не тот же заказ.
  assert.equal(knownIn(full, "wildberries").size, 0);
});

test("товары подключения: склад и партнёр, «свой товар» — без партнёра", () => {
  const products = [
    { id: "1", partnerId: "pt1", warehouseId: "w1" },
    { id: "2", warehouseId: "w1" },
    { id: "3", partnerId: "pt1", warehouseId: "w2" },
    { id: "4", partnerId: "pt1" },
  ];
  const ids = (wh, pt) => productsFor(products, wh, pt).map((p) => p.id);
  assert.deepEqual(ids({ id: "w1" }, "pt1"), ["1", "4"]);
  assert.deepEqual(ids({ id: "w1", ownCatalog: true }, "pt1"), ["1"]);
  assert.deepEqual(ids({ id: "w1" }, null), ["2"]);
});

test("склад подключения: сохранённый, иначе единственный, иначе не угадываем", () => {
  const one = { warehouse: { id: "w1" } };
  const two = { warehouse: { id: "w1" }, otherWarehouses: [{ id: "w2" }] };
  assert.equal(connectionWarehouse(one, {}), "w1");
  assert.equal(connectionWarehouse(two, {}), null);
  assert.equal(connectionWarehouse(two, { warehouseId: "w2" }), "w2");
  assert.equal(connectionWarehouse(two, { warehouseId: "gone" }), null);
});

test("заявка — той же формы, что заводит кабинет", () => {
  const plan = { items: [{ productId: "a", qty: 1, externalId: "9" }] };
  assert.deepEqual(
    newRequests(plan, "ozon", 5, () => "req_1"),
    [
      {
        id: "req_1",
        productId: "a",
        qty: 1,
        source: "ozon",
        externalId: "9",
        status: "new",
        createdAt: 5,
        updatedAt: 5,
      },
    ],
  );
});

test("разбор ответов Ozon, WB и Маркета", () => {
  assert.deepEqual(
    mapOzon({
      result: {
        postings: [
          {
            posting_number: "123-1",
            shipment_date: "2026-11-20T10:00:00Z",
            products: [{ offer_id: "ART-A", quantity: 2 }],
          },
          { bad: true },
        ],
      },
    }),
    [
      {
        externalId: "123-1",
        shipBy: "2026-11-20T10:00:00Z",
        lines: [{ vendorCode: "ART-A", qty: 2 }],
      },
    ],
  );
  assert.deepEqual(mapWb({ orders: [{ id: 7, article: "ART-B", skus: ["222"] }] }), [
    { externalId: "7", lines: [{ vendorCode: "ART-B", barcode: "222", qty: 1 }] },
  ]);
  assert.deepEqual(mapYm({ orders: [{ id: 8, items: [{ offerId: "ART-A", count: 3 }] }] }), [
    { externalId: "8", lines: [{ vendorCode: "ART-A", qty: 3 }] },
  ]);
  assert.deepEqual(mapOzon(null), []);
  assert.deepEqual(mapWb({ orders: "x" }), []);
});

/** Площадка-заглушка: ответы по очереди, запросы — в `seen`. */
function fake(replies, seen) {
  return async (url, o) => {
    seen.push({ url, body: o.body ? JSON.parse(o.body) : null, headers: o.headers });
    const r = replies.shift();
    return new Response(JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  };
}
const quiet = { error() {} };

test("Ozon: следующая страница — только если площадка дала, откуда продолжать", async () => {
  const seen = [];
  const posting = (n) => ({ posting_number: n, products: [{ offer_id: "A", quantity: 1 }] });
  const fetchImpl = fake(
    [
      { body: { result: { postings: [posting("1")], has_next: true, cursor: "c1" } } },
      { body: { result: { postings: [posting("2")], has_next: false } } },
    ],
    seen,
  );
  const ctx = { key: { token: "K" }, params: { clientId: "42" }, log: quiet, fetchImpl };
  const res = await fetchOrders(ctx, "ozon", Date.parse("2026-11-19T00:00:00Z"));
  assert.ok(res.ok);
  assert.deepEqual(
    res.orders.map((o) => o.externalId),
    ["1", "2"],
  );
  assert.equal(seen[0].url, "https://api-seller.ozon.ru/v4/posting/fbs/unfulfilled/list");
  assert.equal(seen[0].body.limit, 100);
  assert.equal(seen[0].body.cursor, undefined);
  assert.equal(seen[1].body.cursor, "c1");
  assert.equal(seen[0].headers["Client-Id"], "42");
});

test("Маркет: номер кампании подставляет сервер; отказ площадки — с причиной, без ключа", async () => {
  const seen = [];
  const fetchImpl = fake([{ status: 401, body: { error: { message: "bad key" } } }], seen);
  const ctx = { key: { token: "SECRET" }, params: { clientId: "777" }, log: quiet, fetchImpl };
  const res = await fetchOrders(ctx, "yandex-market", 0);
  assert.deepEqual(res, { ok: false, error: "rejected", status: 401, detail: "bad key" });
  assert.match(
    seen[0].url,
    /^https:\/\/api\.partner\.market\.yandex\.ru\/v2\/campaigns\/777\/orders\?/,
  );
  assert.match(seen[0].url, /status=PROCESSING/);
  assert.ok(!JSON.stringify(res).includes("SECRET"));
});
