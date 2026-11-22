// Стол — на складе своего устройства, а не на том, что открыт у руководителя.
//
// Кирилл 14.11 (вслед за #144): стол, куда входят по бейджу, читал и писал
// работу склада, открытого в ту минуту у руководителя. Здесь — второй склад
// той же компании на настоящем Postgres: руководитель переключился на склад
// Б, а стол склада А продолжает работать в А; бейдж склада Б за столом А не
// работает; стол без склада не открывается и ничего не пишет.
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

async function call(path, { body, cookie, desk, org, ip = "10.0.9.1" } = {}) {
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
  const r = await call("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: tokenOf(r.cookies, cookieName), org: r.json.orgId };
}

async function login(email) {
  const r = await call("/api/auth/login", { body: { email, password: PW }, ip: "10.0.9.9" });
  assert.equal(r.status, 200);
  return tokenOf(r.cookies, cookieName);
}

const partners = () => [{ id: "p1", name: "ООО Ромашка" }];
/** «Складской 5»: Иван, стол dev-a, тара с собранным под заявку. */
const whA = { id: "wh_a", name: "Складской 5", staff: [{ id: "stf-a", name: "Иван" }] };
const workA = () => ({
  devices: [{ id: "dev-a", name: "Стол А", station: "pack", createdAt: 1 }],
  boxes: [{ id: "t-a", barcode: "UK-BOX-1", lines: [{ productId: "pr1", qty: 3 }] }],
  requests: [{ id: "r-a", productId: "pr1", qty: 2, status: "done", toteId: "t-a", note: "Тула" }],
  outboundBoxes: [],
});
/** «Логопарк»: Пётр, стол dev-b, своя тара. */
const whB = { id: "wh_b", name: "Логопарк", staff: [{ id: "stf-b", name: "Пётр" }] };
const workB = () => ({
  devices: [{ id: "dev-b", name: "Стол Б", station: "pack", createdAt: 1 }],
  boxes: [{ id: "t-b", barcode: "UK-BOX-9", lines: [{ productId: "pr1", qty: 7 }] }],
  requests: [],
  outboundBoxes: [],
});
const common = () => ({
  products: [{ id: "pr1", sku: "A-1", name: "Кружка", partnerId: "p1" }],
  staffEvents: [],
  subscription: { plan: "start" },
});
/** Снимок, где у руководителя открыт склад А. */
const openA = () => ({
  ...common(),
  warehouse: { ...whA, partners: partners() },
  ...workA(),
  otherWarehouses: [{ ...whB, partners: partners() }],
  warehouseData: { wh_b: workB() },
});
/** Тот же кабинет, руководитель переключился на склад Б. */
const openB = (a = workA()) => ({
  ...common(),
  warehouse: { ...whB, partners: partners() },
  ...workB(),
  otherWarehouses: [{ ...whA, partners: partners() }],
  warehouseData: { wh_a: a },
});

/** Компания с двумя складами, бейджами Ивана (А) и Петра (Б) и столом склада А. */
async function company(email, ip) {
  const a = await owner(email, ip);
  const first = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: openA() },
  });
  assert.equal(first.status, 200);
  const code = async (staffRef) =>
    (await call("/api/cabinet/badges/issue", { ...a, body: { staffRef } })).json.code;
  const ivan = await code("stf-a");
  const petr = await code("stf-b");
  const r = await call("/api/cabinet/desks", {
    ...a,
    body: { deviceRef: "dev-a", name: "Стол А" },
  });
  assert.equal(r.status, 200);
  const desk = tokenOf(r.cookies, deskCookieName);
  return { org: a.org, ivan, petr, desk, boss: { cookie: await login(email), org: a.org } };
}

/** Руководитель переключился на склад Б и сохранил кабинет. */
async function switchToB(boss, version, work) {
  const r = await call("/api/cabinet/snapshot", {
    ...boss,
    body: { version, format: 8, data: openB(work) },
  });
  assert.equal(r.status, 200);
}

const packDone = (key, at = Date.now() - 500) => ({
  key,
  kind: "pack_done",
  body: {
    eventId: `ev-${key}`,
    staffId: "stf-a",
    at,
    toteId: "t-a",
    outboundCode: "UK-OUT-1",
    outboundId: "out-a",
    lines: [{ productId: "pr1", qty: 2 }],
    requestIds: ["r-a"],
  },
});
const ops = (desk, list) => call("/api/desk/ops", { desk, body: { ops: list } });

