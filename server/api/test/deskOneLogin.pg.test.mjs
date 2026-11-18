// Один вход на бейдж: скан за вторым столом снимает сотрудника с первого.
//
// Кирилл 18.11: при 5–10 столах человек уходит, не выйдя, и встаёт за
// соседний стол; за первым его вход жив, и чужая работа там пишется на него —
// журнал, выработка, оплата часов. Здесь, на настоящем Postgres: Иван вошёл
// за стол А, потом за стол Б — стол А узнаёт «вход перехвачен», а отметка,
// сделанная за А до перехвата и дошедшая позже, остаётся Ивана;
// новый вход за столом А весть снимает; одновременный скан двух столов не
// оставляет Ивана за обоими.
// Без PG_ADMIN_URL тест пропускается.
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
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const quiet = { error() {}, warn() {} };
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

async function call(path, { body, cookie, desk, org, ip = "10.0.7.1" } = {}) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(desk ? { Cookie: `${deskCookieName}=${desk}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    json: await res.json().catch(() => null),
    cookies: res.headers.getSetCookie(),
  };
}

const tokenOf = (cookies, name) =>
  new RegExp(`^${name}=([^;]*)`).exec(cookies.find((c) => c.startsWith(`${name}=`)) ?? "")?.[1];

async function login(email) {
  const r = await call("/api/auth/login", { body: { email, password: PW }, ip: "10.0.7.9" });
  assert.equal(r.status, 200);
  return tokenOf(r.cookies, cookieName);
}

/** Склад с Иваном и Ольгой, два стола, бейджи обоих. */
async function company(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await call("/api/auth/register", { body, ip })).status, 202);
  let code;
  for (let i = 0; i < 50 && !code; i++) {
    const m = sent.findLast((x) => x.to === email);
    if (m) code = /^(\d{6})/.exec(m.subject)[1];
    else await pause(10);
  }
  const v = await call("/api/auth/verify", { body: { email, code }, ip });
  const boss = { cookie: tokenOf(v.cookies, cookieName), org: v.json.orgId };
  const data = {
    warehouse: {
      id: "wh_a",
      name: "Складской 5",
      staff: [
        { id: "stf-a", name: "Иван" },
        { id: "stf-c", name: "Ольга" },
      ],
      partners: [{ id: "p1", name: "ООО Ромашка" }],
    },
    devices: [
      { id: "dev-1", name: "Упаковка 1", station: "pack", createdAt: 1 },
      { id: "dev-2", name: "Упаковка 2", station: "pack", createdAt: 1 },
    ],
    products: [],
    staffEvents: [],
    subscription: { plan: "start" },
  };
  const first = await call("/api/cabinet/snapshot", {
    ...boss,
    body: { version: 0, format: 8, data },
  });
  assert.equal(first.status, 200);
  const badge = async (staffRef) =>
    (await call("/api/cabinet/badges/issue", { ...boss, body: { staffRef } })).json.code;
  const ivan = await badge("stf-a");
  const olga = await badge("stf-c");
  const open = async (deviceRef, name) => {
    const r = await call("/api/cabinet/desks", {
      cookie: await login(email),
      org: boss.org,
      body: { deviceRef, name },
    });
    assert.equal(r.status, 200);
    return tokenOf(r.cookies, deskCookieName);
  };
  const d1 = await open("dev-1", "Упаковка 1");
  const d2 = await open("dev-2", "Упаковка 2");
  return { org: boss.org, ivan, olga, d1, d2 };
}

const scan = (desk, code) => call("/api/cabinet/badges/check", { desk, body: { code } });
const version = (desk) => call("/api/desk/version", { desk });
const mark = (key, type, at) => ({
  key,
  kind: "shift_mark",
  body: { eventId: `ev-${key}`, type, at, station: "pack" },
});
const ops = (desk, list) => call("/api/desk/ops", { desk, body: { ops: list } });

/** Кто за каким столом по данным сервера. */
async function seated(org) {
  const { rows } = await db.root.query(
    `SELECT device_ref, CASE WHEN staff_until > now() THEN staff_ref END AS staff
     FROM auth.desk_sessions WHERE org_id = $1 AND revoked_at IS NULL ORDER BY device_ref`,
    [org],
  );
  return rows.map((r) => [r.device_ref, r.staff]);
}

test("вход за вторым столом снимает с первого, первый узнаёт", { skip: SKIP }, async () => {
  const c = await company("one-login-a@sklad.ru", "10.0.7.2");
  assert.equal((await scan(c.d1, c.ivan)).status, 200);
  assert.equal((await version(c.d1)).json.taken, undefined);
  await pause(30);
  const early = Date.now();
  await pause(30);

  assert.equal((await scan(c.d2, c.ivan)).status, 200);
  assert.deepEqual(await seated(c.org), [
    ["dev-1", null],
    ["dev-2", "stf-a"],
  ]);
  const v1 = (await version(c.d1)).json;
  assert.equal(v1.taken.staffRef, "stf-a");
  assert.equal(v1.taken.by, "Упаковка 2");
  assert.ok(Math.abs(v1.taken.at - Date.now()) < 60_000);
  // За вторым столом — его вход, вести там нет.
  assert.equal((await version(c.d2)).json.taken, undefined);

  // Отметка, сделанная за первым столом до перехвата и дошедшая позже, —
  // по-прежнему Ивана: перехват не теряет его работу.
  const r = await ops(c.d1, [mark("key-ol-1", "shift_start", early)]);
  assert.deepEqual(
    r.json.results.map((x) => [x.key, x.status]),
    [["key-ol-1", "applied"]],
  );
  const events = await db.root.query(
    `SELECT staff_ref FROM uklad.desk_ops WHERE org_id = $1 AND op_key = 'key-ol-1'`,
    [c.org],
  );
  assert.deepEqual(events.rows, [{ staff_ref: "stf-a" }]);

  // Повторный скан за вторым столом ничего не меняет у первого.
  assert.equal((await scan(c.d2, c.ivan)).status, 200);
  assert.equal((await version(c.d1)).json.taken.staffRef, "stf-a");

  // За первый стол встала Ольга — весть о перехвате снята.
  assert.equal((await scan(c.d1, c.olga)).status, 200);
  assert.equal((await version(c.d1)).json.taken, undefined);
  assert.deepEqual(await seated(c.org), [
    ["dev-1", "stf-c"],
    ["dev-2", "stf-a"],
  ]);
});

test("выход снимает весть, разные люди друг друга не снимают", { skip: SKIP }, async () => {
  const c = await company("one-login-b@sklad.ru", "10.0.7.3");
  await scan(c.d1, c.ivan);
  await scan(c.d2, c.olga);
  assert.deepEqual(await seated(c.org), [
    ["dev-1", "stf-a"],
    ["dev-2", "stf-c"],
  ]);
  assert.equal((await version(c.d1)).json.taken, undefined);
  assert.equal((await version(c.d2)).json.taken, undefined);

  await scan(c.d1, c.olga);
  assert.equal((await version(c.d2)).json.taken.staffRef, "stf-c");
  // Старый стол вышел (экран «Вход перехвачен» → вход): весть больше не нужна.
  assert.equal((await call("/api/desk/leave", { desk: c.d2, body: {} })).status, 200);
  assert.equal((await version(c.d2)).json.taken, undefined);
});

test("два стола сканируют один бейдж разом — он только за одним", { skip: SKIP }, async () => {
  const c = await company("one-login-c@sklad.ru", "10.0.7.4");
  for (let i = 0; i < 5; i++) {
    const [a, b] = await Promise.all([scan(c.d1, c.ivan), scan(c.d2, c.ivan)]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    const at = (await seated(c.org)).filter(([, s]) => s === "stf-a");
    assert.equal(at.length, 1, `Иван за ${at.length} столами`);
  }
});
