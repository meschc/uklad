/** Хвостовые «/» снимаются за линейное время, даже на враждебной строке. */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { trimSlashes } = require("../src/trimSlashes");

test("снимает только хвостовые «/»", () => {
  assert.equal(trimSlashes("https://u-klad.ru///"), "https://u-klad.ru");
  assert.equal(trimSlashes("/admin/users/"), "/admin/users");
  assert.equal(trimSlashes("///"), "");
  assert.equal(trimSlashes(undefined), "");
  assert.equal(trimSlashes("a//b"), "a//b");
});

test("строка из сотни тысяч «/» не вешает сервер", () => {
  const evil = "/".repeat(100_000) + "x";
  const started = Date.now();
  assert.equal(trimSlashes(evil), evil);
  assert.ok(Date.now() - started < 50);
});
