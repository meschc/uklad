/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isCommonPassword } = require("../src/cabinet/commonPasswords");
const { isAcceptable } = require("../src/cabinet/password");

test("частые пароли, ряды и повторы — отказ", () => {
  for (const p of [
    "1234567890",
    "QwertyUiop",
    " password123 ",
    "йцукенгшщз",
    "aaaaaaaaaa",
    "abcabcabcabc",
    "abababababab",
    "9876543210",
    "abcdefghijk",
  ]) {
    assert.equal(isCommonPassword(p), true, p);
    assert.equal(isAcceptable(p), false, p);
  }
});

test("обычный длинный пароль проходит", () => {
  for (const p of [
    "пароль-владельца-1",
    "кот ест сыр на крыше",
    "Tr0ub4dor&3x",
    "неверный-пароль-123",
  ]) {
    assert.equal(isCommonPassword(p), false, p);
    assert.equal(isAcceptable(p), true, p);
  }
});
