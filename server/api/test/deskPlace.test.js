// Склад стола по устройству и обратная укладка его работы (`deskPlace.js`).
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deskWarehouse, deskPlace } = require("../src/cabinet/deskPlace");

const data = () => ({
  warehouse: { id: "a", staff: [{ id: "s-a" }] },
  devices: [{ id: "dev-a" }, { id: "dev-off", revokedAt: 5 }],
  boxes: [{ id: "box-a" }],
  staffEvents: [],
  activeFloorId: "f-a",
  otherWarehouses: [{ id: "b", staff: [{ id: "s-b" }] }],
  warehouseData: { b: { devices: [{ id: "dev-b" }], boxes: [{ id: "box-b" }] } },
});

test("склад стола — по устройству; отключённое и чужое — нет склада", () => {
  assert.equal(deskWarehouse(data(), "dev-a"), "a");
  assert.equal(deskWarehouse(data(), "dev-b"), "b");
  assert.equal(deskWarehouse(data(), "dev-off"), null);
  assert.equal(deskWarehouse(data(), "dev-x"), null);
  // Одно устройство на двух складах — не угадываем.
  const twice = data();
  twice.warehouseData.b.devices.push({ id: "dev-a" });
  assert.equal(deskWarehouse(twice, "dev-a"), null);
});

test("работа стола неоткрытого склада ложится в его warehouseData", () => {
  const full = data();
  const p = deskPlace(full, "dev-b");
  assert.equal(p.data.warehouse.id, "b");
  assert.ok(p.staffHere("s-b"));
  assert.ok(!p.staffHere("s-a"));
  const out = p.back({ ...p.data, boxes: [{ id: "box-b2" }], staffEvents: [{ id: "e" }] });
  assert.equal(out.warehouse.id, "a");
  assert.equal(out.activeFloorId, "f-a");
  assert.deepEqual(out.boxes, [{ id: "box-a" }]);
  assert.deepEqual(out.warehouseData.b.boxes, [{ id: "box-b2" }]);
  assert.deepEqual(out.warehouseData.b.devices, [{ id: "dev-b" }]);
  assert.deepEqual(out.otherWarehouses, full.otherWarehouses);
  // Общее для компании (журнал смен) — из результата.
  assert.deepEqual(out.staffEvents, [{ id: "e" }]);
});

test("работа стола открытого склада — в корне, другие склады на месте", () => {
  const full = data();
  const p = deskPlace(full, "dev-a");
  assert.deepEqual(p.data.warehouseData, {});
  const out = p.back({ ...p.data, boxes: [] });
  assert.deepEqual(out.boxes, []);
  assert.deepEqual(out.warehouseData, full.warehouseData);
  assert.deepEqual(out.otherWarehouses, full.otherWarehouses);
});
