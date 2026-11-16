// Журнал действий склада (миграция 044) на настоящем Postgres.
//
// Кирилл 15.11: посекундная история действий, доступная руководителю, с
// разделением по процессу и товару. Проверяем три круга, как у прав: свой
// склад (операции стола видны со сотрудником, устройством и типом скана),
// второй склад той же компании (его журнал не показывает чужих операций,
// смотрящий второго склада первый не откроет) и чужая компания с тем же id
// склада (ничего не видит). Плюс тип скана и «пик за товар» по правилу базы
// и склад старых строк по привязке устройства.
// Без PG_ADMIN_URL тест пропускается.
/* global process, fetch, setTimeout, URL */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
  const { createTeam } = require("../src/cabinet/team.js");
  const { createJournal } = require("../src/cabinet/journal.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {}, warn() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const parts = [
    createDesks({ auth, cfg, send, log: quiet }),
    auth,
    createTeam({ auth, cfg, send, log: quiet }),
    createDeskBadges({ auth, send, log: quiet }),
    createSnapshot({ auth, send, log: quiet }),
    createJournal({ auth, send, log: quiet }),
  ];
  cookieName = auth.cookieName;
  deskCookieName = parts[0].cookieName;
  const cabinet = {
    handle: async (req, res, url) => {
      for (const p of parts) if (await p.handle(req, res, url)) return true;
      return false;
    },
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

async function lastMail(to) {
  for (let i = 0; i < 50; i++) {
    const m = sent.findLast((x) => x.to === to);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`письма для ${to} нет`);
}

async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await call("/api/auth/register", { body, ip })).status, 202);
  const code = /^(\d{6})/.exec((await lastMail(email)).subject)[1];
  const r = await call("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: tokenOf(r.cookies, cookieName), org: r.json.orgId };
}

async function login(email) {
  const r = await call("/api/auth/login", { body: { email, password: PW }, ip: "10.0.7.9" });
  assert.equal(r.status, 200);
  return tokenOf(r.cookies, cookieName);
}

/** Приглашённый на склад с ролью — его вход. */
async function invited(boss, email, role, warehouseRef, staffRef) {
  const roles = (await call("/api/team", boss)).json.roles;
  const roleId = roles.find((r) => r.name === role).id;
  const inv = await call("/api/team/invite", {
    ...boss,
    body: { email, roleId, warehouseRef, staffRef },
  });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  const token = /#invite=([A-Za-z0-9_-]{43})/.exec((await lastMail(email)).text)[1];
  const acc = await call("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  return { cookie: tokenOf(acc.cookies, cookieName), org: acc.json.orgId };
}

const partners = () => [{ id: "p1", name: "ООО Ромашка" }];
const whA = {
  id: "wh_a",
  name: "Складской 5",
  floors: [{ id: "fl-a", name: "Этаж 1", modules: [] }],
  staff: [
    { id: "stf-a", name: "Иван" },
    { id: "stf-k", name: "Тимур", role: "Кладовщик" },
  ],
};
const whB = {
  id: "wh_b",
  name: "Логопарк",
  floors: [{ id: "fl-b", name: "Этаж 1", modules: [] }],
  staff: [{ id: "stf-l", name: "Елена", role: "Старший смены" }],
};
const data = () => ({
  products: [{ id: "pr1", sku: "A-1", name: "Кружка", partnerId: "p1" }],
  staffEvents: [],
  subscription: { plan: "start" },
  warehouse: { ...whA, partners: partners() },
  devices: [{ id: "dev-a", name: "Стол А", station: "pack", createdAt: 1 }],
  boxes: [{ id: "t-a", barcode: "UK-BOX-1", lines: [{ productId: "pr1", qty: 3 }] }],
  requests: [{ id: "r-a", productId: "pr1", qty: 2, status: "done", toteId: "t-a", note: "Тула" }],
  outboundBoxes: [],
  otherWarehouses: [{ ...whB, partners: partners() }],
  warehouseData: {
    wh_b: { devices: [], boxes: [{ id: "t-b", barcode: "UK-BOX-9", lines: [] }] },
  },
});

/** Компания с двумя складами и столом склада А, за которым Иван. */
async function company(email, ip) {
  const a = await owner(email, ip);
  const first = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: data() },
  });
  assert.equal(first.status, 200);
  const ivan = (await call("/api/cabinet/badges/issue", { ...a, body: { staffRef: "stf-a" } })).json
    .code;
  const r = await call("/api/cabinet/desks", {
    ...a,
    body: { deviceRef: "dev-a", name: "Стол А" },
  });
  assert.equal(r.status, 200);
  const desk = tokenOf(r.cookies, deskCookieName);
  const seen = await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  assert.equal(seen.status, 200);
  return { org: a.org, desk, boss: { cookie: await login(email), org: a.org } };
}

