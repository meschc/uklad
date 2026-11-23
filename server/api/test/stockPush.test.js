// Выгрузка остатков на площадку (`stockPush.js`): что считаем свободным, что
// шлём и как читаем ответ Ozon. Живой проход — connectors.pg.test.mjs.
/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  freeStock,
  stockBySku,
  changed,
  ozonStockRequests,
  ozonWarehouses,
  ozonRejected,
  ymBusinessId,
  ymGrouped,
  ymWarehouses,
  ymStockRequests,
} = require("../src/cabinet/stockPush");
const { allowed } = require("../src/cabinet/connectors");

test("свободно = короба и тара + открытые короба отгрузки + снятое без тары − открытые заявки", () => {
  const free = freeStock({
    boxes: [
      {
        lines: [
          { productId: "a", qty: 5 },
          { productId: "b", qty: 2 },
        ],
      },
    ],
    outboundBoxes: [
      { lines: [{ productId: "a", qty: 1 }] },
      { shipmentId: "s1", lines: [{ productId: "a", qty: 9 }] },
    ],
    requests: [
      { productId: "a", qty: 2, status: "new" },
      { productId: "a", qty: 1, pickedQty: 1, status: "in_progress" },
      { productId: "a", qty: 1, pickedQty: 1, toteId: "t", status: "in_progress" },
      { productId: "a", qty: 1, pickedQty: 1, status: "shipped" },
      { productId: "b", qty: 5, status: "cancelled" },
      { productId: "b", qty: 3, status: "new" },
    ],
  });
  // a: 5 + 1 (открытый короб) + 1 (снятое без тары) − 4 (открытые заявки) = 3
  assert.equal(free.get("a"), 3);
  // b: 2 − 3 → не меньше нуля
  assert.equal(free.get("b"), 0);
});

test("товар в ячейке без количества не шлём ни числом, ни нулём", () => {
  const free = freeStock({ boxes: [], placements: { c: { cell: 1 } }, requests: [] });
  const out = stockBySku(
    [
      { id: "c", sku: "C-1" },
      { id: "d", sku: "D-1" },
    ],
    free,
  );
  assert.deepEqual(out, { "D-1": 0 });
});

test("артикул у двух товаров не шлём; без артикула — тоже", () => {
  const free = new Map([
    ["a", 3],
    ["b", 4],
  ]);
  const out = stockBySku(
    [
      { id: "a", sku: "X" },
      { id: "b", sku: " X " },
      { id: "e", sku: "" },
      { id: "f", sku: "F" },
    ],
    free,
  );
  assert.deepEqual(out, { F: 0 });
});

test("шлём изменившееся за день, в новый день — всё", () => {
  const prev = { day: "2026-11-21", sent: { A: 1, B: 2 } };
  assert.deepEqual(changed({ A: 1, B: 3, C: 0 }, prev, "2026-11-21"), { B: 3, C: 0 });
  assert.deepEqual(changed({ A: 1 }, prev, "2026-11-22"), { A: 1 });
  assert.deepEqual(changed({ A: 1 }, undefined, "2026-11-22"), { A: 1 });
});

test("запросы Ozon по 100 строк, склад в каждой строке", () => {
  const items = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`S${i}`, i]));
  const reqs = ozonStockRequests(items, 777);
  assert.equal(reqs.length, 2);
  assert.equal(reqs[0].body.stocks.length, 100);
  assert.equal(reqs[1].body.stocks.length, 50);
  assert.deepEqual(reqs[0].body.stocks[1], { offer_id: "S1", stock: 1, warehouse_id: 777 });
  for (const r of reqs) assert.ok(allowed("ozon", r.method, r.path, "server"));
  assert.ok(allowed("ozon", "POST", "/v2/warehouse/list", "server"));
});

test("склады Ozon: только FBS, с номером", () => {
  const ws = ozonWarehouses({
    result: [],
    warehouses: [
      { warehouse_id: 1, name: "Склад", is_rfbs: false },
      { warehouse_id: 2, name: "rFBS", is_rfbs: true },
      { warehouse_id: "3", name: "строка" },
    ],
  });
  assert.deepEqual(ws, [{ id: 1, name: "Склад" }]);
  assert.deepEqual(ozonWarehouses({ result: [{ warehouse_id: 5, name: "В result" }] }), []);
});

