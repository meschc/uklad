// Руководитель склада на остальных маршрутах — только свой склад, а реквизиты
// и тариф компании — только владельцу (Кирилл 22.11: «разные склады связывает
// только владелец»). Без PG_ADMIN_URL тест пропускается.
/* global process, fetch, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, server, base, cookieName;
const sent = [];

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createTeam } = require("../src/cabinet/team.js");
  const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  const { createJournal } = require("../src/cabinet/journal.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const team = createTeam({ auth, cfg, send, log: quiet });
  const badges = createDeskBadges({ auth, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const journal = createJournal({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await badges.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)) ||
      (await journal.handle(req, res, url)),
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

async function call(method, path, { body, cookie, org, ip = "10.0.2.1" } = {}) {
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
const cookieOf = (res) =>
  new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie"))[1];

async function lastMail(to) {
  for (let i = 0; i < 50; i++) {
    const m = sent.findLast((x) => x.to === to);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`письма для ${to} нет`);
}

/** Регистрация склада целиком → кука и компания. */
async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await post("/api/auth/register", { body, ip })).status, 202);
  const code = /^(\d{6})/.exec((await lastMail(email)).subject)[1];
  const r = await post("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: cookieOf(r.res), org: r.json.orgId, ip };
}

const tokenIn = (mail) => /#invite=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];

async function roles(who) {
  await ensureCabinet(who);
  const r = await call("GET", "/api/team", who);
  return Object.fromEntries(r.json.roles.map((x) => [x.name, x.id]));
}

/** Склад, на который зовут в этих тестах (миграция 034: без склада смотрящего не зовут). */
const WH = "w1";

/** Текущая версия кабинета компании. */
async function version(who) {
  return (await call("GET", "/api/cabinet/snapshot", who)).json.snapshot?.version ?? 0;
}

/** У компании ещё нет кабинета — завести с одним складом `WH`. */
async function ensureCabinet(who) {
  const cur = await call("GET", "/api/cabinet/snapshot", who);
  if (cur.json?.snapshot) return;
  const data = { warehouse: { id: WH, name: "Склад", staff: [] } };
  const r = await post("/api/cabinet/snapshot", { ...who, body: { version: 0, format: 8, data } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}

/** Тело приглашения со складом `WH`. */
async function inviteBody(who, body) {
  await ensureCabinet(who);
  return { warehouseRef: WH, ...body };
}

/** Пригласить и принять новым человеком → его кука. */
async function join(who, email, roleId, place = {}) {
  const body = await inviteBody(who, { email, roleId, ...place });
  const inv = await post("/api/team/invite", { ...who, body });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  const token = tokenIn(await lastMail(email));
  const acc = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
    ip: who.ip,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  return { cookie: cookieOf(acc.res), org: acc.json.orgId, ip: who.ip, token };
}

/** Компания с двумя складами, начальник склада `WH` и человек склада `w2`. */
async function world(tag, ip) {
  const boss = await owner(`boss-${tag}@example.com`, ip);
  const r = await roles(boss);
  const data = {
    warehouse: { id: WH, name: "Склад", staff: [] },
    otherWarehouses: [{ id: "w2", name: "Склад 2", staff: [] }],
    account: { name: "ООО Ромашка", inn: "7700000000" },
    subscription: { plan: "start" },
  };
  const put = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: await version(boss), format: 8, data },
  });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const chief = await join(boss, `chief-${tag}@example.com`, r["Начальник склада"]);
  const w2Role = (await call("GET", "/api/team", boss)).json.roles.find(
    (x) => x.name === "Старший смены" && x.warehouseRef === "w2",
  );
  const inv = await post("/api/team/invite", {
    ...boss,
    body: { email: `other-${tag}@example.com`, roleId: w2Role.id, warehouseRef: "w2" },
  });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  const token = tokenIn(await lastMail(`other-${tag}@example.com`));
  const acc = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
    ip,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  const team = (await call("GET", "/api/team", boss)).json;
  const other = team.members.find((m) => m.email === `other-${tag}@example.com`);
  const { rows } = await db.root.query(
    `SELECT id, ref FROM uklad.warehouses WHERE org_id = $1 AND deleted_at IS NULL`,
    [boss.org],
  );
  const whId = Object.fromEntries(rows.map((w) => [w.ref, w.id]));
  return { boss, chief, other, whId };
}