test(
  "руководитель на складе Б — стол склада А читает и пишет работу А",
  { skip: SKIP },
  async () => {
    const c = await company("wh-desk-a@sklad.ru", "10.0.9.2");
    await switchToB(c.boss, 1);

    // Снимок стола — склад А, хотя у руководителя открыт Б.
    const snap = (await call("/api/cabinet/snapshot", { desk: c.desk })).json.snapshot.data;
    assert.equal(snap.warehouse.id, "wh_a");
    assert.deepEqual(
      snap.boxes.map((b) => b.id),
      ["t-a"],
    );
    assert.deepEqual(
      snap.devices.map((d) => d.id),
      ["dev-a"],
    );
    assert.deepEqual(snap.otherWarehouses, []);
    assert.deepEqual(snap.warehouseData, {});

    // Бейдж Логопарка за столом «Складской 5» не работает.
    const foreign = await call("/api/cabinet/badges/check", {
      desk: c.desk,
      body: { code: c.petr },
    });
    assert.deepEqual([foreign.status, foreign.json.error], [409, "other_warehouse"]);
    const own = await call("/api/cabinet/badges/check", { desk: c.desk, body: { code: c.ivan } });
    assert.deepEqual([own.status, own.json.staffRef], [200, "stf-a"]);

    // Упаковка ложится в работу склада А, а не в открытый у руководителя Б.
    const r = await ops(c.desk, [packDone("key-wh-pack-1")]);
    assert.deepEqual(r.json.results, [{ key: "key-wh-pack-1", status: "applied" }]);
    const mine = (await call("/api/cabinet/snapshot", c.boss)).json.snapshot.data;
    assert.equal(mine.warehouse.id, "wh_b");
    assert.deepEqual(
      mine.boxes.map((b) => [b.id, b.lines[0].qty]),
      [["t-b", 7]],
    );
    assert.deepEqual(mine.outboundBoxes, []);
    const a = mine.warehouseData.wh_a;
    assert.deepEqual(a.boxes[0].lines, [{ productId: "pr1", qty: 1 }]);
    assert.deepEqual(a.outboundBoxes[0].lines, [{ productId: "pr1", qty: 2 }]);
    assert.equal(a.requests[0].packedBy, "stf-a");
    assert.deepEqual(
      a.devices.map((d) => d.id),
      ["dev-a"],
    );
    // Журнал движений — тоже по складу А.
    const moves = await db.root.query(
      `SELECT warehouse_ref, place_kind, place_ref, delta FROM uklad.stock_moves
       WHERE org_id = $1 AND desk_id IS NOT NULL ORDER BY place_kind`,
      [c.org],
    );
    assert.deepEqual(
      moves.rows.map((m) => [m.warehouse_ref, m.place_kind, m.place_ref, m.delta]),
      [
        ["wh_a", "box", "t-a", -2],
        ["wh_a", "outbound", "out-a", 2],
      ],
    );
  },
);

test("стол без склада: не открыть, снимка нет, операции помечены", { skip: SKIP }, async () => {
  const c = await company("wh-desk-b@sklad.ru", "10.0.9.3");
  // Устройства нет ни на одном складе — стол не открыть.
  const none = await call("/api/cabinet/desks", {
    ...c.boss,
    body: { deviceRef: "dev-zz", name: "Стол" },
  });
  assert.deepEqual([none.status, none.json.error], [409, "desk_warehouse"]);

  await call("/api/cabinet/badges/check", { desk: c.desk, body: { code: c.ivan } });
  // Руководитель переключился на Б и снял устройство со склада А.
  await switchToB(c.boss, 1, { ...workA(), devices: [] });
  const snap = await call("/api/cabinet/snapshot", { desk: c.desk });
  assert.deepEqual([snap.status, snap.json.error], [403, "desk_warehouse"]);
  const badge = await call("/api/cabinet/badges/check", {
    desk: c.desk,
    body: { code: c.ivan },
  });
  assert.deepEqual([badge.status, badge.json.error], [409, "desk_warehouse"]);
  // Факт не теряется — он в журнале операций, но в работу склада не идёт.
  const r = await ops(c.desk, [packDone("key-wh-pack-2")]);
  assert.deepEqual(r.json.results, [
    { key: "key-wh-pack-2", status: "flagged", reason: "warehouse" },
  ]);
  assert.equal(r.json.version, r.json.before);
  const log = await db.root.query(
    `SELECT status, reason FROM uklad.desk_ops WHERE org_id = $1 AND op_key = 'key-wh-pack-2'`,
    [c.org],
  );
  assert.deepEqual(log.rows, [{ status: "flagged", reason: "warehouse" }]);
});

