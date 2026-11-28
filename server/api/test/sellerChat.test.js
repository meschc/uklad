// Переписка продавца: разбор тела и отказы без базы (`sellerChat.js`).
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  readSend,
  readEdit,
  sendRefusal,
  sellerChats,
  MAX_MESSAGES,
} = require("../src/cabinet/sellerChat");

const KEY = "k-0001-aaaa";

test("тело отправки: ключ, текст, ответ и тема", () => {
  assert.equal(readSend({ text: "a" }), null);
  assert.equal(readSend({ key: KEY, text: "  " }), null);
  assert.equal(readSend({ key: KEY, text: "a".repeat(4001) }), null);
  assert.equal(readSend({ key: KEY, text: "a", replyTo: "../x" }), null);
  assert.equal(readSend({ key: KEY, text: "a", topic: { kind: "x" } }), null);
  assert.equal(readSend({ key: KEY, text: "a", topic: { kind: "product", productId: 5 } }), null);
  const ok = readSend({
    key: KEY,
    text: " привет ",
    topic: { kind: "product", productId: "p-1", label: "Мыло", extra: 1 },
    from: "warehouse",
  });
  assert.deepEqual(ok, {
    key: KEY,
    text: "привет",
    replyTo: undefined,
    topic: { kind: "product", productId: "p-1", label: "Мыло" },
  });
  assert.equal(readEdit({ id: "m-1", text: "" }), null);
  assert.deepEqual(readEdit({ id: "m-1", text: " да " }), { id: "m-1", text: "да" });
});

test("отказ отправки: ответ вне ленты, чужой товар, переполнение", () => {
  const own = new Set(["p-1"]);
  const feed = [{ id: "m-1" }];
  assert.equal(sendRefusal(feed, own, { replyTo: "m-1" }), null);
  assert.equal(sendRefusal(feed, own, { replyTo: "m-2" }).error, "not_found");
  assert.equal(sendRefusal(feed, own, { topic: { productId: "p-2" } }).error, "not_found");
  const full = Array.from({ length: MAX_MESSAGES }, (_, i) => ({ id: `m${i}` }));
  assert.equal(sendRefusal(full, own, {}).error, "too_many");
});

test("продавцу — только своя лента и без отметки автора", () => {
  const chats = {
    a: [{ id: "1", from: "seller", byMember: "u-1", text: "x", at: 1 }],
    b: [{ id: "2", from: "warehouse", text: "y", at: 2 }],
  };
  assert.deepEqual(sellerChats(chats, "a"), { a: [{ id: "1", from: "seller", text: "x", at: 1 }] });
  assert.deepEqual(sellerChats(chats, "c"), {});
  assert.deepEqual(sellerChats(null, "a"), {});
});
