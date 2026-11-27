// Загрузка резервной копии в кабинет с сервером (`restore.js`, Кирилл 27.11):
// копия заменяет работу склада и товары, но не удаляет людей, склады и
// партнёров; во время смены и без кабинета — отказ. Без PG_ADMIN_URL тест
// пропускается.
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
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {}, warn() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) || (await snapshot.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 200, ratePerMinute: 200 },
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

async function call(path, { body, cookie, org, ip = "10.0.3.1" } = {}) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
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
  const token = new RegExp(`${cookieName}=([^;]*)`).exec(r.res.headers.get("set-cookie"))[1];
  return { cookie: token, org: r.json.orgId, ip };
}

const product = (id) => ({ id, sku: id.toUpperCase(), name: `Товар ${id}` });
const person = (id) => ({ id, name: `Сотрудник ${id}`, role: "Кладовщик" });
const request = (id) => ({ id, status: "new", lines: [] });

/** Кабинет «до»: склад w1 с людьми, второй склад w2, товары, заявки. */
async function cabinet(tag, ip, extra = {}) {
  const who = await owner(`restore-${tag}@sklad.ru`, ip);
  const data = {
    warehouse: {
      id: "w1",
      name: "Склад",
      staff: ["s1", "s2", "s3", "s4"].map(person),
      partners: [{ id: "pt1", name: "ИП Иванов" }],
    },
    otherWarehouses: [{ id: "w2", name: "Второй", staff: [person("s7")] }],
    requests: ["r1", "r2", "r3", "r4", "r5"].map(request),
    products: ["p1", "p2", "p3", "p4", "p5"].map(product),
    ...extra,
  };
  const r = await call("/api/cabinet/snapshot", {
    ...who,
    body: { version: 0, format: 8, data },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return who;
}

/** Копия: другой состав всего. */
const copy = (extra = {}) => ({
  warehouse: { id: "w1", name: "Склад из копии", staff: [person("s9")], partners: [] },
  requests: [request("r9")],
  products: [product("p9")],
  ...extra,
});

test(
  "копия заменяет работу и товары, но людей, партнёров и склады не удаляет",
  { skip: SKIP },
  async () => {
    const who = await cabinet("full", "10.0.3.2");
    const r = await call("/api/cabinet/restore", { ...who, body: { format: 8, data: copy() } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.version, 2);

    const read = (await call("/api/cabinet/snapshot", who)).json.snapshot;
    assert.equal(read.version, 2);
    assert.equal(read.data.warehouse.name, "Склад из копии");
    assert.deepEqual(
      read.data.requests.map((x) => x.id),
      ["r9"],
    );
    assert.deepEqual(
      read.data.products.map((p) => p.id),
      ["p9"],
    );
    // Люди склада из копии — первыми, прежние — остались.
    assert.deepEqual(
      read.data.warehouse.staff.map((s) => s.id),
      ["s9", "s1", "s2", "s3", "s4"],
    );
    assert.deepEqual(
      read.data.warehouse.partners.map((p) => p.id),
      ["pt1"],
    );
    // Второго склада в копии нет — он остался со своими людьми.
    const w2 = read.data.otherWarehouses.find((w) => w.id === "w2");
    assert.deepEqual(
      w2.staff.map((s) => s.id),
      ["s7"],
    );
    // Пропавшие товары — в корзине, а не стёрты.
    const { rows } = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.products
       WHERE org_id = $1 AND deleted_at IS NOT NULL`,
      [who.org],
    );
    assert.equal(rows[0].n, 5);
    const audit = await db.root.query(
      `SELECT action, details FROM uklad.audit_events
       WHERE org_id = $1 AND action = 'cabinet.restore'`,
      [who.org],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].details.records, 1);
  },
);

test("во время смены копию не загрузить, после конца смены — можно", { skip: SKIP }, async () => {
  const now = Date.now();
  const who = await cabinet("shift", "10.0.3.3", {
    staffEvents: [{ id: "e1", staffId: "s1", type: "shift_start", at: now - 60_000 }],
  });
  const busy = await call("/api/cabinet/restore", { ...who, body: { format: 8, data: copy() } });
  assert.equal(busy.status, 409);
  assert.equal(busy.json.error, "shift_open");
  // Ничего не поменялось.
  const still = (await call("/api/cabinet/snapshot", who)).json.snapshot;
  assert.equal(still.version, 1);
  assert.equal(still.data.requests.length, 5);

  const ended = await call("/api/cabinet/snapshot", {
    ...who,
    body: {
      version: 1,
      format: 8,
      data: {
        ...still.data,
        staffEvents: [
          ...still.data.staffEvents,
          { id: "e2", staffId: "s1", type: "shift_end", at: now - 1000 },
        ],
      },
    },
  });
  assert.equal(ended.status, 200, JSON.stringify(ended.json));
  const ok = await call("/api/cabinet/restore", { ...who, body: { format: 8, data: copy() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});

test("смена, забытая больше суток назад, загрузку не держит", { skip: SKIP }, async () => {
  const old = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const who = await cabinet("stale", "10.0.3.4", {
    staffEvents: [{ id: "e1", staffId: "s1", type: "shift_start", at: old }],
  });
  const ok = await call("/api/cabinet/restore", { ...who, body: { format: 8, data: copy() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
});

test("без кабинета, без склада в копии и без входа — отказ", { skip: SKIP }, async () => {
  const fresh = await owner("restore-empty@sklad.ru", "10.0.3.5");
  const empty = await call("/api/cabinet/restore", {
    ...fresh,
    body: { format: 8, data: copy() },
  });
  assert.equal(empty.status, 409);
  assert.equal(empty.json.error, "restore_empty");

  const who = await cabinet("bad", "10.0.3.6");
  const noWh = await call("/api/cabinet/restore", {
    ...who,
    body: { format: 8, data: { products: [] } },
  });
  assert.equal(noWh.status, 400);
  const anon = await call("/api/cabinet/restore", { body: { format: 8, data: copy() } });
  assert.equal(anon.status, 401);
});

test("чужую компанию копией не перезаписать", { skip: SKIP }, async () => {
  const a = await cabinet("own-a", "10.0.3.7");
  const b = await owner("restore-own-b@sklad.ru", "10.0.3.8");
  const r = await call("/api/cabinet/restore", {
    cookie: b.cookie,
    org: a.org,
    body: { format: 8, data: copy() },
  });
  assert.equal(r.status, 401);
  const read = (await call("/api/cabinet/snapshot", a)).json.snapshot;
  assert.equal(read.version, 1);
});

test(
  "решения и отметки смен из копии помечены «из копии», чужое авторство не ложится",
  { skip: SKIP },
  async () => {
    const old = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const e1 = { id: "e1", staffId: "s1", type: "shift_start", at: old };
    // Открытое спорное: решённым сразу кабинет его не заводит (четыре глаза).
    const d1 = { id: "d1", kind: "shortage", qty: 1, raisedBy: "s2" };
    const who = await cabinet("author", "10.0.3.9", { staffEvents: [e1], disputes: [d1] });
    // В копии — решение «от имени» s3, которого на сервере не было.
    const forged = { ...d1, resolution: "written_off", resolvedBy: "s3", resolvedAt: old };
    const e2 = { id: "e2", staffId: "s3", type: "shift_start", at: old + 1000 };
    const r = await call("/api/cabinet/restore", {
      ...who,
      body: { format: 8, data: copy({ staffEvents: [e1, e2], disputes: [forged] }) },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const read = (await call("/api/cabinet/snapshot", who)).json.snapshot.data;
    const byId = (rows) => Object.fromEntries(rows.map((x) => [x.id, x]));
    const ev = byId(read.staffEvents);
    assert.equal(ev.e1.restored, undefined);
    assert.equal(ev.e2.restored, true);
    const ds = byId(read.disputes);
    assert.equal(ds.d1.resolvedBy, "manager");
    assert.equal(ds.d1.restored, true);
  },
);

test(
  "то же решение с другим количеством и новый скан приёмки из копии — «из копии»",
  { skip: SKIP },
  async () => {
    const old = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const d1 = { id: "d1", kind: "shortage", qty: 2, raisedBy: "s2" };
    const who = await cabinet("qty", "10.0.3.10", { disputes: [d1] });
    const ver = (await call("/api/cabinet/snapshot", who)).json.snapshot;
    // Владелец решает спорное обычной записью — на сервере решение «manager».
    const decided = { ...d1, resolution: "returned", resolvedBy: "manager", resolvedAt: old };
    const put = await call("/api/cabinet/snapshot", {
      ...who,
      body: { version: ver.version, format: 8, data: { ...ver.data, disputes: [decided] } },
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    // В копии то же решение, но «списал 200», и чужой скан приёмки.
    const scan = {
      id: "rc1",
      productId: "p9",
      qty: 50,
      boxId: "b1",
      staffId: "s3",
      timestamp: old,
    };
    const r = await call("/api/cabinet/restore", {
      ...who,
      body: {
        format: 8,
        data: copy({ disputes: [{ ...decided, qty: 200 }], receivingEvents: [scan] }),
      },
    });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const read = (await call("/api/cabinet/snapshot", who)).json.snapshot.data;
    assert.equal(read.disputes[0].qty, 200);
    assert.equal(read.disputes[0].resolvedBy, "manager");
    assert.equal(read.disputes[0].restored, true);
    assert.equal(read.receivingEvents[0].restored, true);
    assert.equal(read.receivingEvents[0].staffId, "s3");
  },
);
