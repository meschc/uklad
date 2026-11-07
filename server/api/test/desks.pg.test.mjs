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
  "руководитель переложил товар, стол собрал штуку: обе правки целы, стол не теряет работу",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("desk-h@sklad.ru", "10.0.3.8");
    const desk = await makeDesk(a);
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const boss = await login("desk-h@sklad.ru");
    const read = () => stored(a.org);
    const start = await read();
    // Руководитель в кабинете перекладывает две штуки из b1 в тару t1.
    const moved = {
      ...start.data,
      boxes: [
        { id: "b1", lines: [{ productId: "pr1", qty: 3 }] },
        { id: "t1", barcode: "UK-BOX-7", lines: [{ productId: "pr1", qty: 2 }] },
      ],
    };
    const m = await call("/api/cabinet/snapshot", {
      cookie: boss,
      org: a.org,
      body: { version: start.version, format: 8, data: moved },
    });
    assert.equal(m.status, 200);

    // Стол собирал по старой копии: запись не ложится поверх чужой правки,
    // а получает конфликт версии — товар руководителя на месте.
    const pick = (boxes, version) =>
      call("/api/cabinet/snapshot", {
        desk,
        body: {
          version,
          format: 8,
          data: {
            warehouse: { id: "wh_1" },
            boxes,
            requests: [
              {
                id: "r1",
                productId: "pr1",
                qty: 5,
                status: "in_progress",
                note: "Тула",
                pickedQty: 1,
              },
              { id: "r2", productId: "pr1", qty: 1, status: "shipped", note: "Тула" },
            ],
          },
        },
      });
    const stale = await pick([{ id: "b1", lines: [{ productId: "pr1", qty: 4 }] }], start.version);
    assert.equal(stale.status, 409);
    assert.notEqual(stale.json.error, "stock_mismatch");
    assert.deepEqual((await read()).data.boxes, moved.boxes);

    // Забрав свежую копию, стол повторяет сборку поверх неё — принято.
    const fresh = await read();
    const ok = await pick(
      [
        { id: "b1", lines: [{ productId: "pr1", qty: 2 }] },
        { id: "t1", barcode: "UK-BOX-7", lines: [{ productId: "pr1", qty: 2 }] },
      ],
      fresh.version,
    );
    assert.equal(ok.status, 200);
    const end = (await read()).data;
    assert.deepEqual(
      end.boxes.map((b) => [b.id, b.lines[0].qty]),
      [
        ["b1", 2],
        ["t1", 2],
      ],
    );
    assert.equal(end.requests.find((r) => r.id === "r1").pickedQty, 1);
  },
);

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

