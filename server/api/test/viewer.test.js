/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { forViewer, VIEWER_KEYS, VIEWER_HIDDEN } = require("../src/cabinet/viewer");

test("каждое сохраняемое поле кабинета смотрящему либо открыто, либо закрыто осознанно", () => {
  // Ключи сохранения браузера (`persistedState` в store/index.ts): новое поле
  // без решения здесь уронит тест, а не утечёт кладовщику молча.
  const src = fs.readFileSync(path.join(__dirname, "../../../src/lib/store/index.ts"), "utf8");
  const body = /export function persistedState[\s\S]*?return \{([\s\S]*?)\n {2}\};/.exec(src)[1];
  const keys = [...body.matchAll(/^\s{4}([a-zA-Z]+)[:,]/gm)].map((m) => m[1]);
  assert.ok(keys.length > 20, `ключи не нашлись: ${keys}`);
  const decided = new Set([...VIEWER_KEYS, ...VIEWER_HIDDEN, "warehouse"]);
  assert.deepEqual(
    keys.filter((k) => !decided.has(k)),
    [],
  );
  assert.deepEqual(
    VIEWER_KEYS.filter((k) => VIEWER_HIDDEN.includes(k)),
    [],
  );
});

test("смотрящий не видит реквизитов, цен, ставок, контактов и смен", () => {
  const out = forViewer({
    account: {
      type: "company",
      name: "Кирилл",
      org: "ООО Склад",
      inn: "7700000000",
      legalAddress: "x",
    },
    subscription: { tariff: "warehouse" },
    serviceSettings: { enabled: { pack: true }, prices: { pack: 50 }, twoStageReceiving: true },
    staffEvents: [{ id: "e1" }],
    profile: { name: "Кирилл" },
    devices: [{ id: "d1" }],
    products: [{ id: "p1" }],
    warehouse: {
      id: "w1",
      name: "Склад",
      floors: [],
      storageRatePerCell: 30,
      manager: {
        id: "m",
        name: "Игорь",
        role: "Управляющий",
        phone: "+7",
        email: "m@x",
        hourlyRate: 900,
      },
      staff: [{ id: "s", name: "Иван", role: "Упаковщик", phone: "+7", hourlyRate: 300 }],
      partners: [{ id: "pt", name: "Ромашка", contact: "c", person: "Анна", phone: "+7" }],
    },
  });
  assert.deepEqual(out.account, { type: "company", name: "", org: "ООО Склад" });
  assert.equal(out.subscription, undefined);
  assert.deepEqual(out.serviceSettings, { enabled: {}, prices: {}, twoStageReceiving: true });
  assert.deepEqual(out.staffEvents, []);
  assert.equal(out.profile, undefined);
  assert.equal(out.devices, undefined);
  assert.deepEqual(out.products, [{ id: "p1" }]);
  assert.equal(out.warehouse.storageRatePerCell, undefined);
  assert.deepEqual(out.warehouse.manager, { id: "m", name: "Игорь", role: "Управляющий" });
  assert.deepEqual(out.warehouse.staff, [{ id: "s", name: "Иван", role: "Упаковщик" }]);
  assert.deepEqual(out.warehouse.partners, [{ id: "pt", name: "Ромашка" }]);
});

test("запись без «Персонала» — только по полям, которые смотрящий получает", () => {
  const { KEY_PERMS, writableKeys, mergeScoped } = require("../src/cabinet/writeScope");
  const { VIEWER_KEYS } = require("../src/cabinet/viewer");
  // Поле, которого у смотрящего нет, он записал бы пустым поверх настоящего.
  for (const key of Object.keys(KEY_PERMS)) assert.ok(VIEWER_KEYS.includes(key), key);
  const can = (p) => p === "plan.edit";
  assert.deepEqual(writableKeys(can).sort(), [
    "addressing",
    "layoutTemplates",
    "templates",
    "warehouse",
  ]);
  const cur = {
    addressing: { a: 1 },
    serviceSettings: { prices: { pack: 25 } },
    warehouse: { floors: [1], staff: [{ id: "s", hourlyRate: 300 }] },
  };
  const next = {
    addressing: { a: 2 },
    serviceSettings: { prices: {} },
    warehouse: { floors: [2], staff: [{ id: "s" }] },
  };
  assert.deepEqual(mergeScoped(cur, next, can), {
    addressing: { a: 2 },
    serviceSettings: { prices: { pack: 25 } },
    warehouse: { floors: [2], staff: [{ id: "s", hourlyRate: 300 }] },
  });
});

