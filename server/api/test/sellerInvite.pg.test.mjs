// Продавец входит в кабинет склада по приглашению (миграция 039).
//
// Кирилл 15.11: «не забудь сделать приглашение для продавца». Продавец —
// партнёр склада из кабинета; позванный по почте, он видит только товар
// своего партнёра. Здесь — на настоящем Postgres: чужой товар, общая тара,
// персонал и контакты не уходят, писать кабинет нельзя. Без PG_ADMIN_URL
// тест пропускается.
/* global process, fetch, setTimeout, Buffer */
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
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {}, warn() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const team = createTeam({ auth, cfg, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const { createDesks } = require("../src/cabinet/desks.js");
  const desks = createDesks({ auth, cfg, send, log: quiet });
  const { createConnectors } = require("../src/cabinet/connectors.js");
  const connectors = createConnectors({ auth, send, log: quiet, secretKey: Buffer.alloc(32, 7) });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await desks.handle(req, res, url)) ||
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)) ||
      (await connectors.handle(req, res, url)),
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

async function call(method, path, { body, cookie, org, ip = "10.0.3.1" } = {}) {
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
const tokenIn = (mail) => /#invite=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];

async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await post("/api/auth/register", { body, ip })).status, 202);
  const code = /^(\d{6})/.exec((await lastMail(email)).subject)[1];
  const r = await post("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: cookieOf(r.res), org: r.json.orgId, ip };
}

async function accept(email, ip) {
  const token = tokenIn(await lastMail(email));
  const acc = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
    ip,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  return { cookie: cookieOf(acc.res), org: acc.json.orgId, ip, token };
}

const snap = async (who) => (await call("GET", "/api/cabinet/snapshot", who)).json?.snapshot;

/** Склад с двумя продавцами: «Ромашка» и «Лютик», тара с товаром обоих. */
function cabinet() {
  return {
    warehouse: {
      id: "wh-a",
      name: "Складская 5",
      floors: [{ id: "fl-a", name: "Этаж 1", modules: [] }],
      staff: [{ id: "stf-k", name: "Константин Рябов", role: "Кладовщик", hourlyRate: 420 }],
      partners: [
        { id: "ptr-r", name: "Ромашка", phone: "+7 900 000-00-01" },
        { id: "ptr-l", name: "Лютик", phone: "+7 900 000-00-02" },
      ],
    },
    otherWarehouses: [],
    activeFloorId: "fl-a",
    products: [
      { id: "p-r", name: "Мыло Ромашка", sku: "R-1", warehouseId: "wh-a", partnerId: "ptr-r" },
      { id: "p-l", name: "Шампунь Лютик", sku: "L-1", warehouseId: "wh-a", partnerId: "ptr-l" },
    ],
    placements: {},
    boxes: [
      {
        id: "box-1",
        barcode: "UK-BOX-1",
        createdAt: 1,
        lines: [
          { productId: "p-r", qty: 3 },
          { productId: "p-l", qty: 5 },
        ],
      },
      { id: "box-2", barcode: "UK-BOX-2", createdAt: 1, lines: [{ productId: "p-l", qty: 2 }] },
    ],
    requests: [
      { id: "req-r", productId: "p-r", qty: 1, status: "new", createdAt: 1, updatedAt: 1 },
      { id: "req-l", productId: "p-l", qty: 1, status: "new", createdAt: 1, updatedAt: 1 },
    ],
    serviceSettings: { enabled: {}, prices: { storage: 10 } },
  };
}

