// Вход стола (миграция 011): руководитель делает компьютер столом, его вход
// здесь гаснет; стол читает снимок без ставок, пишет только работу склада,
// в остальной кабинет не ходит и отвязывается бейджем руководителя.
/* global process, fetch, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, server, base, cookieName, deskCookieName;
const sent = [];

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  const { createDesks } = require("../src/cabinet/desks.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const badges = createDeskBadges({ auth, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const desks = createDesks({ auth, cfg, send, log: quiet });
  cookieName = auth.cookieName;
  deskCookieName = desks.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await desks.handle(req, res, url)) ||
      (await auth.handle(req, res, url)) ||
      (await badges.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 50, ratePerMinute: 50 },
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

async function call(path, { body, raw, cookie, desk, org, ip = "10.0.1.1" } = {}) {
  const res = await fetch(base + path, {
    method: body || raw ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body || raw ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(desk ? { Cookie: `${deskCookieName}=${desk}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  return {
    status: res.status,
    json: await res.json().catch(() => null),
    cookies: res.headers.getSetCookie(),
  };
}

/** Регистрация целиком → кука и компания. */
async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await call("/api/auth/register", { body, ip })).status, 202);
  let code;
  for (let i = 0; i < 50 && !code; i++) {
    const m = sent.findLast((x) => x.to === email);
    if (m) code = /^(\d{6})/.exec(m.subject)[1];
    else await new Promise((r) => setTimeout(r, 10));
  }
  const res = await fetch(base + "/api/auth/verify", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ email, code }),
  });
  const token = new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie"))[1];
  return { cookie: token, org: (await res.json()).orgId };
}

const PLAN = { plan: "start" };
const staff = () => [
  { id: "stf-boss", name: "Игорь", role: "Управляющий склада", hourlyRate: 900, phone: "+7 900" },
  { id: "stf-ivan", name: "Иван", role: "Упаковщик", hourlyRate: 300, email: "i@x.ru" },
];
const cabinetData = () => ({
  warehouse: {
    id: "wh_1",
    name: "Мезонин",
    staff: staff(),
    partners: [{ id: "p1", name: "ООО Ромашка", contact: "+7 999 000-00-00" }],
  },
  products: [{ id: "pr1", partnerId: "p1" }],
  docRecords: [{ id: "d1", kind: "shipment", confirmed: true }],
  staffEvents: [{ id: "e1", staffId: "stf-ivan", type: "shift_start", at: 1 }],
  disputes: [
    { id: "q1", kind: "shortage", resolution: "returned" },
    { id: "q2", kind: "extra" },
  ],
  otherWarehouses: [{ id: "wh_2", name: "Второй", staff: staff() }],
  boxes: [{ id: "b1" }],
  chats: { c1: { text: "секрет" } },
  subscription: PLAN,
});

const tokenOf = (cookies, name) =>
  new RegExp(`^${name}=([^;]*)`).exec(cookies.find((c) => c.startsWith(`${name}=`)) ?? "")?.[1];

async function login(email) {
  const r = await call("/api/auth/login", { body: { email, password: PW }, ip: "10.0.3.9" });
  assert.equal(r.status, 200);
  return tokenOf(r.cookies, cookieName);
}

/** Компания со снимком и бейджами → руководитель и коды бейджей. */
async function company(email, ip) {
  const a = await owner(email, ip);
  const first = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: cabinetData() },
  });
  assert.equal(first.status, 200);
  const code = async (staffRef) =>
    (await call("/api/cabinet/badges/issue", { ...a, body: { staffRef } })).json.code;
  return { a, boss: await code("stf-boss"), ivan: await code("stf-ivan") };
}

async function makeDesk(who, deviceRef = "dev-1") {
  const r = await call("/api/cabinet/desks", { ...who, body: { deviceRef, name: "Стол 1" } });
  assert.equal(r.status, 200);
  const desk = tokenOf(r.cookies, deskCookieName);
  assert.ok(desk);
  // Кука входа руководителя в этом браузере стёрта.
  assert.ok(r.cookies.some((c) => c.startsWith(`${cookieName}=;`)));
  return desk;
}