test("каждый ключ смотрящего привязан к разделу прав (033)", () => {
  const { AREA_KEYS, DEVICE_KEYS } = require("../src/cabinet/viewerAreas");
  for (const key of VIEWER_KEYS)
    assert.ok(key in AREA_KEYS || DEVICE_KEYS.includes(key), `ключ «${key}» без раздела`);
  for (const key of Object.keys(AREA_KEYS)) assert.ok(VIEWER_KEYS.includes(key), key);
});

test("смотрящий получает только открытые ему разделы, построчно (033)", () => {
  const data = {
    products: [{ id: "p" }],
    placements: [{ id: "pl" }],
    boxes: [{ id: "b" }],
    templates: [{ id: "t" }],
    expectedShipments: [{ id: "e" }],
    requests: [{ id: "r" }],
    outboundBoxes: [{ id: "o" }],
    shipments: [{ id: "s" }],
    tasks: [
      { id: "t1", kind: "picking" },
      { id: "t2", kind: "item_receiving" },
      { id: "t3", kind: "inventory" },
      { id: "t4", kind: "custom:photo" },
    ],
    docRecords: [
      { id: "d1", kind: "receiving" },
      { id: "d2", kind: "shipment" },
    ],
    disputes: [
      { id: "x1", kind: "damaged" },
      { id: "x2", kind: "inventory_short" },
    ],
    breakPolicy: { mode: "x" },
    warehouse: {
      id: "w",
      floors: [{ id: "f" }],
      staff: [{ id: "s", name: "Иван", role: "Упаковщик", hourlyRate: 300 }],
      manager: { id: "m", name: "Игорь", role: "Директор" },
    },
  };
  const as = (perms) => forViewer(data, (p) => perms.includes(p));
  // Сборщик: сборка, остатки и товары; плана, персонала и спорного нет.
  const picker = as(["picking.view", "stock.view", "products.view"]);
  assert.deepEqual(picker.products, [{ id: "p" }]);
  assert.deepEqual(picker.boxes, [{ id: "b" }]);
  assert.deepEqual(picker.requests, [{ id: "r" }]);
  assert.deepEqual(
    picker.tasks.map((x) => x.id),
    ["t1", "t4"],
  );
  assert.deepEqual(picker.templates, []);
  assert.deepEqual(picker.warehouse.floors, []);
  assert.deepEqual(picker.expectedShipments, []);
  assert.deepEqual(picker.docRecords, []);
  assert.deepEqual(picker.disputes, []);
  assert.deepEqual(picker.breakPolicy, {});
  assert.deepEqual(picker.warehouse.staff, []);
  assert.equal(picker.warehouse.manager, undefined);
  // Приёмщик: документы приёмки, задания приёмки.
  const recv = as(["receiving.view"]);
  assert.deepEqual(
    recv.docRecords.map((x) => x.id),
    ["d1"],
  );
  assert.deepEqual(
    recv.tasks.map((x) => x.id),
    ["t2", "t4"],
  );
  assert.deepEqual(recv.products, []);
  assert.deepEqual(recv.boxes, []);
  // Инвентаризация: её расхождения и задания, но не всё спорное.
  const inv = as(["inventory.view"]);
  assert.deepEqual(
    inv.disputes.map((x) => x.id),
    ["x2"],
  );
  assert.deepEqual(
    inv.tasks.map((x) => x.id),
    ["t3"],
  );
  // Персонал на чтение: имена и должности, без ставок.
  const lead = as(["staff.view", "plan.view"]);
  assert.deepEqual(lead.warehouse.staff, [{ id: "s", name: "Иван", role: "Упаковщик" }]);
  assert.deepEqual(lead.warehouse.manager, { id: "m", name: "Игорь", role: "Директор" });
  assert.deepEqual(lead.warehouse.floors, [{ id: "f" }]);
});