test("стол пишет работу склада, но не персонал, тариф и чужие склады", { skip: SKIP }, async () => {
  const { a, boss, ivan } = await company("desk-b@sklad.ru", "10.0.3.2");
  const desk = await makeDesk(a);
  // За стол встал Иван, потом руководитель: Иван ещё 10 минут «только что был».
  await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  await call("/api/cabinet/badges/check", { desk, body: { code: boss } });
  const forged = {
    warehouse: {
      id: "wh_1",
      name: "Мезонин",
      staff: [{ id: "stf-x", name: "Чужой", hourlyRate: 1 }],
    },
    otherWarehouses: [],
    boxes: [{ id: "b1", lines: [{ productId: "pr1", qty: 5 }] }, { id: "b2" }],
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
      // Смена за того, кого за столом не было.
      { id: "e3", staffId: "stf-ghost", type: "shift_start", at: 3 },
    ],
    // Решённое спорное «перерешено», открытое решено, добавлено новое.
    disputes: [
      { id: "q1", kind: "shortage", resolution: "written_off" },
      { id: "q2", kind: "extra", resolution: "moved", resolvedBy: "stf-boss" },
      { id: "q3", kind: "not_in_tote", raisedBy: "stf-ivan" },
      {
        id: "q4",
        kind: "shortage",
        raisedBy: "stf-ivan",
        resolution: "written_off",
        resolvedBy: "stf-ivan",
      },
      { id: "q5", kind: "extra", raisedBy: "stf-ghost" },
    ],
  };
  const saved = await call("/api/cabinet/snapshot", {
    desk,
    body: { version: 1, format: 8, data: forged },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.version, 2);
  const { data } = await stored(a.org);
  assert.deepEqual(
    data.boxes.map((b) => b.id),
    ["b1", "b2"],
  );
  assert.deepEqual(
    data.outboundBoxes.map((b) => b.code),
    ["UK-OUT-TULA01"],
  );
  assert.equal(data.subscription.plan, "start");
  assert.equal(data.warehouse.staff.length, 3);
  assert.equal(data.warehouse.staff[0].hourlyRate, 900);
  assert.equal(data.otherWarehouses.length, 1);
  assert.equal(data.chats.c1.text, "секрет");
  // Товары живут в таблице (миграция 013): стол их не переписал.
  assert.equal(data.products, undefined);
  const card = await db.root.query(
    `SELECT partner_ref FROM uklad.products WHERE org_id = $1 AND ref = 'pr1'`,
    [a.org],
  );
  assert.equal(card.rows[0].partner_ref, "p1");
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
  assert.equal(disputes.q5, undefined);
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

test(
  "смена стола: заявки только ходом работы, решения — руководителя, уход",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("desk-g@sklad.ru", "10.0.3.7");
    const olga = (await call("/api/cabinet/badges/issue", { ...a, body: { staffRef: "stf-olga" } }))
      .json.code;
    const desk = await makeDesk(a);
    const snapshot = () => stored(a.org);
    const write = async (data) => {
      const { version } = await snapshot();
      const r = await call("/api/cabinet/snapshot", { desk, body: { version, format: 8, data } });
      assert.equal(r.status, 200);
      return (await snapshot()).data;
    };
    const base = { warehouse: { id: "wh_1" } };

    // Пока никто не отсканировал бейдж, отметки смены со стола не принимаются.
    let data = await write({
      ...base,
      staffEvents: [{ id: "n1", staffId: "stf-ivan", type: "shift_start", at: 5 }],
    });
    assert.deepEqual(
      data.staffEvents.map((e) => e.id),
      ["e1"],
    );

    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    data = await write({
      ...base,
      staffEvents: [
        { id: "n2", staffId: "stf-ivan", type: "shift_start", at: 6 },
        { id: "n3", staffId: "stf-boss", type: "shift_start", at: 6 },
      ],
      requests: [
        // Суть заявки «поправлена» под недостачу, ход работы — честный.
        {
          id: "r1",
          productId: "pr9",
          qty: 1,
          note: "Самара",
          status: "done",
          pickedQty: 40,
          packedAt: 7,
          packedBy: "stf-ivan",
        },
        // Уехавшую вернуть нельзя, новую стол не заводит.
        { id: "r2", productId: "pr1", qty: 1, status: "new", note: "Тула" },
        { id: "r3", productId: "pr1", qty: 99, status: "new" },
      ],
      // Собранное снято с полки: иначе пять штук числились бы и в коробе, и
      // в заявке.
      boxes: [{ id: "b1", lines: [] }],
      // Упаковщик решает спорное — не его решение.
      disputes: [{ id: "q2", kind: "extra", resolution: "moved", resolvedBy: "stf-ivan" }],
    });
    assert.deepEqual(
      data.staffEvents.map((e) => e.id),
      ["e1", "n2"],
    );
    const req = Object.fromEntries(data.requests.map((r) => [r.id, r]));
    assert.deepEqual(Object.keys(req).sort(), ["r1", "r2"]);
    assert.equal(req.r1.productId, "pr1");
    assert.equal(req.r1.qty, 5);
    assert.equal(req.r1.note, "Тула");
    assert.equal(req.r1.status, "done");
    assert.equal(req.r1.pickedQty, 5);
    assert.equal(req.r1.packedBy, "stf-ivan");
    assert.equal(req.r2.status, "shipped");
    assert.equal(data.disputes.find((d) => d.id === "q2").resolution, undefined);

    // Старший смены решает за столом — как и в кабинете (`SENIOR_ROLE`).
    // Свою же находку он не списывает, и списание без причины не проходит.
    await call("/api/cabinet/badges/check", { desk, body: { code: olga } });
    data = await write({
      ...base,
      disputes: [
        { id: "q2", kind: "extra", resolution: "moved", resolvedBy: "stf-olga" },
        { id: "q6", kind: "shortage", qty: 1, raisedBy: "stf-olga", raisedAt: 9 },
      ],
    });
    assert.equal(data.disputes.find((d) => d.id === "q2").resolution, "moved");
    data = await write({
      ...base,
      disputes: [
        {
          id: "q6",
          kind: "shortage",
          raisedBy: "stf-olga",
          resolution: "written_off",
          resolvedBy: "stf-olga",
          note: "не нашли",
        },
      ],
    });
    assert.equal(data.disputes.find((d) => d.id === "q6").resolution, undefined);

    // Ушёл со стола: он больше не «за столом», но отметки, набранные до ухода,
    // ещё 10 минут догоняют сервер.
    assert.equal((await call("/api/desk/leave", { desk, body: {} })).status, 200);
    data = await write({
      ...base,
      staffEvents: [{ id: "n4", staffId: "stf-olga", type: "shift_end", at: 8 }],
    });
    assert.ok(
      data.staffEvents.some((e) => e.id === "n4"),
      "10 минут после ухода — ещё принимаем",
    );

    // Товар в таре «из ничего»: остатки не сошлись (`deskStock.js`). Отметка
    // смены записана, тара осталась как была, а стол получает 409 и забирает
    // свежий снимок, как при конфликте.
    await call("/api/cabinet/badges/check", { desk, body: { code: olga } });
    const before = await snapshot();
    const fake = await call("/api/cabinet/snapshot", {
      desk,
      body: {
        version: before.version,
        format: 8,
        data: {
          ...base,
          boxes: [{ id: "bx-fake", barcode: "UK-BOX-99", lines: [{ productId: "pr1", qty: 50 }] }],
          staffEvents: [{ id: "n5", staffId: "stf-olga", type: "shift_start", at: 9 }],
        },
      },
    });
    assert.equal(fake.status, 409);
    assert.equal(fake.json.error, "stock_mismatch");
    const after = await snapshot();
    assert.equal(fake.json.version, after.version);
    assert.equal(after.version, before.version + 1);
    assert.ok(after.data.staffEvents.some((e) => e.id === "n5"));
    assert.ok(!(after.data.boxes ?? []).some((b) => b.id === "bx-fake"));
    // Откаченная работа и в журнал движений не попала.
    const fakeMoves = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.stock_moves WHERE place_ref = 'bx-fake'`,
    );
    assert.equal(fakeMoves.rows[0].n, 0);

    // Выход под входом руководителя (не стол) — не маршрут стола: 404, а не
    // 401, который закрыл бы кабинет руководителя.
    const boss = await login("desk-g@sklad.ru");
    assert.equal((await call("/api/desk/leave", { cookie: boss, body: {} })).status, 404);
  },
);