test("стол: вход руководителя гаснет, стол видит снимок без ставок", { skip: SKIP }, async () => {
  const { a, ivan } = await company("desk-a@sklad.ru", "10.0.3.1");
  const desk = await makeDesk(a);
  assert.equal((await call("/api/cabinet/snapshot", a)).status, 401);

  const me = await call("/api/auth/me", { desk });
  assert.equal(me.status, 200);
  assert.equal(me.json.kind, "desk");
  assert.equal(me.json.current.orgId, a.org);

  const snap = (await call("/api/cabinet/snapshot", { desk })).json.snapshot;
  assert.equal(snap.version, 1);
  const people = snap.data.warehouse.staff;
  assert.deepEqual(
    people.map((m) => m.name),
    ["Игорь", "Иван"],
  );
  for (const m of people) {
    assert.equal(m.hourlyRate, undefined);
    assert.equal(m.phone, undefined);
    assert.equal(m.email, undefined);
  }
  assert.equal(snap.data.warehouse.partners[0].contact, undefined);
  assert.equal(snap.data.warehouse.partners[0].name, "ООО Ромашка");
  assert.deepEqual(snap.data.chats, {});
  assert.deepEqual(snap.data.otherWarehouses, []);

  const who = await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  assert.equal(who.json.staffRef, "stf-ivan");
});