test("ответ Ozon: непринятые артикулы и причина", () => {
  const bad = ozonRejected({
    result: [
      { offer_id: "A", updated: true, errors: [] },
      { offer_id: "B", updated: false, errors: [{ code: "SKU_STOCK_NOT_CHANGE" }] },
    ],
  });
  assert.deepEqual(bad, { skus: ["B"], detail: "SKU_STOCK_NOT_CHANGE" });
  assert.deepEqual(ozonRejected({}), { skus: [], detail: "" });
});

test("Маркет: бизнес кампании, группы складов, склады кампании", () => {
  assert.equal(ymBusinessId({ campaign: { business: { id: 5 } } }), 5);
  assert.equal(ymBusinessId({ campaign: {} }), null);
  assert.equal(ymGrouped({ result: { warehouses: [{ id: 1, groupInfo: { id: 9 } }] } }), true);
  assert.equal(ymGrouped({ result: { warehouses: [{ id: 1 }] } }), false);
  const ws = ymWarehouses(
    {
      result: {
        warehouses: [
          { id: 1, name: "Наш", models: [{ placementType: "FBS", campaignId: 778 }] },
          { id: 2, name: "Чужая кампания", models: [{ placementType: "FBS", campaignId: 1 }] },
        ],
      },
    },
    "778",
  );
  assert.deepEqual(ws, [{ id: 1, name: "Наш" }]);
});

test("Маркет: с группой — по кампании, без групп — по складу бизнеса", () => {
  const [g] = ymStockRequests({ A: 3 }, "group", {});
  assert.equal(g.method, "PUT");
  assert.equal(g.path, "/v2/campaigns/{campaignId}/offers/stocks");
  assert.deepEqual(g.body, { skus: [{ sku: "A", items: [{ count: 3 }] }] });
  const [w] = ymStockRequests({ A: 3 }, "warehouse", { businessId: 5, warehouseId: 7 });
  assert.equal(w.path, "/v3/businesses/5/offers/stocks/update");
  assert.deepEqual(w.body, { skuItems: [{ sku: "A", partnerWarehouseId: 7, count: 3 }] });
  for (const r of [g, w]) assert.ok(allowed("yandex-market", r.method, r.path, "server"));
  assert.ok(allowed("yandex-market", "GET", "/v2/campaigns/{campaignId}", "server"));
  assert.ok(allowed("yandex-market", "POST", "/v2/businesses/5/warehouses", "server"));
  assert.ok(allowed("yandex-market", "POST", "/v3/businesses/5/warehouses", "server"));
  assert.ok(!allowed("yandex-market", "POST", "/v3/businesses/5/warehouses", "proxy"));
  const many = Object.fromEntries(Array.from({ length: 1200 }, (_, i) => [`S${i}`, 1]));
  assert.equal(ymStockRequests(many, "group", {}).length, 3);
});

test("отменённый после упаковки заказ держит резерв, пока посылка в отгрузке (23.11)", () => {
  const view = (shipmentId) => ({
    boxes: [],
    outboundBoxes: [
      { id: "o1", requestIds: ["r1"], shipmentId, lines: [{ productId: "p", qty: 2 }] },
    ],
    requests: [{ id: "r1", productId: "p", qty: 2, status: "cancelled", packedAt: 5, toteId: "t" }],
  });
  // Посылка запечатана у старшего: свободных штук нет, площадка их не продаст.
  assert.equal(freeStock(view(undefined)).get("p"), 0);
  // Отменённая до упаковки — резерва нет, как и раньше.
  const before = view(undefined);
  before.outboundBoxes = [];
  before.boxes = [{ lines: [{ productId: "p", qty: 2 }] }];
  delete before.requests[0].packedAt;
  assert.equal(freeStock(before).get("p"), 2);
});
