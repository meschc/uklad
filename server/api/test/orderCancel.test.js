// Отмена заказа площадкой (`orderCancel.js`): запросы к площадкам и правило
// «отменённый заказ → заявки «отменена»». Живой проход — connectors.pg.test.mjs.
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  CANCELS,
  fetchCancelled,
  openOrders,
  cancelRequests,
  ymTime,
} = require("../src/cabinet/orderCancel");
const { allowed } = require("../src/cabinet/connectors");

const NOW = Date.parse("2026-11-21T10:00:00Z");
const req = (id, over) => ({ id, source: "ozon", externalId: "1-1", status: "new", ...over });

test("открытые заявки: не отменённые, не упакованные, не уехавшие", () => {
  const rs = [
    req("a", { externalId: "1-1" }),
    req("b", { externalId: "1-2", status: "done" }),
    req("c", { externalId: "1-3", packedAt: 5 }),
    req("d", { externalId: "1-4", status: "shipped" }),
    req("e", { externalId: "1-5", status: "cancelled" }),
    req("f", { externalId: "9", source: "wildberries" }),
    req("g", { externalId: undefined }),
  ];
  assert.deepEqual([...openOrders(rs, "ozon")], ["1-1", "1-2"]);
});

test("отмены — только заявки партнёра этого подключения", () => {
  const partnerOf = (p) => ({ pa: "A", pb: "B" })[p] ?? null;
  const rs = [
    req("a", { externalId: "1", productId: "pa" }),
    req("b", { externalId: "2", productId: "pb" }),
    req("c", { externalId: "3", productId: "own" }),
  ];
  assert.deepEqual([...openOrders(rs, "ozon", partnerOf, "A")], ["1"]);
  assert.deepEqual([...openOrders(rs, "ozon", partnerOf, null)], ["3"]);
  const out = cancelRequests(rs, "ozon", new Set(["1", "2"]), NOW, partnerOf, "A");
  assert.deepEqual(
    out.requests.map((r) => r.status),
    ["cancelled", "new", "new"],
  );
});

test("отмена: открытые заявки заказа — «отменена», упакованную не трогаем", () => {
  const rs = [
    req("a", { externalId: "1-1", status: "in_progress" }),
    req("b", { externalId: "1-1", packedAt: 5 }),
    req("c", { externalId: "1-2" }),
    req("d", { externalId: "1-1", source: "wildberries" }),
  ];
  const out = cancelRequests(rs, "ozon", new Set(["1-1"]), NOW);
  assert.equal(out.cancelled, 1);
  assert.deepEqual(
    out.requests.map((r) => [r.id, r.status]),
    [
      ["a", "cancelled"],
      ["b", "new"],
      ["c", "new"],
      ["d", "new"],
    ],
  );
  assert.equal(out.requests[0].updatedAt, NOW);
});

test("Ozon: отменённые за 3 дня, страницы по cursor, только свои номера", async () => {
  const calls = [];
  const pages = [
    {
      postings: [
        { posting_number: "1-1", status: "cancelled" },
        { posting_number: "7-7", status: "cancelled" },
      ],
      has_next: true,
      cursor: "c2",
    },
    { postings: [{ posting_number: "1-2", status: "cancelled" }], has_next: false },
  ];
  const ask = async (r) => {
    calls.push(r);
    return { ok: true, data: pages[calls.length - 1] };
  };
  const got = await fetchCancelled(ask, "ozon", NOW, new Set(["1-1", "1-2", "1-3"]));
  assert.deepEqual([...got.ids].sort(), ["1-1", "1-2"]);
  assert.equal(calls[0].path, "/v4/posting/fbs/list");
  assert.deepEqual(calls[0].body.filter.statuses, ["cancelled"]);
  assert.equal(calls[0].body.filter.last_changed_status_date.from, "2026-11-18T10:00:00.000Z");
  assert.equal(calls[1].body.cursor, "c2");
});

test("WB: статусы по номерам открытых заданий, отмена — cancel или wbStatus", async () => {
  let call;
  const ask = async (r) => {
    call = r;
    return {
      ok: true,
      data: {
        orders: [
          { id: 11, supplierStatus: "cancel", wbStatus: "waiting" },
          { id: 12, supplierStatus: "new", wbStatus: "canceled_by_client" },
          { id: 13, supplierStatus: "confirm", wbStatus: "waiting" },
        ],
      },
    };
  };
  const got = await fetchCancelled(ask, "wildberries", NOW, new Set(["11", "12", "13", "x/../1"]));
  assert.deepEqual([...got.ids].sort(), ["11", "12"]);
  assert.deepEqual(call, {
    method: "POST",
    path: "/api/v3/orders/status",
    body: { orders: [11, 12, 13] },
  });
  // Открытых заданий нет — к WB не ходим.
  assert.equal(CANCELS.wildberries.first(NOW, new Set()), null);
});

test("Маркет: CANCELLED, обновлённые за 3 дня, следующая страница — pageToken", async () => {
  const req0 = CANCELS["yandex-market"].first(NOW);
  assert.deepEqual(req0.query, {
    status: "CANCELLED",
    updatedAtFrom: "2026-11-18T13:00:00+03:00",
    limit: 50,
  });
  const next = CANCELS["yandex-market"].next(req0, { paging: { nextPageToken: "t" } });
  assert.equal(next.query.pageToken, "t");
  assert.equal(ymTime(NOW), "2026-11-21T13:00:00+03:00");
  const ask = async () => ({
    ok: true,
    data: {
      orders: [
        { id: 5, status: "CANCELLED" },
        { id: 6, status: "PROCESSING" },
      ],
    },
  });
  const got = await fetchCancelled(ask, "yandex-market", NOW, new Set(["5", "6"]));
  assert.deepEqual([...got.ids], ["5"]);
});

test("отказ площадки — отмен не знаем; открытых нет — не спрашиваем", async () => {
  const fail = async () => ({ ok: false, error: "rate_limit" });
  assert.equal((await fetchCancelled(fail, "ozon", NOW, new Set(["1"]))).ok, false);
  let asked = false;
  const spy = async () => ((asked = true), { ok: true, data: {} });
  assert.equal((await fetchCancelled(spy, "ozon", NOW, new Set())).ids.size, 0);
  assert.equal(asked, false);
});

test("запросы об отменах — только серверу", () => {
  assert.equal(allowed("ozon", "POST", "/v4/posting/fbs/list"), false);
  assert.equal(allowed("ozon", "POST", "/v4/posting/fbs/list", "server"), true);
  assert.equal(allowed("wildberries", "POST", "/api/v3/orders/status"), false);
  assert.equal(allowed("wildberries", "POST", "/api/v3/orders/status", "server"), true);
});
