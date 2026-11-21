// Сторож «новое — только в таблицы» (Кирилл 21.11): каждое сохраняемое поле
// кабинета либо уходит в строки и таблицы, либо остаётся устройству, либо
// стоит в списке того, что ещё лежит в снимке. Список только сокращается.
/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const records = require("../src/cabinet/records");

const src = (file) => fs.readFileSync(path.join(__dirname, "../../../src/lib/store", file), "utf8");
const persisted = () => {
  const body = /export function persistedState[\s\S]*?return \{([\s\S]*?)\n {2}\};/.exec(
    src("index.ts"),
  )[1];
  return [...body.matchAll(/^\s{4}([a-zA-Z]+)[:,]/gm)].map((m) => m[1]);
};
/** Части устройства: на сервер не уходят вовсе (`serverSync.ts`). */
const deviceKeys = () => {
  const list = /const DEVICE_KEYS = \[([\s\S]*?)\]/.exec(src("serverSync.ts"))[1];
  return [...list.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
};
/** Таблицы: склады (051, сотрудники и партнёры в них — 054, 055) и товары (013). */
const TABLES = ["warehouse", "otherWarehouses", "products", "warehouseData"];
/** Сколько ключей ещё в снимке — меньше можно, больше нельзя. */
const LEFT_MAX = 0;

test("новое сохраняемое поле — в строки или таблицу, а не в снимок", () => {
  const keys = persisted();
  assert.ok(keys.length > 20, `ключи не нашлись: ${keys}`);
  const rows = new Set([
    ...records.WAREHOUSE_LISTS,
    ...records.COMPANY_LISTS,
    ...Object.values(records.VALUES).flat(),
    ...records.MAPS,
  ]);
  const known = new Set([...rows, ...TABLES, ...deviceKeys(), ...records.SNAPSHOT_LEFT]);
  assert.deepEqual(
    keys.filter((k) => !known.has(k)),
    [],
    "новое поле: положите его в строки (records.js) или таблицу, а не в снимок",
  );
  assert.deepEqual(
    records.SNAPSHOT_LEFT.filter((k) => rows.has(k) || TABLES.includes(k)),
    [],
  );
  assert.ok(records.SNAPSHOT_LEFT.length <= LEFT_MAX, "список снимка только сокращается");
  // Ключ, которого больше нет в кабинете, из списка убирают.
  assert.deepEqual(
    records.SNAPSHOT_LEFT.filter((k) => !keys.includes(k)),
    [],
  );
});

test("в документе снимка после раскладки — только то, что в списке", () => {
  const keys = persisted().filter((k) => !deviceKeys().includes(k));
  const data = Object.fromEntries(keys.map((k) => [k, { probe: k }]));
  Object.assign(data, {
    warehouse: { id: "w1" },
    otherWarehouses: [],
    placements: { p1: { cellIndex: 0 } },
    warehouseData: {},
  });
  const folded = new Set([...Object.keys(records.VALUES), ...records.MAPS]);
  for (const k of [...records.WAREHOUSE_LISTS, ...records.COMPANY_LISTS]) {
    if (!folded.has(k)) data[k] = [{ id: `${k}-1` }];
  }
  for (const k of records.MAPS) data[k] = { a: { probe: k } };
  const { doc } = records.splitRecords(data);
  const left = Object.keys(doc).filter((k) => !records.isMark(doc[k]) && !TABLES.includes(k));
  assert.deepEqual(left.sort(), [...records.SNAPSHOT_LEFT].sort());
});
