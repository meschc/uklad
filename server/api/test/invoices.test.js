/**
 * Счета: выставляются сами за 7 дней до конца срока, одним на аккаунт, и
 * «Оплачено» продлевает ровно один раз. Ошибка здесь выглядит как «всё
 * работает», пока склад не получит второй счёт или не потеряет оплаченный месяц.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { openDb } = require("../src/db");
const { adminStore } = require("../src/admin/store");
const { createInvoices, readPayee } = require("../src/admin/invoices");

const PAYEE = {
  PAYEE_NAME: "Иванов Иван Иванович",
  PAYEE_INN: "000000000000",
  PAYEE_BANK: "Банк",
  PAYEE_BIK: "000000000",
  PAYEE_ACCOUNT: "40817810000000000000",
  PAYEE_CORR_ACCOUNT: "30101810000000000000",
};

function setup({ trialUntil, kind = "warehouse", period = "month" } = {}) {
  const db = openDb(":memory:").raw;
  const store = adminStore(db);
  const now = new Date("2026-11-10T10:00:00Z");
  const id = store.addAccount(
    {
      kind,
      name: "Склад Север",
      email: "buh@example.ru",
      tariff: "warehouse",
      period,
      trial_until: trialUntil,
    },
    now,
  );
  const letters = [];
  const invoices = createInvoices({
    db,
    payee: readPayee(PAYEE),
    send: async (m) => letters.push(m),
    log: { error() {} },
  });
  return { db, store, invoices, id, letters };
}

test("без реквизитов счета не выставляются", () => {
  assert.equal(readPayee({ ...PAYEE, PAYEE_BIK: " " }), null);
});

test("за 7 дней до конца пробного — один счёт и одно письмо", async () => {
  const { invoices, letters } = setup({ trialUntil: "2026-11-15T20:59:59.999Z" });
  const made = await invoices.issueDue("2026-11-10T10:00:00.000Z");
  assert.equal(made.length, 1);
  assert.equal(made[0].number, "UK-2026-0001");
  assert.equal(made[0].amount, 9900);
  assert.equal(made[0].due_at, "2026-11-15T20:59:59.999Z");
  assert.equal(letters.length, 1);
  assert.match(letters[0].text, /UK-2026-0001/);
  assert.equal((await invoices.issueDue("2026-11-11T10:00:00.000Z")).length, 0, "второй обход");
});

test("рано и продавцам счёт не выставляется", async () => {
  assert.equal(
    (
      await setup({ trialUntil: "2026-12-30T00:00:00Z" }).invoices.issueDue(
        "2026-11-10T10:00:00.000Z",
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await setup({ trialUntil: "2026-11-12T00:00:00Z", kind: "seller" }).invoices.issueDue(
        "2026-11-10T10:00:00.000Z",
      )
    ).length,
    0,
  );
});

test("«Оплачено» продлевает от конца срока и только один раз", async () => {
  const { store, invoices, id } = setup({ trialUntil: "2026-11-15T20:59:59.999Z", period: "half" });
  const [inv] = await invoices.issueDue("2026-11-10T10:00:00.000Z");
  assert.equal(inv.amount, 9900 * 6);
  store.updateAccount(id, { paid_until: "2026-11-15T20:59:59.999Z" }, new Date());
  const r = invoices.markPaid(inv.id, "2026-11-12T10:00:00.000Z", 1);
  assert.equal(r.paidUntil, "2027-05-15T20:59:59.999Z");
  assert.ok(invoices.markPaid(inv.id, "2026-11-12T10:01:00.000Z", 1).error);
  assert.equal(store.account(id).paid_until, "2027-05-15T20:59:59.999Z");
  assert.equal(store.paymentsOf(id).length, 1);
});

test("поиск по строке выписки: номер, сумма", async () => {
  const { invoices } = setup({ trialUntil: "2026-11-15T20:59:59.999Z" });
  await invoices.issueDue("2026-11-10T10:00:00.000Z");
  assert.equal(invoices.find("Оплата по счёту № uk-2026-0001 за доступ").length, 1);
  assert.equal(invoices.find("9 900,00").length, 1);
  assert.equal(invoices.find("UK-2026-0002").length, 0);
});

test("оплата во время пробного не съедает пробные дни", async () => {
  const { invoices } = setup({ trialUntil: "2026-11-15T20:59:59.999Z" });
  const [inv] = await invoices.issueDue("2026-11-10T10:00:00.000Z");
  assert.equal(
    invoices.markPaid(inv.id, "2026-11-10T11:00:00.000Z", 1).paidUntil,
    "2026-12-15T20:59:59.999Z",
  );
});

test("отменённый счёт обход не возвращает", async () => {
  const { invoices, letters } = setup({ trialUntil: "2026-11-15T20:59:59.999Z" });
  const [inv] = await invoices.issueDue("2026-11-10T10:00:00.000Z");
  invoices.cancel(inv.id, 1);
  assert.equal((await invoices.issueDue("2026-11-10T11:00:00.000Z")).length, 0);
  assert.equal(letters.length, 1);
});

test("письмо, которое не ушло, уходит следующим обходом", async () => {
  const { db, letters } = setup({ trialUntil: "2026-11-15T20:59:59.999Z" });
  let down = true;
  const flaky = createInvoices({
    db,
    payee: readPayee(PAYEE),
    send: async (m) => {
      if (down) throw new Error("почта лежит");
      letters.push(m);
    },
    log: { error() {} },
  });
  await flaky.issueDue("2026-11-10T10:00:00.000Z");
  assert.equal(letters.length, 0);
  down = false;
  await flaky.issueDue("2026-11-10T11:00:00.000Z");
  assert.equal(letters.length, 1);
});
