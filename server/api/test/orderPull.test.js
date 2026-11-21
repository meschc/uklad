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
  pickedOrders,
  ASSEMBLE,
  assembleWb,
} = require("../src/cabinet/orderPull");
const { allowed } = require("../src/cabinet/connectors");

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

test("срок отгрузки площадки становится датой машины заявки", () => {
  const plan = planImport(
    [
      {
        externalId: "S-1",
        shipBy: "2026-11-20T10:00:00Z",
        lines: [{ vendorCode: "ART-A", qty: 1 }],
      },
      { externalId: "S-2", shipBy: "завтра", lines: [{ vendorCode: "ART-B", qty: 1 }] },
    ],
    P,
    new Set(),
  );
  const reqs = newRequests(plan, "ozon", 5, () => "r");
  assert.equal(reqs[0].truckDate, Date.parse("2026-11-20T10:00:00Z"));
  // Не дата — срока нет, а не «сегодня» или ноль.
  assert.equal("truckDate" in reqs[1], false);
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
  assert.deepEqual(
    mapYm({
      orders: [
        {
          id: 8,
          delivery: { shipments: [{ shipmentDate: "21-11-2026" }] },
          items: [{ offerId: "ART-A", count: 3 }],
        },
      ],
    }),
    [
      {
        externalId: "8",
        shipBy: "2026-11-21T00:00:00+03:00",
        lines: [{ vendorCode: "ART-A", qty: 3 }],
      },
    ],
  );
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

test("«собран» — только когда все заявки заказа собраны, без частичных", () => {
  const r = (externalId, status, extra = {}) => ({ source: "ozon", externalId, status, ...extra });
  const picked = pickedOrders(
    [
      r("A", "done"),
      r("A", "shipped"),
      r("B", "done"),
      r("B", "in_progress"),
      r("C", "done", { partial: true }),
      r("D", "new"),
      r("E", "done"),
      r("E", "cancelled"),
      { source: "wildberries", externalId: "F", status: "done" },
    ],
    "ozon",
  );
  assert.deepEqual([...picked].sort(), ["a", "e"]);
});

test("Ozon «собран»: одно место со всеми товарами по SKU, только из «ждёт сборки»", () => {
  const o = {
    externalId: "1-2-3",
    status: "awaiting_packaging",
    lines: [
      { sku: 11, qty: 2 },
      { sku: 12, qty: 1 },
    ],
  };
  assert.deepEqual(ASSEMBLE.ozon(o), {
    method: "POST",
    path: "/v4/posting/fbs/ship",
    body: {
      posting_number: "1-2-3",
      packages: [
        {
          products: [
            { product_id: 11, quantity: 2 },
            { product_id: 12, quantity: 1 },
          ],
        },
      ],
      with: { additional_data: false },
    },
  });
  assert.equal(ASSEMBLE.ozon({ ...o, status: "awaiting_deliver" }), null);
  assert.equal(ASSEMBLE.ozon({ ...o, lines: [{ qty: 1 }] }), null);
  assert.equal(ASSEMBLE["yandex-market"]({ externalId: "12/../x", lines: [] }), null);
});

// Площадка-заглушка WB: поставки по номерам, «закрытые» не принимают задания.
function fakeWb({ closed = [], refuse = [] } = {}) {
  const calls = [];
  let n = 100;
  const ask = async (req) => {
    calls.push(req);
    if (req.method === "POST") return { ok: true, data: { id: `WB-GI-${(n += 1)}` } };
    const id = /supplies\/(WB-GI-\d+)\//.exec(req.path)[1];
    if (closed.includes(id)) return { ok: false, error: "upstream", status: 409, detail: "closed" };
    if (req.body.orders.some((o) => refuse.includes(o)))
      return { ok: false, error: "upstream", status: 409, detail: "нельзя" };
    return { ok: true, data: null };
  };
  return { ask, calls };
}

const AT = Date.parse("2026-11-21T10:00:00Z");
const wbOrders = [
  { externalId: "11", wbWarehouse: 7, cargoType: 1, lines: [] },
  { externalId: "12", wbWarehouse: 7, cargoType: 1, lines: [] },
  { externalId: "13", wbWarehouse: 8, cargoType: 1, lines: [] },
  { externalId: "14", wbWarehouse: 7, cargoType: 1, lines: [] },
];

test("WB «собран»: собранные задания — в поставку дня, по складу WB", async () => {
  const wb = fakeWb();
  const picked = new Set(["11", "12", "13"]);
  const r = await assembleWb(wb.ask, wbOrders, picked, undefined, AT);
  assert.deepEqual([r.assembled, r.assembleFailed], [3, []]);
  // Два склада WB — две поставки; несобранное (14) не трогаем.
  assert.deepEqual(
    wb.calls.filter((c) => c.method === "PATCH").map((c) => [c.path, c.body.orders]),
    [
      ["/api/marketplace/v3/supplies/WB-GI-101/orders", [11, 12]],
      ["/api/marketplace/v3/supplies/WB-GI-102/orders", [13]],
    ],
  );
  assert.equal(wb.calls[0].body.name, "Уклад 21.11.2026");
  assert.deepEqual(r.wbSupply.byGroup, { "7:1": "WB-GI-101", "8:1": "WB-GI-102" });

  // Следующий проход того же дня — в ту же поставку, новой не заводим.
  const again = fakeWb();
  await assembleWb(again.ask, wbOrders, new Set(["14"]), r.wbSupply, AT + 36e5);
  assert.deepEqual(
    again.calls.map((c) => c.method),
    ["PATCH"],
  );
  assert.match(again.calls[0].path, /WB-GI-101/);

  // Назавтра — новая поставка.
  const tomorrow = fakeWb();
  await assembleWb(tomorrow.ask, wbOrders, new Set(["14"]), r.wbSupply, AT + 864e5);
  assert.deepEqual(
    tomorrow.calls.map((c) => c.method),
    ["POST", "PATCH"],
  );
});

test("WB «собран»: закрытая поставка — новая, отказ — без новых поставок без конца", async () => {
  const prev = { day: "2026-11-21", byGroup: { "7:1": "WB-GI-5" }, made: {} };
  const wb = fakeWb({ closed: ["WB-GI-5"] });
  const r = await assembleWb(wb.ask, wbOrders, new Set(["11"]), prev, AT);
  assert.deepEqual([r.assembled, r.wbSupply.byGroup["7:1"]], [1, "WB-GI-101"]);

  // Задание, которое WB не берёт ни в какую поставку: не больше трёх новых за день.
  let state;
  let posts = 0;
  for (let i = 0; i < 6; i += 1) {
    const bad = fakeWb({ refuse: [12] });
    const res = await assembleWb(bad.ask, wbOrders, new Set(["12"]), state, AT);
    posts += bad.calls.filter((c) => c.method === "POST").length;
    assert.deepEqual(res.assembleFailed, ["12"]);
    assert.equal(res.assembleDetail, "нельзя");
    state = res.wbSupply;
  }
  assert.equal(posts, 3);
  // Номер не цифрами — в путь не идёт.
  const odd = fakeWb();
  await assembleWb(
    odd.ask,
    [{ externalId: "1/../x", lines: [] }],
    new Set(["1/../x"]),
    undefined,
    AT,
  );
  assert.equal(odd.calls.length, 0);
});

test("смену статуса на площадке может только сервер, не прокси кабинета", () => {
  assert.equal(allowed("wildberries", "POST", "/api/v3/supplies"), false);
  assert.equal(allowed("wildberries", "POST", "/api/v3/supplies", "server"), true);
  const wbAdd = "/api/marketplace/v3/supplies/WB-GI-123/orders";
  assert.equal(allowed("wildberries", "PATCH", wbAdd), false);
  assert.equal(allowed("wildberries", "PATCH", wbAdd, "server"), true);
  assert.equal(
    allowed("wildberries", "PATCH", "/api/marketplace/v3/supplies/x/orders", "server"),
    false,
  );
  assert.equal(allowed("ozon", "POST", "/v4/posting/fbs/ship"), false);
  assert.equal(allowed("ozon", "POST", "/v4/posting/fbs/ship", "server"), true);
  const ym = "/v2/campaigns/{campaignId}/orders/555/status";
  assert.equal(allowed("yandex-market", "PUT", ym), false);
  assert.equal(allowed("yandex-market", "PUT", ym, "server"), true);
  assert.equal(
    allowed("yandex-market", "PUT", "/v2/campaigns/{campaignId}/orders/x/status", "server"),
    false,
  );
});
