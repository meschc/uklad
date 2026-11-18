/**
 * Тариф в кабинете: склад видит назначенное админкой, сам не переключает,
 * а только просит другой — просьба ложится в карточку и гаснет сохранением.
 * Ошибка здесь — снова «склад сам выбрал „Оператора“, а счёт за „Старт“».
 */
/* global require, URL, setImmediate */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { openDb } = require("../src/db");
const { adminStore } = require("../src/admin/store");
const { createInvoices } = require("../src/admin/invoices");
const { createPlan } = require("../src/cabinet/plan");

const NOW = new Date("2026-11-18T10:00:00Z");

function setup({ perms = ["org.manage"], session = true, orgId = "org-1", account = {} } = {}) {
  const db = openDb(":memory:").raw;
  const store = adminStore(db);
  const id = store.addAccount(
    {
      kind: "warehouse",
      name: "Склад Север",
      email: "boss@example.ru",
      tariff: "start",
      price: 6900,
      trial_until: "2027-01-18T10:00:00.000Z",
      ...account,
    },
    NOW,
  );
  const letters = [];
  const sent = [];
  const auth = {
    tokenHash: () => "hash",
    readJson: async (req) => req.body,
    withSession: async (_req, act) => {
      if (!session) return null;
      const c = { query: async () => ({ rows: [{ email: "boss@example.ru" }] }) };
      return act(c, { accountId: "acc", orgId, can: (p) => perms.includes(p) });
    },
  };
  const mail = { sendTo: async (l) => letters.push(l) };
  const api = createPlan({
    auth,
    db,
    send: (_r, status, body) => sent.push({ status, body }),
    mail,
    mailTo: "owner@example.ru",
    now: () => NOW,
    log: { error() {} },
  });
  const call = (method, path, body) =>
    api.handle({ method, body }, {}, new URL(`http://x/api/company/${path}`));
  return { db, store, id, sent, letters, call };
}

test("владелец видит тариф, спеццену и пробный срок из админки", async () => {
  const s = setup({ account: { org_id: "org-1" } });
  await s.call("GET", "plan");
  const { plan } = s.sent[0].body;
  assert.equal(s.sent[0].status, 200);
  assert.equal(plan.tariff, "start");
  assert.equal(plan.price, 6900);
  assert.equal(plan.state, "trial");
  assert.equal(plan.trialUntil, "2027-01-18T10:00:00.000Z");
  assert.equal(plan.invoice, null);
  assert.equal(plan.request, null);
});

test("аккаунт без связки находится по почте владельца и связывается", async () => {
  const s = setup();
  await s.call("GET", "plan");
  assert.equal(s.sent[0].body.plan.tariff, "start");
  assert.equal(s.store.account(s.id).org_id, "org-1");
});

test("связанный с другой компанией аккаунт почтой не перехватить", async () => {
  const s = setup({ account: { org_id: "org-other" } });
  await s.call("GET", "plan");
  assert.deepEqual(s.sent[0].body, { ok: true, plan: null });
  assert.equal(s.store.account(s.id).org_id, "org-other");
});

test("без права org.manage — 403; без сессии — 401", async () => {
  const a = setup({ perms: ["staff.manage"] });
  await a.call("GET", "plan");
  assert.equal(a.sent[0].status, 403);
  const b = setup({ session: false });
  await b.call("GET", "plan");
  assert.equal(b.sent[0].status, 401);
});

test("просьба другого тарифа: тариф не меняется, письмо одно", async () => {
  const s = setup({ account: { org_id: "org-1" } });
  await s.call("POST", "plan/request", { tariff: "operator" });
  assert.equal(s.sent[0].status, 200);
  assert.equal(s.sent[0].body.plan.tariff, "start", "тариф назначает только админка");
  assert.equal(s.sent[0].body.plan.request.tariff, "operator");
  await s.call("POST", "plan/request", { tariff: "operator" });
  await new Promise((r) => setImmediate(r));
  assert.equal(s.letters.length, 1, "повтор той же просьбы письма не шлёт");
  assert.match(s.letters[0].subject, /Оператор/);
  assert.equal(s.store.account(s.id).tariff, "start");
});

test("просьба: свой тариф — 409, корпоративный и чужой ключ — 400", async () => {
  const s = setup({ account: { org_id: "org-1" } });
  await s.call("POST", "plan/request", { tariff: "start" });
  await s.call("POST", "plan/request", { tariff: "corporate" });
  await s.call("POST", "plan/request", { tariff: "free" });
  assert.deepEqual(
    s.sent.map((x) => x.status),
    [409, 400, 400],
  );
});

test("открытый счёт виден кабинету номером, суммой и сроком", async () => {
  const s = setup({ account: { org_id: "org-1" } });
  const bills = createInvoices({ db: s.db, log: { error() {} } });
  const r = bills.issue(s.store.account(s.id), NOW.toISOString());
  await s.call("GET", "plan");
  assert.deepEqual(s.sent[0].body.plan.invoice, {
    number: r.invoice.number,
    amount: 6900,
    dueAt: r.invoice.due_at,
  });
});