async function writeCabinet(who, data) {
  const cur = await snap(who);
  const r = await post("/api/cabinet/snapshot", {
    ...who,
    body: { version: cur?.version ?? 0, format: 8, data },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}

test(
  "продавец по приглашению видит только свой товар и кабинет не пишет",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-seller@example.com", "10.4.0.1");
    await writeCabinet(boss, cabinet());
    const inv = await post("/api/team/invite", {
      ...boss,
      body: { email: "romashka@example.com", warehouseRef: "wh-a", partnerRef: "ptr-r" },
    });
    assert.equal(inv.status, 200, JSON.stringify(inv.json));
    // Продавец — не человек склада: в «Доступе» он со своим партнёром.
    const list = await call("GET", "/api/team", boss);
    const m = list.json.members.find((x) => x.email === "romashka@example.com");
    assert.equal(m.partnerRef, "ptr-r");
    assert.equal(m.roleName, "Продавец");

    const seller = await accept("romashka@example.com", boss.ip);
    assert.equal(seller.org, boss.org);
    const me = await call("GET", "/api/auth/me", seller);
    assert.equal(me.json.orgs.find((o) => o.id === boss.org).partnerRef, "ptr-r");
    // У руководителя продавца нет.
    const bossMe = await call("GET", "/api/auth/me", boss);
    assert.equal(bossMe.json.orgs[0].partnerRef, undefined);

    const s = await snap(seller);
    assert.equal(s.viewer, true);
    assert.equal(s.seller, "ptr-r");
    assert.deepEqual(s.writable, []);
    assert.deepEqual(
      s.data.products.map((p) => p.id),
      ["p-r"],
    );
    assert.deepEqual(
      s.data.requests.map((r) => r.id),
      ["req-r"],
    );
    // Общая тара — только со своей строкой; тары с одним чужим товаром нет.
    assert.deepEqual(
      s.data.boxes.map((b) => [b.id, b.lines]),
      [["box-1", [{ productId: "p-r", qty: 3 }]]],
    );
    assert.deepEqual(s.data.warehouse.partners, [{ id: "ptr-r", name: "Ромашка" }]);
    assert.deepEqual(s.data.warehouse.staff, []);
    assert.deepEqual(s.data.serviceSettings.prices, { storage: 10 });
    const all = JSON.stringify(s.data);
    for (const leak of ["Лютик", "p-l", "req-l", "Константин", "+7 900"]) {
      assert.ok(!all.includes(leak), `продавцу ушло «${leak}»`);
    }

    // Писать кабинет продавцу нельзя ни целиком, ни правкой.
    const whole = await post("/api/cabinet/snapshot", {
      ...seller,
      body: { version: s.version, format: 8, data: cabinet() },
    });
    assert.equal(whole.status, 403);
    // Команду он не видит.
    assert.equal((await call("GET", "/api/team", seller)).status, 403);
  },
);

test("продавец — только из списка продавцов склада и только с почтой", { skip: SKIP }, async () => {
  const boss = await owner("boss-seller2@example.com", "10.4.0.2");
  await writeCabinet(boss, cabinet());
  const bad = (body) => post("/api/team/invite", { ...boss, body });
  assert.equal(
    (await bad({ email: "x@example.com", warehouseRef: "wh-a", partnerRef: "ptr-x" })).status,
    404,
  );
  assert.equal((await bad({ email: "x@example.com", partnerRef: "ptr-r" })).status, 400);
  assert.equal(
    (
      await bad({
        email: "x@example.com",
        warehouseRef: "wh-a",
        staffRef: "stf-k",
        partnerRef: "ptr-r",
      })
    ).status,
    400,
  );
});

test("позвали сотрудником на почту продавца — он больше не продавец", { skip: SKIP }, async () => {
  const boss = await owner("boss-seller3@example.com", "10.4.0.3");
  await writeCabinet(boss, cabinet());
  const roles = Object.fromEntries(
    (await call("GET", "/api/team", boss)).json.roles.map((x) => [x.name, x.id]),
  );
  const email = "twice@example.com";
  await post("/api/team/invite", {
    ...boss,
    body: { email, warehouseRef: "wh-a", partnerRef: "ptr-r" },
  });
  const again = await post("/api/team/invite", {
    ...boss,
    body: { email, roleId: roles["Кладовщик"], warehouseRef: "wh-a" },
  });
  assert.equal(again.status, 200, JSON.stringify(again.json));
  const list = (await call("GET", "/api/team", boss)).json.members.filter((x) => x.email === email);
  assert.equal(list.length, 1);
  assert.equal(list[0].partnerRef, null);
  assert.equal(list[0].roleName, "Кладовщик");
});

test(
  "продавцу — только роль без прав, а с правами в обход базы маршруты кабинета закрыты",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-seller4@example.com", "10.4.0.4");
    await writeCabinet(boss, cabinet());
    await post("/api/team/invite", {
      ...boss,
      body: { email: "romashka4@example.com", warehouseRef: "wh-a", partnerRef: "ptr-r" },
    });
    const seller = await accept("romashka4@example.com", boss.ip);
    const team = (await call("GET", "/api/team", boss)).json;
    const roles = Object.fromEntries(team.roles.map((x) => [x.name, x.id]));
    const m = team.members.find((x) => x.email === "romashka4@example.com");

    // В «Доступе» продавцу роль с правами не дают (миграция 045).
    const up = await post("/api/team/role", {
      ...boss,
      body: { memberId: m.id, roleId: roles["Начальник склада"] },
    });
    assert.equal(up.status, 403);
    assert.equal(up.json.error, "role_not_allowed");
    // И роль без прав, но своя, у продавца прав не получает.
    const own = await post("/api/team/roles/save", {
      ...boss,
      body: { name: "Пустая", permissions: [] },
    });
    assert.equal(own.status, 200, JSON.stringify(own.json));
    assert.equal(
      (await post("/api/team/role", { ...boss, body: { memberId: m.id, roleId: own.json.roleId } }))
        .status,
      200,
    );
    const widen = await post("/api/team/roles/save", {
      ...boss,
      body: { roleId: own.json.roleId, name: "Пустая", permissions: ["staff.view"] },
    });
    assert.equal(widen.status, 403);
    // Права дали в обход функций — сервер всё равно пускает продавца только
    // ко входу и к своему снимку.
    await db.root.query(`UPDATE uklad.members SET role_id = $2 WHERE id = $1`, [
      m.id,
      roles["Начальник склада"],
    ]);
    const day = "2026-11-16";
    for (const path of [
      "/api/team",
      `/api/cabinet/storage?from=${day}&to=${day}&warehouse=wh-a`,
      `/api/cabinet/history?from=${day}&to=${day}`,
      `/api/cabinet/inventory?from=${day}&to=${day}`,
      "/api/cabinet/desks/journal?device=dev-1",
      "/api/connectors",
    ]) {
      assert.equal((await call("GET", path, seller)).status, 403, path);
    }
    assert.equal(
      (
        await post("/api/team/invite", {
          ...seller,
          body: { email: "x4@example.com", roleId: roles["Кладовщик"], warehouseRef: "wh-a" },
        })
      ).status,
      403,
    );
    assert.equal((await call("GET", "/api/auth/me", seller)).status, 200);
    const s = await snap(seller);
    assert.equal(s.seller, "ptr-r");
    assert.deepEqual(
      s.data.products.map((p) => p.id),
      ["p-r"],
    );
  },
);
