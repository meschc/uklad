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

function setup({
  perms = ["org.manage"],
  session = true,
  orgId = "org-1",
  account = {},
  orgs = [{ org_id: "org-1", role_name: "Владелец" }],
  email = "boss@example.ru",
} = {}) {
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
      return act({}, { accountId: "acc", orgId, can: (p) => perms.includes(p) });
    },
    tx: async (fn) =>
      fn({
        query: async (sql) => ({ rows: /my_orgs/.test(sql) ? orgs : [{ email }] }),
      }),
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

test("владелец в двух компаниях — без связки: аккаунт не уйдёт в чужую", async () => {
  const s = setup({
    orgId: "org-b",
    orgs: [
      { org_id: "org-a", role_name: "Владелец" },
      { org_id: "org-b", role_name: "Владелец" },
    ],
  });
  await s.call("GET", "plan");
  assert.deepEqual(s.sent[0].body, { ok: true, plan: null });
  assert.equal(s.store.account(s.id).org_id, null);
});

test("не создатель компании — без связки, даже с org.manage", async () => {
  const s = setup({ orgs: [{ org_id: "org-1", role_name: "Руководитель" }] });
  await s.call("GET", "plan");
  assert.equal(s.sent[0].body.plan, null);
  assert.equal(s.store.account(s.id).org_id, null);
});

test("почта сравнивается без учёта регистра", async () => {
  const s = setup({ email: "Boss@Example.RU" });
  await s.call("GET", "plan");
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
  // Чередование тарифов в течение часа писем не множит.
  await s.call("POST", "plan/request", { tariff: "warehouse" });
  await s.call("POST", "plan/request", { tariff: "operator" });
  await new Promise((r) => setImmediate(r));
  assert.equal(s.letters.length, 1);
  assert.equal(s.store.account(s.id).tariff_request, "operator");
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

test("просьбу можно снять; решённой (уже нет) или чужой отмены не бывает", async () => {
  const s = setup({ account: { org_id: "org-1" } });
  await s.call("POST", "plan/cancel");
  assert.equal(s.sent[0].status, 409, "снимать нечего");
  await s.call("POST", "plan/request", { tariff: "operator" });
  await s.call("POST", "plan/cancel");
  assert.equal(s.sent[2].status, 200);
  assert.equal(s.sent[2].body.plan.request, null);
  assert.equal(s.store.account(s.id).tariff_request, null);
  // Админка подтвердила — просьбы нет, «отмена» тариф назад не вернёт.
  s.store.updateAccount(s.id, { tariff: "operator" }, NOW);
  await s.call("POST", "plan/cancel");
  assert.equal(s.sent[3].status, 409);
  assert.equal(s.store.account(s.id).tariff, "operator");
});

test("отмена просьбы — только владелец", async () => {
  const s = setup({ account: { org_id: "org-1" }, perms: ["staff.manage"] });
  await s.call("POST", "plan/cancel");
  assert.equal(s.sent[0].status, 403);
});

test("разница за смену тарифа: в следующем счёте один раз, туда и обратно — ноль", () => {
  const plans = require("../src/admin/plans");
  const s = setup({
    account: { org_id: "org-1", price: 5900, paid_until: "2026-12-18T10:00:00.000Z" },
  });
  const nowIso = NOW.toISOString();
  const up = plans.switchAdjustment(s.store.account(s.id), "warehouse", nowIso);
  assert.equal(up, 7000);
  const back = plans.switchAdjustment(
    { ...s.store.account(s.id), tariff: "warehouse", price: 12900 },
    "start",
    nowIso,
  );
  assert.equal(up + back, 0, "смена туда и обратно в один момент сходится");
  // Пробный период не оплачен — разницы нет; договорная цена — тоже.
  assert.equal(
    plans.switchAdjustment({ tariff: "start", price: 5900, paid_until: null }, "operator", nowIso),
    0,
  );
  assert.equal(plans.switchAdjustment(s.store.account(s.id), "custom", nowIso), 0);

  // Счёт: разница входит одной строкой, аккаунт обнуляется, отмена возвращает.
  s.store.updateAccount(s.id, { tariff_adjust: 7000, tariff: "warehouse", price: 12900 }, NOW);
  const bills = createInvoices({ db: s.db, log: { error() {} } });
  const r = bills.issue(s.store.account(s.id), nowIso);
  assert.equal(r.invoice.amount, 12900 + 7000);
  assert.equal(r.invoice.adjustment, 7000);
  assert.equal(s.store.account(s.id).tariff_adjust, 0);
  bills.cancel(r.invoice.id, null);
  assert.equal(s.store.account(s.id).tariff_adjust, 7000, "отменённый счёт вернул разницу");
  const again = bills.issue(s.store.account(s.id), nowIso);
  assert.equal(again.invoice.amount, 19900);
  // Зачёт больше счёта: счёт не нулевой, остаток едет дальше.
  bills.cancel(again.invoice.id, null);
  s.store.updateAccount(s.id, { tariff_adjust: -50000 }, NOW);
  const credit = bills.issue(s.store.account(s.id), nowIso);
  assert.equal(credit.invoice.amount, 1);
  assert.equal(s.store.account(s.id).tariff_adjust, -50000 + 12899);
});