const at = Date.now() - 2000;
const packDone = (key) => ({
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
// Этикетка и ошибка скана: товар не двигают, но в журнале остаются.
const packEvent = (key, type, ms, extra = {}) => ({
  key,
  kind: "pack_event",
  body: { eventId: `ev-${key}`, staffId: "stf-a", at: at + ms, type, toteId: "t-zz", ...extra },
});
// Код Честного знака с криптохвостом после разделителя GS.
const MARK = "0104601234567890215abcdef";
const ops = (desk, list) => call("/api/desk/ops", { desk, body: { ops: list } });
const journal = (who, q = "") => call(`/api/cabinet/journal${q}`, who);
const deskOnly = (r) => r.json.entries.filter((e) => e.source === "desk");

test(
  "свой склад: операции стола со сотрудником, устройством, типом скана",
  { skip: SKIP },
  async () => {
    const c = await company("journal-a@sklad.ru", "10.0.7.2");
    const r = await ops(c.desk, [
      packDone("key-jrnl-1"),
      packEvent("key-jrnl-2", "pack_label", 1),
      packEvent("key-jrnl-6", "pack_error", 2, { code: `${MARK}\u001d93SECRETTAIL` }),
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.json));

    const all = await journal(c.boss, "?warehouse=wh_a");
    assert.equal(all.status, 200, JSON.stringify(all.json));
    assert.equal(all.json.warehouse, "wh_a");
    const rows = deskOnly(all);
    assert.deepEqual(
      rows.map((e) => [e.kind, e.step, e.counted, e.flagged, e.staffRef, e.device.name]),
      [
        ["pack_event", "pack", false, false, "stf-a", "Стол А"],
        ["pack_event", "label", false, false, "stf-a", "Стол А"],
        ["pack_done", "pack", false, false, "stf-a", "Стол А"],
      ],
    );
    assert.equal(rows[2].at, at);
    assert.equal(rows[2].refs.toteId, "t-a");
    assert.ok(rows[2].receivedAt >= at);
    // Первая запись кабинета руководителем — тоже действие: тара склада А.
    const edit = all.json.entries.find((e) => e.source === "cabinet");
    assert.equal(edit.step, "cabinet");
    assert.ok(edit.moves.some((m) => m.ref === "t-a" && m.delta === 3));

    // Фильтры: процесс, товар, тара, ошибки, страница.
    assert.deepEqual(deskOnly(await journal(c.boss, "?warehouse=wh_a&steps=pick")), []);
    const labels = deskOnly(await journal(c.boss, "?warehouse=wh_a&steps=label"));
    assert.deepEqual(
      labels.map((e) => e.refs.type),
      ["pack_label"],
    );
    assert.deepEqual(
      deskOnly(await journal(c.boss, "?warehouse=wh_a&product=pr1")).map((e) => e.kind),
      ["pack_done"],
    );
    assert.deepEqual(deskOnly(await journal(c.boss, "?warehouse=wh_a&place=t-zz")).length, 2);
    // «Ошибки» — скан не того, отказ и помеченное сервером; правок кабинета там нет.
    const errors = await journal(c.boss, "?warehouse=wh_a&errors=1");
    assert.deepEqual(
      errors.json.entries.map((e) => e.refs.type),
      ["pack_error"],
    );
    // Код маркировки отдаётся без криптохвоста.
    assert.equal(errors.json.entries[0].refs.code, MARK);
    assert.deepEqual(deskOnly(await journal(c.boss, `?warehouse=wh_a&before=${at - 1}`)), []);
    assert.equal((await journal(c.boss, "?warehouse=wh_a&steps=nope")).status, 400);
    assert.equal((await journal(c.boss, "?warehouse=wh_a&before=вчера")).status, 400);
    // Стол журнал склада не открывает: у него нет входа в кабинет.
    const fromDesk = await call("/api/cabinet/journal?warehouse=wh_a", { desk: c.desk });
    assert.ok([401, 403].includes(fromDesk.status), String(fromDesk.status));
  },
);

test(
  "второй склад и смотрящие: только свой склад, без «Персонала» нельзя",
  { skip: SKIP },
  async () => {
    const c = await company("journal-b@sklad.ru", "10.0.7.3");
    await ops(c.desk, [packDone("key-jrnl-3")]);

    // Журнал склада Б операций стола склада А не показывает.
    const b = await journal(c.boss, "?warehouse=wh_b");
    assert.equal(b.status, 200);
    assert.deepEqual(deskOnly(b), []);
    // Склада нет в компании — отказ, а не первый попавшийся.
    assert.equal((await journal(c.boss, "?warehouse=wh_zz")).status, 403);

    // Старший смены склада Б видит журнал Б и не открывает А.
    const lead = await invited(c.boss, "lead-b@sklad.ru", "Старший смены", "wh_b", "stf-l");
    const own = await journal(lead);
    assert.equal(own.status, 200, JSON.stringify(own.json));
    assert.equal(own.json.warehouse, "wh_b");
    assert.deepEqual(deskOnly(own), []);
    assert.equal((await journal(lead, "?warehouse=wh_a")).status, 403);

    // Кладовщику без «Персонал: смотреть» журнал закрыт.
    const keeper = await invited(c.boss, "keeper-a@sklad.ru", "Кладовщик", "wh_a", "stf-k");
    assert.equal((await journal(keeper, "?warehouse=wh_a")).status, 403);
  },
);

test("чужая компания с тем же id склада ничего не видит", { skip: SKIP }, async () => {
  const one = await company("journal-c@sklad.ru", "10.0.7.4");
  await ops(one.desk, [packDone("key-jrnl-4")]);
  const other = await company("journal-d@sklad.ru", "10.0.7.5");
  const r = await journal(other.boss, "?warehouse=wh_a");
  assert.equal(r.status, 200);
  assert.deepEqual(deskOnly(r), []);
  // Чужим заголовком компании тоже не войти.
  assert.equal((await journal({ ...other.boss, org: one.org }, "?warehouse=wh_a")).status, 401);
});

test("тип скана и «пик за товар» — правило базы; склад старых строк", { skip: SKIP }, async () => {
  const c = await company("journal-e@sklad.ru", "10.0.7.6");
  await ops(c.desk, [packDone("key-jrnl-5")]);
  const desk = (
    await db.root.query(`SELECT desk_id FROM uklad.desk_ops WHERE org_id = $1 LIMIT 1`, [c.org])
  ).rows[0].desk_id;
  const put = async (key, kind, status, body) =>
    db.root.query(
      `INSERT INTO uklad.desk_ops (org_id, op_key, desk_id, kind, body, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [c.org, key, desk, kind, JSON.stringify(body), status],
    );
  await put("key-gen-1", "pick_unit", "applied", {});
  await put("key-gen-2", "pick_unit", "flagged", {});
  await put("key-gen-3", "pack_event", "applied", { type: "pack_scan" });
  await put("key-gen-4", "pack_event", "applied", {
    type: "pack_scan",
    dispute: { kind: "extra" },
  });
  await put("key-gen-5", "recv_place", "applied", {});
  await put("key-gen-6", "sort_place", "applied", {});
  await put("key-gen-7", "shift_mark", "applied", {});
  await put("key-gen-8", "station_switch", "applied", { station: "sorting" });
  await put("key-gen-9", "pick_undo", "applied", { pickId: "p1" });
  const { rows } = await db.root.query(
    `SELECT op_key, step, counted FROM uklad.desk_ops
     WHERE org_id = $1 AND op_key LIKE 'key-gen-%' ORDER BY op_key`,
    [c.org],
  );
  assert.deepEqual(
    rows.map((x) => [x.step, x.counted]),
    [
      ["pick", true],
      ["pick", false],
      ["pack", true],
      ["pack", false],
      ["place", false],
      ["sort", true],
      ["shift", false],
      ["shift", false],
      ["pick", false],
    ],
  );

  // Старые строки без склада получают его по привязке устройства — тот же
  // кусок миграции, что прошёл на сервере.
  await db.root.query(`UPDATE uklad.desk_ops SET warehouse_ref = NULL WHERE org_id = $1`, [c.org]);
  const sql = readFileSync(
    new URL("../../db/migrations/044_activity_journal.sql", import.meta.url),
    "utf8",
  );
  const from = sql.indexOf("ALTER TABLE uklad.desk_ops NO FORCE");
  const to = sql.indexOf("ALTER TABLE uklad.desk_ops FORCE ROW LEVEL SECURITY;");
  await db.root.query(sql.slice(from, to));
  const left = await db.root.query(
    `SELECT count(*)::int AS n FROM uklad.desk_ops
     WHERE org_id = $1 AND warehouse_ref IS DISTINCT FROM 'wh_a'`,
    [c.org],
  );
  assert.equal(left.rows[0].n, 0);
});
