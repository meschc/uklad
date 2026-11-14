/**
 * Ошибки у пользователей: обезличивание, склейка одинаковых, письмо о новой
 * сразу и сводка раз в сутки — без пустых писем и без лавины.
 */
/* global require, fetch */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { DatabaseSync } = require("node:sqlite");
const {
  parseClientError,
  fingerprintOf,
  errorStore,
  createClientErrors,
} = require("../src/clientErrors");
const { createApp, readEnv } = require("../src/server");
const { openDb } = require("../src/db");

const ORIGIN = "https://u-klad.ru";
const T0 = new Date("2026-11-14T10:00:00Z");
const at = (ms) => new Date(T0.getTime() + ms);
const HOUR = 3_600_000;

function err(over = {}) {
  return { version: 1, source: "screen:inventory", view: "inventory", message: "boom", ...over };
}

function rig() {
  const sent = [];
  const mail = { sendLetter: async (l) => void sent.push(l) };
  const store = errorStore(new DatabaseSync(":memory:"));
  const log = { error() {} };
  return { sent, store, errors: createClientErrors({ store, mail, log }) };
}

test("разбор: почта, телефон и ФИО стираются, строка запроса из стека уходит", () => {
  const r = parseClientError(
    err({
      message: "Не найден ivan@mail.ru, звонить +7 (912) 345-67-89\nвторая строка",
      stack: "at f (https://u-klad.ru/app/assets/i.js?token=abc#x:1:2)\nПетров И. И.",
    }),
  );
  assert.ok(r.ok);
  assert.equal(r.error.message, "Не найден [почта], звонить [телефон]");
  assert.doesNotMatch(r.error.stack, /token|abc|Петров/);
  assert.match(r.error.stack, /https:\/\/u-klad\.ru\/app\/assets\/i\.js/);
});

test("разбор: чужой источник, неизвестная версия и пустой текст не принимаются", () => {
  assert.equal(parseClientError(err({ source: "<script>" })).ok, false);
  assert.equal(parseClientError(err({ version: 2 })).ok, false);
  assert.equal(parseClientError(err({ message: "   " })).ok, false);
  assert.equal(parseClientError(err({ view: "../etc" })).error.view, "");
});

test("отпечаток: номера в тексте не делают ошибку другой", () => {
  const a = fingerprintOf({ source: "window", message: "товар 128 не найден" });
  const b = fingerprintOf({ source: "window", message: "товар 129 не найден" });
  const c = fingerprintOf({ source: "promise", message: "товар 128 не найден" });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("новая ошибка — одно письмо сразу, повтор — только счётчик", () => {
  const { sent, store, errors } = rig();
  const e = parseClientError(err({ message: "товар 1 не найден" })).error;
  assert.equal(errors.accept(e, T0), true);
  assert.equal(errors.accept({ ...e, message: "товар 2 не найден" }, at(1000)), false);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /новая ошибка · inventory/);
  const [row] = store.pending();
  assert.equal(row.count, 2);
});

test("лавина разных ошибок: писем не больше 20 в сутки, остальное — в сводке", () => {
  const { sent, errors } = rig();
  for (let i = 0; i < 30; i++) {
    errors.accept({ source: "window", view: "", message: `сбой ${"x".repeat(i)}`, stack: "" }, T0);
  }
  assert.equal(sent.length, 20);
});

test("сводка: раз в сутки, пустой не бывает, после отправки счётчики с нуля", async () => {
  const { sent, store, errors } = rig();
  // Первый запуск только запоминает время.
  assert.equal(await errors.digestDue(T0), false);
  errors.accept({ source: "window", view: "plan", message: "a", stack: "" }, at(HOUR));
  errors.accept({ source: "window", view: "plan", message: "a", stack: "" }, at(2 * HOUR));
  sent.length = 0;
  assert.equal(await errors.digestDue(at(12 * HOUR)), false, "сутки ещё не прошли");
  assert.equal(await errors.digestDue(at(24 * HOUR)), true);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /ошибки за сутки — 2/);
  assert.match(sent[0].text, /2 × a/);
  assert.equal(store.pending().length, 0);
  // Следующие сутки без ошибок — письма нет.
  assert.equal(await errors.digestDue(at(48 * HOUR)), false);
  assert.equal(sent.length, 1);
});

test("сводка не ушла — счётчики остаются до следующей", async () => {
  const store = errorStore(new DatabaseSync(":memory:"));
  const mail = { sendLetter: async () => Promise.reject(new Error("smtp")) };
  const errors = createClientErrors({ store, mail, log: { error() {} } });
  await errors.digestDue(T0);
  errors.accept({ source: "window", view: "", message: "a", stack: "" }, at(HOUR));
  assert.equal(await errors.digestDue(at(25 * HOUR)), false);
  assert.equal(store.pending().length, 1);
});

test("чистка: старше срока уходит", () => {
  const { store, errors } = rig();
  errors.accept({ source: "window", view: "", message: "a", stack: "" }, T0);
  assert.equal(store.purge(at(89 * 24 * HOUR), 90), 0);
  assert.equal(store.purge(at(91 * 24 * HOUR), 90), 1);
});

test("маршрут: свой источник принят, чужой — 403, мусор — 400", async () => {
  const sent = [];
  const mail = { sendLetter: async (l) => void sent.push(l) };
  const db = openDb(":memory:");
  const cfg = readEnv({ PUBLIC_URL: ORIGIN });
  const server = http.createServer(
    createApp({ cfg, db, mail, now: () => T0, log: { error() {}, log() {} } }),
  );
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/api/support/errors`;
  const post = (body, origin = ORIGIN) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  try {
    assert.equal((await post(err())).status, 200);
    assert.equal(sent.length, 1);
    assert.equal((await post(err(), "https://evil.example")).status, 403);
    assert.equal((await post("{нет")).status, 400);
    assert.equal((await post(err({ source: "x" }))).status, 400);
    assert.equal((await post(err({ message: "y".repeat(10_000) }))).status, 413);
  } finally {
    await new Promise((r) => (server.close(r), server.closeAllConnections()));
  }
});
