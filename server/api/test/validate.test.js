/** Почта на сервере — те же примеры, что у кабинета. */
/* global require, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { isEmail } = require("../src/validate");
const cases = require(path.join(__dirname, "../../../src/lib/__tests__/validate.cases.json"));

test("годные адреса проходят", () => {
  for (const v of cases.email.ok) assert.equal(isEmail(v), true, v);
});

test("мусор не проходит", () => {
  for (const v of cases.email.bad) assert.equal(isEmail(v), false, v);
  assert.equal(isEmail(""), false);
  assert.equal(isEmail(null), false);
});
