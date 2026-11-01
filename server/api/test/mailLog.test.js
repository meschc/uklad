// Журнал писем входа: адрес получателя в ответе SMTP не должен попасть в лог.
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { maskAddress } = require("../src/cabinet/auth.js");

test("ошибка SMTP с адресом → в журнале ***", () => {
  const to = "someone@gmail.com";
  const err = `550 5.1.1 <${to}>: Recipient address rejected, ${to}`;
  const out = maskAddress(err, to);
  assert.ok(!out.includes(to));
  assert.equal(out, "550 5.1.1 <***>: Recipient address rejected, ***");
});

test("длинный ответ режется до 200 символов, пустой — пустая строка", () => {
  assert.equal(maskAddress("x".repeat(500), "a@b.ru").length, 200);
  assert.equal(maskAddress(undefined, "a@b.ru"), "");
});