test(
  "начальник склада не выпускает и не гасит бейдж человеку чужого склада",
  { skip: SKIP },
  async () => {
    const { boss, chief, other, whId } = await world("badge", "10.1.0.70");
    const issue = (who, warehouseId) =>
      post("/api/staff/badge", { ...who, body: { memberId: other.id, warehouseId } });
    assert.equal((await issue(chief, whId.w2)).status, 404);
    assert.equal((await issue(chief, whId[WH])).status, 404);
    const revoke = await post("/api/staff/badge/revoke", {
      ...chief,
      body: { memberId: other.id },
    });
    assert.equal(revoke.status, 404);
    // Владелец — может: дело не в бейдже, а в чужом складе.
    assert.equal((await issue(boss, whId.w2)).status, 200);
  },
);

test("журнал и занятость чужого склада начальнику не отдаются", { skip: SKIP }, async () => {
  const { boss, chief } = await world("journal", "10.1.0.71");
  const j = (who, w) => call("GET", `/api/cabinet/journal?warehouse=${w}`, who);
  assert.equal((await j(chief, WH)).status, 200);
  assert.equal((await j(chief, "w2")).status, 403);
  assert.equal((await j(boss, "w2")).status, 200);
  const s = (who, w) =>
    call("GET", `/api/cabinet/storage?from=2026-11-01&to=2026-11-02&warehouse=${w}`, who);
  assert.equal((await s(chief, WH)).status, 200);
  assert.equal((await s(chief, "w2")).status, 403);
  assert.equal((await s(boss, "w2")).status, 200);
  const inv = await call("GET", "/api/cabinet/inventory?from=2026-11-01&to=2026-11-02", chief);
  assert.notEqual(inv.status, 403, JSON.stringify(inv.json));
});

test("реквизиты и тариф компании меняет только владелец", { skip: SKIP }, async () => {
  const { splitRecords } = require("../src/cabinet/records.js");
  const { boss, chief } = await world("account", "10.1.0.72");
  const seen = (await call("GET", "/api/cabinet/snapshot", chief)).json.snapshot.data;
  // Запись целиком: реквизиты и тариф из присланного не берутся.
  const whole = await post("/api/cabinet/snapshot", {
    ...chief,
    body: {
      version: await version(chief),
      format: 8,
      data: { ...seen, account: { name: "Чужое ООО" }, subscription: { plan: "max" } },
    },
  });
  assert.equal(whole.status, 200, JSON.stringify(whole.json));
  let full = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
  assert.equal(full.account.name, "ООО Ромашка");
  assert.equal(full.subscription.plan, "start");
  // «Только изменённое»: строка реквизитов от начальника — отказ.
  const mine = (await call("GET", "/api/cabinet/snapshot", chief)).json.snapshot.data;
  const now = splitRecords({ ...mine, account: { name: "Чужое ООО" } });
  const upsert = now.items.filter((x) => x.d === "companySettings" && x.ref === "account");
  assert.equal(upsert.length, 1);
  const doc = { ...now.doc };
  delete doc.products;
  const bad = await post("/api/cabinet/snapshot/changes", {
    ...chief,
    body: { version: await version(chief), format: 8, doc, slots: now.slots, upsert, remove: [] },
  });
  assert.equal(bad.status, 403);
  full = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
  assert.equal(full.account.name, "ООО Ромашка");
  // Владелец меняет реквизиты как раньше.
  const ok = await post("/api/cabinet/snapshot", {
    ...boss,
    body: {
      version: await version(boss),
      format: 8,
      data: { ...full, account: { name: "ООО Лютик" } },
    },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});
