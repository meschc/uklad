// Лимиты тарифа и неоплата на сервере (planLimits): сколько людей можно
// завести, решает админка, а не браузер; неоплаченный кабинет — только
// чтение, но столы и отзыв доступа работают. Ошибка здесь — склад на «Старте»
// заводит сотню сотрудников или неоплата останавливает смену.
/* global process, fetch, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
const DAY = 86_400_000;
let db, server, base, cookieName, store;
const sent = [];

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { openDb } = require("../src/db.js");
  const { adminStore } = require("../src/admin/store.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createTeam } = require("../src/cabinet/team.js");
  const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  const { createPlan } = require("../src/cabinet/plan.js");
  const { createPlanLimits } = require("../src/cabinet/planLimits.js");
  db = await helpers.setupDb();
  const admin = openDb(":memory:").raw;
  store = adminStore(admin);
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const limits = createPlanLimits({ db: admin, auth, send });
  const team = createTeam({ auth, cfg, send, log: quiet, limits });
  const badges = createDeskBadges({ auth, send, log: quiet, limits });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const plan = createPlan({ auth, db: admin, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await limits.handle(req, res, url)) ||
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await badges.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)) ||
      (await plan.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 500, ratePerMinute: 500 },
      db: {},
      mail: {},
      cabinet,
      log: quiet,
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (SKIP) return;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.teardown();
});

async function call(method, path, { body, cookie, org, ip = "10.0.7.1" } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), res };
}
const post = (path, o) => call("POST", path, o);
const iso = (days) => new Date(Date.now() + days * DAY).toISOString();

async function lastMail(to) {
  for (let i = 0; i < 50; i++) {
    const m = sent.findLast((x) => x.to === to);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`письма для ${to} нет`);
}

/** Регистрация склада → кука, компания, кабинет и связанный аккаунт админки. */
async function owner(email, ip, account = {}) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await post("/api/auth/register", { body, ip })).status, 202);
  const code = /^(\d{6})/.exec((await lastMail(email)).subject)[1];
  const r = await post("/api/auth/verify", { body: { email, code }, ip });
  const cookie = new RegExp(`${cookieName}=([^;]*)`).exec(r.res.headers.get("set-cookie"))[1];
  const org = r.json.orgId;
  const id = store.addAccount(
    {
      kind: "warehouse",
      name: email,
      email,
      tariff: "start",
      trial_until: iso(30),
      org_id: org,
      ...account,
    },
    new Date(),
  );
  const who = { cookie, org, ip };
  const data = { warehouse: { id: "w1", name: "Склад", staff: [] } };
  const s = await post("/api/cabinet/snapshot", { ...who, body: { version: 0, format: 8, data } });
  assert.equal(s.status, 200, JSON.stringify(s.json));
  return { ...who, id };
}

const issue = (who, staffRef) => post("/api/cabinet/badges/issue", { ...who, body: { staffRef } });

test(
  "лимит сотрудников: новый сверх лимита — отказ, перевыпуск — нет",
  { skip: SKIP },
  async () => {
    // Владелец — первый из двух.
    const a = await owner("limit-a@sklad.ru", "10.0.7.2", { limits: JSON.stringify({ staff: 2 }) });
    assert.equal((await issue(a, "stf-ivan")).status, 200);
    const over = await issue(a, "stf-anna");
    assert.equal(over.status, 409);
    assert.deepEqual(over.json, { ok: false, error: "plan_limit", limit: "staff", max: 2 });
    // Откат: бейджа сверх лимита в базе нет.
    const { rows } = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.desk_badges WHERE org_id = $1 AND revoked_at IS NULL`,
      [a.org],
    );
    assert.equal(rows[0].n, 1);
    // Потерял бейдж — перевыпуск тому же человеку не новый человек.
    assert.equal((await issue(a, "stf-ivan")).status, 200);
    // Тариф понизили ниже числа людей — перевыпуск всё равно проходит.
    store.updateAccount(a.id, { limits: JSON.stringify({ staff: 1 }) }, new Date());
    assert.equal((await issue(a, "stf-ivan")).status, 200);
    // Приглашение по почте — тоже человек.
    const roles = (await call("GET", "/api/team", a)).json.roles;
    const roleId = roles.find((x) => x.name !== "Владелец").id;
    const inv = await post("/api/team/invite", {
      ...a,
      body: { email: "new@sklad.ru", roleId, warehouseRef: "w1" },
    });
    assert.equal(inv.status, 409, JSON.stringify(inv.json));
    assert.equal(inv.json.error, "plan_limit");
  },
);

test("без аккаунта в админке лимита нет", { skip: SKIP }, async () => {
  const a = await owner("limit-b@sklad.ru", "10.0.7.3", { org_id: null });
  for (const ref of ["s1", "s2", "s3"]) assert.equal((await issue(a, ref)).status, 200);
});

test("неоплата: неделя отсрочки, потом правка закрыта, отзыв — нет", { skip: SKIP }, async () => {
  const a = await owner("limit-c@sklad.ru", "10.0.7.4");
  assert.equal((await issue(a, "stf-ivan")).status, 200);
  const write = () => issue(a, "stf-ivan");
  // Срок вышел 3 дня назад — отсрочка, работаем как обычно.
  store.updateAccount(a.id, { trial_until: iso(-3) }, new Date());
  assert.equal((await write()).status, 200);
  // 8 дней — только чтение.
  store.updateAccount(a.id, { trial_until: iso(-8) }, new Date());
  const locked = await write();
  assert.equal(locked.status, 402);
  assert.equal(locked.json.error, "plan_unpaid");
  assert.equal((await call("GET", "/api/cabinet/snapshot", a)).status, 200);
  // Отозвать доступ можно всегда: безопасность от денег не зависит.
  const rv = await post("/api/cabinet/badges/revoke", { ...a, body: { staffRef: "stf-ivan" } });
  assert.equal(rv.status, 200);
  const f = await call("GET", "/api/company/features", a);
  assert.equal(f.json.payment.readOnly, true);
  // Отметили оплату — правка снова открыта.
  store.updateAccount(a.id, { paid_until: iso(30) }, new Date());
  assert.equal((await write()).status, 200);
});

test("функции тарифа с ручным включением из админки", { skip: SKIP }, async () => {
  const a = await owner("limit-d@sklad.ru", "10.0.7.5", {
    features: JSON.stringify({ analytics_full: true }),
  });
  const r = await call("GET", "/api/company/features", a);
  assert.equal(r.status, 200);
  assert.equal(r.json.tariff, "start");
  assert.equal(r.json.features.analytics_full, true, "включено вручную");
  assert.equal(r.json.features.weekly_backup, false, "на «Старте» нет");
  assert.equal(r.json.limits.staff, 10);
  assert.equal(r.json.payment.readOnly, false);
  assert.equal((await call("GET", "/api/company/features", {})).status, 401);
});
