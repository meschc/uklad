// Кабинет смотрящего на его складе (`viewerPlace.js`, миграция 034).
/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { WAREHOUSE_DOMAINS, focusWarehouse, placeRef } = require("../src/cabinet/viewerPlace");

test("работа склада — тот же список, что у кабинета", () => {
  const src = readFileSync(path.join(__dirname, "../../../src/lib/store/warehouseData.ts"), "utf8");
  const block = /const WAREHOUSE_DOMAINS = \[([\s\S]*?)\] as const/.exec(src)[1];
  const client = [...block.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...WAREHOUSE_DOMAINS].sort(), client.sort());
});

test("склад смотрящего становится активным, чужие склады и их работа пропадают", () => {
  const data = {
    warehouse: { id: "b", name: "Логопарк", floors: [{ id: "fb" }] },
    otherWarehouses: [{ id: "a", name: "Складская 5", floors: [{ id: "fa" }] }],
    activeFloorId: "fb",
    requests: [{ id: "rb" }],
    devices: [{ id: "db" }],
    warehouseData: { a: { requests: [{ id: "ra" }] } },
    products: [{ id: "p" }],
  };
  const out = focusWarehouse(data, "a");
  assert.equal(out.warehouse.id, "a");
  assert.deepEqual(out.otherWarehouses, []);
  assert.deepEqual(out.warehouseData, {});
  assert.deepEqual(out.requests, [{ id: "ra" }]);
  // Своих устройств у склада нет — пусто, а не столы чужого склада.
  assert.deepEqual(out.devices, []);
  assert.equal(out.activeFloorId, "fa");
  assert.deepEqual(out.products, data.products);
  // Активный и есть свой — только убираем остальные.
  const same = focusWarehouse(data, "b");
  assert.equal(same.warehouse.id, "b");
  assert.deepEqual(same.requests, [{ id: "rb" }]);
  assert.deepEqual(same.otherWarehouses, []);
  // Нет такого склада — нет и кабинета.
  assert.equal(focusWarehouse(data, "zzz"), null);
  assert.equal(focusWarehouse(data, null), null);
});

test("склад не назначен: единственный — он, несколько — никакой", () => {
  const one = { warehouse: { id: "a" } };
  const two = { warehouse: { id: "a" }, otherWarehouses: [{ id: "b" }] };
  const placeholder = { warehouse: { id: "x", placeholder: true }, otherWarehouses: [] };
  assert.equal(placeRef(one, null), "a");
  assert.equal(placeRef(two, null), null);
  assert.equal(placeRef(two, "b"), "b");
  assert.equal(placeRef(placeholder, null), null);
});