test("стол пишет работу склада, но не персонал, тариф и чужие склады", { skip: SKIP }, async () => {
  const { a } = await company("desk-b@sklad.ru", "10.0.3.2");
  const desk = await makeDesk(a);
  const forged = {
    warehouse: {
      id: "wh_1",
      name: "Мезонин",
      staff: [{ id: "stf-x", name: "Чужой", hourlyRate: 1 }],
    },
    otherWarehouses: [],
    boxes: [{ id: "b1" }, { id: "b2" }],
    // Короб отгрузки пишет упаковка за столом.
    outboundBoxes: [{ id: "o1", code: "UK-OUT-TULA01" }],
    chats: {},
    subscription: { plan: "operator" },
    // Товар продавца p1 перекинут другому, документ «исправлен».
    products: [{ id: "pr1", partnerId: "p2" }],
    docRecords: [],
    // Часы смены переписаны, плюс честная новая отметка.
    staffEvents: [
      { id: "e1", staffId: "stf-ivan", type: "shift_start", at: 999 },
      { id: "e2", staffId: "stf-ivan", type: "break_start", at: 2 },
    ],
    // Решённое спорное «перерешено», открытое решено, добавлено новое.
    disputes: [
      { id: "q1", kind: "shortage", resolution: "written_off" },
      { id: "q2", kind: "extra", resolution: "moved", resolvedBy: "stf-boss" },
      { id: "q3", kind: "not_in_tote" },
      { id: "q4", kind: "shortage", resolution: "written_off", resolvedBy: "stf-ivan" },
    ],
  };
  const saved = await call("/api/cabinet/snapshot", {
    desk,
    body: { version: 1, format: 8, data: forged },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.version, 2);
  const { rows } = await db.root.query(
    `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`,
    [a.org],
  );
  const data = rows[0].data;
  assert.deepEqual(
    data.boxes.map((b) => b.id),
    ["b1", "b2"],
  );
  assert.deepEqual(
    data.outboundBoxes.map((b) => b.code),
    ["UK-OUT-TULA01"],
  );
  assert.equal(data.subscription.plan, "start");
  assert.equal(data.warehouse.staff.length, 2);
  assert.equal(data.warehouse.staff[0].hourlyRate, 900);
  assert.equal(data.otherWarehouses.length, 1);
  assert.equal(data.chats.c1.text, "секрет");
  assert.equal(data.products[0].partnerId, "p1");
  assert.equal(data.docRecords.length, 1);
  assert.deepEqual(
    data.staffEvents.map((e) => [e.id, e.at]),
    [
      ["e1", 1],
      ["e2", 2],
    ],
  );
  const disputes = Object.fromEntries(data.disputes.map((d) => [d.id, d]));
  assert.equal(disputes.q1.resolution, "returned");
  assert.equal(disputes.q2.resolution, "moved");
  assert.ok(disputes.q3);
  // Новое приходит только открытым.
  assert.equal(disputes.q4.resolution, undefined);
  assert.equal(disputes.q4.resolvedBy, undefined);
  const { rows: by } = await db.root.query(
    `SELECT updated_by_desk FROM uklad.cabinet_snapshots WHERE org_id = $1`,
    [a.org],
  );
  assert.ok(by[0].updated_by_desk);

  // Работа другого склада поверх этого не ложится.
  const other = await call("/api/cabinet/snapshot", {
    desk,
    body: { version: 2, format: 8, data: { ...forged, warehouse: { id: "wh_2" } } },
  });
  assert.equal(other.status, 409);
  // Первую запись стол не делает.
  const zero = await call("/api/cabinet/snapshot", {
    desk,
    body: { version: 0, format: 8, data: forged },
  });
  assert.equal(zero.status, 400);
});

test("стол не ходит в кабинет: бейджи, стол, чат — 403", { skip: SKIP }, async () => {
  const { a } = await company("desk-c@sklad.ru", "10.0.3.3");
  const desk = await makeDesk(a);
  const issue = await call("/api/cabinet/badges/issue", { desk, body: { staffRef: "stf-ivan" } });
  assert.equal(issue.status, 403);
  const again = await call("/api/cabinet/desks", { desk, body: { deviceRef: "dev-9", name: "x" } });
  assert.equal(again.status, 401);
  assert.equal((await call("/api/chat/threads", { desk })).status, 403);
  assert.equal((await call("/api/auth/account", { desk })).status, 403);
});

test("отвязка бейджем руководителя и отзыв с другого компьютера", { skip: SKIP }, async () => {
  const { a, boss, ivan } = await company("desk-d@sklad.ru", "10.0.3.4");
  const desk = await makeDesk(a);
  const byIvan = await call("/api/desk/unbind", { desk, body: { code: ivan } });
  assert.equal(byIvan.status, 404);
  const byBoss = await call("/api/desk/unbind", { desk, body: { code: boss } });
  assert.equal(byBoss.status, 200);
  assert.equal((await call("/api/auth/me", { desk })).status, 401);

  // Второй стол гасят с другого компьютера руководителя.
  const second = await makeDesk({ cookie: await login("desk-d@sklad.ru"), org: a.org }, "dev-2");
  const office = { cookie: await login("desk-d@sklad.ru"), org: a.org };
  const off = await call("/api/cabinet/desks/revoke", { ...office, body: { deviceRef: "dev-2" } });
  assert.equal(off.json.revoked, 1);
  assert.equal((await call("/api/cabinet/snapshot", { desk: second })).status, 401);
});

test("стол чужой компании бейдж не узнаёт", { skip: SKIP }, async () => {
  const { ivan } = await company("desk-e@sklad.ru", "10.0.3.5");
  const { a: b } = await company("desk-f@sklad.ru", "10.0.3.6");
  const deskB = await makeDesk(b);
  assert.equal((await call("/api/auth/me", { desk: deskB })).status, 200);
  assert.equal(
    (await call("/api/cabinet/badges/check", { desk: deskB, body: { code: ivan } })).status,
    404,
  );
  // Удалённая компания гасит свои столы.
  await db.root.query(`UPDATE uklad.orgs SET deleted_at = now() WHERE id = $1`, [b.org]);
  assert.equal((await call("/api/auth/me", { desk: deskB })).status, 401);
});
