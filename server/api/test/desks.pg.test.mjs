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

/** Кабинет компании, как его хранит сервер: документ со строками работы склада. */
async function stored(org) {
  const { assembleRecords } = require("../src/cabinet/records.js");
  const doc = await db.root.query(
    `SELECT version, data FROM uklad.cabinet_snapshots WHERE org_id = $1`,
    [org],
  );
  const rows = await db.root.query(
    `SELECT warehouse_ref AS w, domain AS d, data FROM uklad.cabinet_records
     WHERE org_id = $1 AND deleted_at IS NULL ORDER BY warehouse_ref, domain, position`,
    [org],
  );
  return { version: doc.rows[0].version, data: assembleRecords(doc.rows[0].data, rows.rows) };
}
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

test(
  "руководитель правил кабинет, пока стол собирал: обе правки целы, стол не теряет работу",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("desk-h@sklad.ru", "10.0.3.8");
    const desk = await makeDesk(a);
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const boss = await login("desk-h@sklad.ru");
    const read = () => stored(a.org);
    const start = await read();
    const cell = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
    // Стол уже получил копию версии start. Руководитель в кабинете заводит
    // тару и заявку и кладёт товар на место.
    const edited = {
      ...start.data,
      boxes: [
        { id: "b1", barcode: "UK-BOX-1", address: cell, lines: [{ productId: "pr1", qty: 3 }] },
        { id: "t1", barcode: "UK-BOX-7", lines: [] },
        { id: "b9", barcode: "UK-BOX-9", lines: [{ productId: "pr1", qty: 2 }] },
      ],
      requests: [{ id: "r1", productId: "pr1", qty: 2, status: "new", note: "Тула" }],
    };
    const m = await call("/api/cabinet/snapshot", {
      cookie: boss,
      org: a.org,
      body: { version: start.version, format: 8, data: edited },
    });
    assert.equal(m.status, 200);

    // Версии стол не знает: операция ложится поверх правки руководителя.
    const r = await ops(desk, [
      {
        key: "key-pick-h-001",
        kind: "pick_unit",
        body: {
          eventId: "ev-pick-h-1",
          staffId: "stf-ivan",
          at: Date.now() - 500,
          requestId: "r1",
          productId: "pr1",
          toteId: "t1",
          cell,
        },
      },
    ]);
    assert.deepEqual(r.json.results, [{ key: "key-pick-h-001", status: "applied" }]);
    const end = (await read()).data;
    assert.deepEqual(
      end.boxes.map((b) => [b.id, b.lines[0]?.qty]),
      [
        ["b1", 2],
        ["t1", 1],
        ["b9", 2],
      ],
    );
    assert.equal(end.requests.find((x) => x.id === "r1").pickedQty, 1);
  },
);

/** Пачка операций стола. */
const ops = (desk, list) => call("/api/desk/ops", { desk, body: { ops: list } });