test("стол склада Б открывают, пока у руководителя открыт А: он на Б", { skip: SKIP }, async () => {
  const c = await company("wh-desk-c@sklad.ru", "10.0.9.4");
  const r = await call("/api/cabinet/desks", {
    cookie: await login("wh-desk-c@sklad.ru"),
    org: c.org,
    body: { deviceRef: "dev-b", name: "Стол Б" },
  });
  assert.equal(r.status, 200);
  const deskB = tokenOf(r.cookies, deskCookieName);
  const snap = (await call("/api/cabinet/snapshot", { desk: deskB })).json.snapshot.data;
  assert.equal(snap.warehouse.id, "wh_b");
  assert.deepEqual(
    snap.boxes.map((b) => b.id),
    ["t-b"],
  );
  // Иван со склада А за столом Б не работает, Пётр — работает.
  const ivan = await call("/api/cabinet/badges/check", { desk: deskB, body: { code: c.ivan } });
  assert.deepEqual([ivan.status, ivan.json.error], [409, "other_warehouse"]);
  const petr = await call("/api/cabinet/badges/check", { desk: deskB, body: { code: c.petr } });
  assert.equal(petr.status, 200);
  // Упаковка Ивана в таре склада А со стола Б не проходит: тары там нет,
  // а Иван за этим столом не стоит.
  const pack = await ops(deskB, [packDone("key-wh-pack-3")]);
  assert.equal(pack.json.results[0].status, "flagged");
  const boss = (await call("/api/cabinet/snapshot", c.boss)).json.snapshot.data;
  assert.deepEqual(boss.boxes[0].lines, [{ productId: "pr1", qty: 3 }]);
});

// Кирилл 22.11: склады одной компании связывает только владелец. Начальник
// склада Б не заводит и не отвязывает стол склада А своим бейджем.
test("стол склада А не подтвердить руководителем склада Б", { skip: SKIP }, async () => {
  const c = await company("wh-desk-bind@sklad.ru", "10.0.9.6");
  await db.root.query(
    `INSERT INTO uklad.desk_staff_roles (org_id, staff_ref, role_id)
     SELECT $1, 'stf-b', id FROM uklad.roles WHERE org_id = $1 AND name = 'Начальник склада'
     ON CONFLICT (org_id, staff_ref) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [c.org],
  );
  const check = (warehouseRef) =>
    call("/api/cabinet/desks/check", { ...c.boss, body: { code: c.petr, warehouseRef } });
  const there = await check("wh_a");
  assert.deepEqual([there.status, there.json.error], [422, "other_warehouse"]);
  assert.equal((await check("wh_b")).status, 200);
  // Без склада проверка не проходит: неизвестно, чей это стол.
  assert.equal((await check(undefined)).status, 409);
  const bind = await call("/api/cabinet/desks", {
    ...c.boss,
    body: { deviceRef: "dev-a", name: "Стол А", code: c.petr },
  });
  assert.deepEqual([bind.status, bind.json.error], [422, "other_warehouse"]);
  // Отвязать стол А бейджем Петра — тоже нет.
  const off = await call("/api/desk/unbind", { desk: c.desk, body: { code: c.petr } });
  assert.deepEqual([off.status, off.json.error], [404, "not_manager"]);
});

test("стол склада А не отвязать паролем руководителя склада Б", { skip: SKIP }, async () => {
  const c = await company("wh-desk-unbind@sklad.ru", "10.0.9.7");
  // Второй человек компании: начальник склада Б со своей почтой.
  const chief = "wh-desk-unbind-b@sklad.ru";
  await db.root.query(
    `WITH acc AS (
       INSERT INTO auth.accounts (email, password_hash, email_verified_at)
       SELECT $2, password_hash, now() FROM auth.accounts WHERE email = $3 RETURNING id)
     INSERT INTO uklad.members (org_id, account_id, role_id, status, warehouse_ref)
     SELECT $1, acc.id, r.id, 'active', 'wh_b' FROM acc, uklad.roles r
     WHERE r.org_id = $1 AND r.name = 'Начальник склада'`,
    [c.org, chief, "wh-desk-unbind@sklad.ru"],
  );
  const off = await call("/api/desk/unbind", {
    desk: c.desk,
    body: { email: chief, password: PW },
  });
  assert.deepEqual([off.status, off.json.error], [404, "not_manager"]);
  // Владелец — отвязывает.
  const own = await call("/api/desk/unbind", {
    desk: c.desk,
    body: { email: "wh-desk-unbind@sklad.ru", password: PW },
  });
  assert.equal(own.status, 200);
});
