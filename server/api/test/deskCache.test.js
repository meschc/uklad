// Строки работы склада в памяти стола (`deskCache.js`).
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createDeskCache, cacheKey, rowsOf } = require("../src/cabinet/deskCache");

test("ключ меняется и с версией снимка, и с архивом", () => {
  const day = new Date("2026-11-22T10:00:00Z");
  const k = cacheKey({ version: 7, archive_checked_at: day });
  assert.notEqual(k, cacheKey({ version: 8, archive_checked_at: day }));
  assert.notEqual(k, cacheKey({ version: 7, archive_checked_at: new Date(day.getTime() + 1) }));
  assert.notEqual(k, cacheKey({ version: 7, archive_checked_at: null }));
  assert.equal(k, cacheKey({ version: 7, archive_checked_at: new Date(day) }));
});

test("память отдаёт строки только под тем же ключом и держит не больше max компаний", () => {
  const cache = createDeskCache(2);
  const rows = rowsOf([{ w: "wh_1", d: "requests", ref: "r1", pos: 0, data: { id: "r1" } }]);
  assert.deepEqual(rows, [{ w: "wh_1", d: "requests", data: { id: "r1" } }]);
  cache.put("a", "1|", rows);
  assert.equal(cache.get("a", "1|"), rows);
  assert.equal(cache.get("a", "2|"), null);
  assert.equal(cache.get("b", "1|"), null);
  cache.put("b", "1|", []);
  // «a» прочитали последним — вытесняется «b».
  cache.get("a", "1|");
  cache.put("c", "1|", []);
  assert.equal(cache.size(), 2);
  assert.equal(cache.get("b", "1|"), null);
  assert.equal(cache.get("a", "1|"), rows);
});