const PLAN = { plan: "start" };
const staff = () => [
  { id: "stf-boss", name: "Игорь", role: "Управляющий склада", hourlyRate: 900, phone: "+7 900" },
  { id: "stf-ivan", name: "Иван", role: "Упаковщик", hourlyRate: 300, email: "i@x.ru" },
  { id: "stf-olga", name: "Ольга", role: "Старший смены", hourlyRate: 500 },
];
const cabinetData = () => ({
  warehouse: {
    id: "wh_1",
    name: "Мезонин",
    staff: staff(),
    partners: [{ id: "p1", name: "ООО Ромашка", contact: "+7 999 000-00-00" }],
  },
  products: [{ id: "pr1", sku: "A-1", name: "Кружка", partnerId: "p1" }],
  docRecords: [{ id: "d1", kind: "shipment", confirmed: true }],
  staffEvents: [{ id: "e1", staffId: "stf-ivan", type: "shift_start", at: 1 }],
  disputes: [
    { id: "q1", kind: "shortage", resolution: "returned" },
    { id: "q2", kind: "extra" },
  ],
  otherWarehouses: [{ id: "wh_2", name: "Второй", staff: staff() }],
  boxes: [{ id: "b1", lines: [{ productId: "pr1", qty: 5 }] }],
  requests: [
    { id: "r1", productId: "pr1", qty: 5, status: "in_progress", note: "Тула" },
    { id: "r2", productId: "pr1", qty: 1, status: "shipped", note: "Тула" },
  ],
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
    ["Игорь", "Иван", "Ольга"],
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

test("стол снимок не пишет: любая запись — 403, версия не растёт", { skip: SKIP }, async () => {
  const { a, ivan } = await company("desk-b@sklad.ru", "10.0.3.2");
  const desk = await makeDesk(a);
  await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  const doc = { version: 1, format: 8, data: { ...cabinetData(), subscription: { plan: "x" } } };
  // Целым документом — ни по версии, ни «только изменённое», ни первой записью.
  for (const path of ["/api/cabinet/snapshot", "/api/cabinet/snapshot/changes"]) {
    for (const body of [doc, { ...doc, version: 0 }]) {
      const r = await call(path, { desk, body });
      assert.equal(r.status, 403);
      assert.equal(r.json.error, "desk");
    }
  }
  const { version, data } = await stored(a.org);
  assert.equal(version, 1);
  assert.equal(data.subscription.plan, "start");

  // Свежее стол подтягивает сам: версия отдельно, снимок — с пометкой стола.
  const v = await call("/api/desk/version", { desk });
  assert.deepEqual([v.status, v.json.version], [200, 1]);
  const snap = await call("/api/cabinet/snapshot", { desk });
  assert.equal(snap.json.desk, true);
  // Руководитель со своим входом — не стол: версии у него нет, снимок без пометки.
  const boss = await login("desk-b@sklad.ru");
  assert.equal((await call("/api/desk/version", { cookie: boss })).status, 404);
  const own = await call("/api/cabinet/snapshot", { cookie: boss, org: a.org });
  assert.equal(own.status, 200);
  assert.equal(own.json.desk, undefined);
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
  // Запись снимка тоже закрыта: стол пишет только операциями.
  const changes = await call("/api/cabinet/snapshot/changes", {
    desk,
    body: { version: 1, format: 8, doc: {}, slots: [], upsert: [], remove: [] },
  });
  assert.equal(changes.status, 403);
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

test("смена стола: отметки только за тем, кто за столом, уход", { skip: SKIP }, async () => {
  const { a, ivan } = await company("desk-g@sklad.ru", "10.0.3.7");
  const desk = await makeDesk(a);
  const mark = (key, staffId, type) => ({
    key,
    kind: "shift_mark",
    body: { eventId: `ev-${key}`, staffId, type, at: Date.now() - 500 },
  });
  const status = async (list) => (await ops(desk, list)).json.results.map((r) => r.status);

  // Пока никто не отсканировал бейдж, отметки смены со стола не принимаются.
  assert.deepEqual(await status([mark("key-g-0001", "stf-ivan", "shift_start")]), ["flagged"]);

  await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  // За себя — да, за другого — нет.
  assert.deepEqual(
    await status([
      mark("key-g-0002", "stf-ivan", "shift_start"),
      mark("key-g-0003", "stf-boss", "shift_start"),
    ]),
    ["applied", "flagged"],
  );

  // Ушёл со стола: он больше не «за столом», но отметки, набранные до ухода,
  // ещё 10 минут догоняют сервер.
  assert.equal((await call("/api/desk/leave", { desk, body: {} })).status, 200);
  assert.deepEqual(await status([mark("key-g-0004", "stf-ivan", "shift_end")]), ["applied"]);

  // Выход под входом руководителя (не стол) — не маршрут стола: 404, а не
  // 401, который закрыл бы кабинет руководителя.
  const boss = await login("desk-g@sklad.ru");
  assert.equal((await call("/api/desk/leave", { cookie: boss, body: {} })).status, 404);
});

test(
  "стол не получает архив: отметка старше окна приходит только руководителю",
  { skip: SKIP },
  async () => {
    const { a } = await company("desk-arch@sklad.ru", "10.0.3.40");
    // Отметка e1 ушла в архив.
    await db.root.query(
      `UPDATE uklad.cabinet_records SET updated_at = now() - interval '60 days'
     WHERE org_id = $1 AND ref = 'e1'`,
      [a.org],
    );
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.staffEvents.length, 0);
    const desk = await makeDesk(a);
    const seen = await call("/api/cabinet/snapshot", { desk });
    assert.equal(seen.json.snapshot.data.staffEvents.length, 0);
  },
);
