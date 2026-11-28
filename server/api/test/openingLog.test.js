/**
 * Ввод начальных остатков: каждый ввод — строкой журнала действий, отметку
 * `opening` у записанного события не ставят и не снимают (иначе настоящую
 * приёмку можно задним числом вывести из счёта продавцу).
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkOpening } = require("../src/cabinet/openingLog");

/** База понарошку: что уже записано в `cabinet_records` и что ушло в журнал. */
function db(stored = []) {
  const audit = [];
  const c = {
    async query(sql, args) {
      if (sql.includes("FROM uklad.cabinet_records")) {
        const refs = new Set(args[0]);
        return { rows: stored.filter((r) => refs.has(r.ref)) };
      }
      if (sql.includes("INSERT INTO uklad.audit_events")) {
        audit.push(args);
        return { rows: [{ id: audit.length }] };
      }
      if (sql.includes("SELECT id, details")) return { rows: [] };
      return { rows: [] };
    },
  };
  return { c, audit };
}
const log = { info() {}, warn() {}, error() {} };
const ev = (ref, data, w = "wh1") => ({ w, d: "receivingEvents", ref, data });

test("новый ввод остатков — одна строка журнала на склад, со штуками", async () => {
  const { c, audit } = db();
  const ok = await checkOpening(c, log, [
    ev("e1", { productId: "p1", qty: 5, opening: true }),
    ev("e2", { productId: "p2", qty: 3, opening: true }),
    ev("e3", { productId: "p1", qty: 2 }), // обычная приёмка — не ввод
    { w: "wh1", d: "boxes", ref: "b1", data: {} },
  ]);
  assert.equal(ok, true);
  assert.equal(audit.length, 1);
  const details = JSON.parse(audit[0].find((a) => typeof a === "string" && a.startsWith("{")));
  assert.deepEqual(details, { lines: 2, qty: 8, ids: ["p1", "p2"] });
});

test("тот же ввод при следующей записи кабинета журнал не повторяет", async () => {
  const { c, audit } = db([{ w: "wh1", ref: "e1", opening: true }]);
  assert.equal(
    await checkOpening(c, log, [ev("e1", { productId: "p1", qty: 5, opening: true })]),
    true,
  );
  assert.equal(audit.length, 0);
});

test("отметку у записанной приёмки поставить нельзя", async () => {
  const { c } = db([{ w: "wh1", ref: "e1", opening: false }]);
  assert.equal(
    await checkOpening(c, log, [ev("e1", { productId: "p1", qty: 5, opening: true })]),
    false,
  );
});

test("и снять у записанного ввода — тоже", async () => {
  const { c } = db([{ w: "wh1", ref: "e1", opening: true }]);
  assert.equal(await checkOpening(c, log, [ev("e1", { productId: "p1", qty: 5 })]), false);
});
