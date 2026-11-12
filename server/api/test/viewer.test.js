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
