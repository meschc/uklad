// Операции стола (миграция 015): повтор по ключу не задваивает отметку,
// сервер сам решает, за кого она, отмена старой записью снимка не воскресает.
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
  const { createTeam } = require("../src/cabinet/team.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const badges = createDeskBadges({ auth, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const desks = createDesks({ auth, cfg, send, log: quiet });
  const team = createTeam({ auth, cfg, send, log: quiet });
  cookieName = auth.cookieName;
  deskCookieName = desks.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await desks.handle(req, res, url)) ||
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
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
  boxes: [{ id: "b1" }],
  requests: [
    { id: "r1", productId: "pr1", qty: 5, status: "in_progress", note: "Тула" },
    { id: "r2", productId: "pr1", qty: 1, status: "shipped", note: "Тула" },
  ],
  chats: { c1: { text: "секрет" } },
  subscription: PLAN,
  // Стол — устройство склада (`deskPlace.js`): без него стол не открыть.
  devices: [
    { id: "dev-1", name: "Стол 1", station: "pack", createdAt: 1 },
    { id: "dev-2", name: "Стол 2", station: "pack", createdAt: 1 },
    // Процесс держит сервер (`stationAt`): работу каждого процесса — с
    // устройства этого процесса.
    { id: "dev-pick", name: "ТСД сборки", station: "picking", createdAt: 1 },
    { id: "dev-recv", name: "Приёмка", station: "receiving", createdAt: 1 },
    { id: "dev-ship", name: "Отгрузка", station: "shipping", createdAt: 1 },
    { id: "dev-inv", name: "ТСД инвентаризации", station: "inventory", createdAt: 1 },
  ],
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
  // Права у стола — по роли (миграция 024): Игорь и Ольга — начальники склада,
  // у Ивана роли нет. Должность в снимке на права не влияет.
  const team = (await call("/api/team", a)).json;
  const chief = team.roles.find(
    (r) => r.name === "Начальник склада" && r.warehouseRef === "wh_1",
  ).id;
  for (const staffRef of ["stf-boss", "stf-olga"]) {
    const set = await call("/api/team/desk-role", { ...a, body: { staffRef, roleId: chief } });
    assert.equal(set.status, 200);
  }
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

const ops = (desk, list) => call("/api/desk/ops", { desk, body: { ops: list } });
const mark = (key, eventId, type, at = Date.now() - 500) => ({
  key,
  kind: "shift_mark",
  body: { eventId, type, at, station: "pack" },
});
const undo = (key, eventId, at = Date.now()) => ({
  key,
  kind: "shift_undo",
  body: { eventId, at },
});
async function serverEvents(email, org) {
  const cookie = await login(email);
  const snap = (await call("/api/cabinet/snapshot", { cookie, org })).json.snapshot;
  return { snap, ids: snap.data.staffEvents.map((e) => [e.id, e.staffId]) };
}

test(
  "отметка операцией: за сотрудника за столом, повтор — тот же ответ",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-a@sklad.ru", "10.0.5.1");
    const desk = await makeDesk(a);

    // Никого за столом: отметка не ложится, но сохраняется помеченной.
    const nobody = await ops(desk, [mark("key-nobody-1", "ev0", "shift_start")]);
    assert.equal(nobody.status, 200);
    assert.deepEqual(nobody.json.results, [
      { key: "key-nobody-1", status: "flagged", reason: "nobody" },
    ]);
    assert.equal(nobody.json.version, nobody.json.before);

    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const first = await ops(desk, [mark("key-start-01", "ev1", "shift_start")]);
    assert.deepEqual(first.json.results, [{ key: "key-start-01", status: "applied" }]);
    assert.equal(first.json.version, first.json.before + 1);

    // Обрыв связи: та же пачка ещё раз и ключ дважды в одной пачке.
    const again = await ops(desk, [
      mark("key-start-01", "ev1", "shift_start"),
      mark("key-break-01", "ev2", "break_start"),
      mark("key-break-01", "ev2", "break_start"),
    ]);
    assert.deepEqual(again.json.results, [
      { key: "key-start-01", status: "applied", duplicate: true },
      { key: "key-break-01", status: "applied" },
      { key: "key-break-01", status: "applied", duplicate: true },
    ]);

    const { ids } = await serverEvents("ops-a@sklad.ru", a.org);
    assert.deepEqual(ids, [
      ["e1", "stf-ivan"],
      ["ev1", "stf-ivan"],
      ["ev2", "stf-ivan"],
    ]);
    const log = await db.root.query(
      `SELECT op_key, status, staff_ref FROM uklad.desk_ops WHERE org_id = $1 ORDER BY received_at, op_key`,
      [a.org],
    );
    assert.deepEqual(
      log.rows.map((r) => [r.op_key, r.status, r.staff_ref]),
      [
        ["key-nobody-1", "flagged", null],
        ["key-start-01", "applied", "stf-ivan"],
        ["key-break-01", "applied", "stf-ivan"],
      ],
    );
  },
);

test("отмена отметки: в срок снимается, снимок стол не пишет", { skip: SKIP }, async () => {
  const { a, ivan } = await company("ops-b@sklad.ru", "10.0.5.2");
  const desk = await makeDesk(a);
  await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  const at = Date.now() - 1000;
  await ops(desk, [mark("key-brk-0001", "evb", "break_start", at)]);
  const { snap } = await serverEvents("ops-b@sklad.ru", a.org);

  // Сервер принял отметку минуту назад: отмена поздняя, что бы ни писал стол.
  const shift = (t) =>
    db.root.query(
      `UPDATE uklad.desk_ops SET received_at = ${t}
         WHERE org_id = $1 AND op_key = 'key-brk-0001'`,
      [a.org],
    );
  await shift("received_at - interval '1 minute'");
  const late = await ops(desk, [undo("key-undo-late", "evb", at + 1000)]);
  assert.deepEqual(late.json.results, [
    { key: "key-undo-late", status: "flagged", reason: "late" },
  ]);
  await shift("now()");

  const undone = await ops(desk, [undo("key-undo-0001", "evb", at + 2000)]);
  assert.equal(undone.json.results[0].status, "applied");

  // Снимок стол не пишет вовсе: старая копия с отметкой до отмены не
  // вернёт её — запись снимка со стола отвечает 403.
  const stale = await call("/api/cabinet/snapshot", {
    desk,
    body: { version: undone.json.version, format: 8, data: { ...snap.data } },
  });
  assert.equal(stale.status, 403);
  const { ids } = await serverEvents("ops-b@sklad.ru", a.org);
  assert.equal(
    ids.some(([id]) => id === "evb"),
    false,
  );
});

test(
  "операции: битая пачка — 400, без снимка — 409, чужой стол — 401",
  { skip: SKIP },
  async () => {
    const { a } = await company("ops-c@sklad.ru", "10.0.5.3");
    const desk = await makeDesk(a);
    for (const body of [
      { ops: [] },
      { ops: [{ key: "x", kind: "shift_mark", body: { at: 1 } }] },
      { ops: [mark("key-000001", "e", "shift_start"), { key: "key-000002", kind: "drop" }] },
      {
        ops: Array.from({ length: 101 }, (_, i) => mark(`key-${1000 + i}`, `e${i}`, "shift_start")),
      },
    ]) {
      assert.equal((await call("/api/desk/ops", { desk, body })).status, 400);
    }
    assert.equal((await ops("A".repeat(43), [mark("key-000001", "e", "shift_start")])).status, 401);
    // Руководитель со своим входом сюда не ходит.
    const cookie = await login("ops-c@sklad.ru");
    assert.notEqual(
      (
        await call("/api/desk/ops", {
          cookie,
          body: { ops: [mark("key-000001", "e", "shift_start")] },
        })
      ).status,
      200,
    );

    // Без снимка нет и устройства склада: стол не открыть (`deskPlace.js`).
    const empty = await owner("ops-d@sklad.ru", "10.0.5.4");
    const none = await call("/api/cabinet/desks", {
      ...empty,
      body: { deviceRef: "dev-1", name: "Стол 1" },
    });
    assert.deepEqual([none.status, none.json.error], [409, "desk_warehouse"]);
    // Снимок пропал у живого стола — класть операции некуда.
    await db.root.query(`DELETE FROM uklad.cabinet_snapshots WHERE org_id = $1`, [a.org]);
    assert.equal((await ops(desk, [mark("key-000001", "e", "shift_start")])).status, 409);
  },
);

test("задним числом и ключи разных столов", { skip: SKIP }, async () => {
  const { a, ivan } = await company("ops-e@sklad.ru", "10.0.5.5");
  const desk = await makeDesk(a);
  await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  // Начало смены на 23 часа раньше, чем Иван встал за стол, — пометка.
  const back = await ops(desk, [
    mark("key-back-001", "evx", "shift_start", Date.now() - 23 * 3_600_000),
  ]);
  assert.deepEqual(back.json.results, [
    { key: "key-back-001", status: "flagged", reason: "backdated" },
  ]);

  // Второй стол той же компании с тем же ключом — своя операция, не повтор.
  const desk2 = await makeDesk({ cookie: await login("ops-e@sklad.ru"), org: a.org }, "dev-2");
  await call("/api/cabinet/badges/check", { desk: desk2, body: { code: ivan } });
  const other = await ops(desk2, [mark("key-back-001", "evy", "shift_start")]);
  assert.deepEqual(other.json.results, [{ key: "key-back-001", status: "applied" }]);
});

test(
  "заказ в двух тарах: половину не упаковать, вторая тара пересыпается",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-m@sklad.ru", "10.0.5.12");
    const order = { status: "done", externalId: "OZ-7", source: "ozon", note: "Коледино" };
    const data = {
      ...cabinetData(),
      boxes: [
        { id: "t1", barcode: "UK-BOX-1", lines: [{ productId: "pr1", qty: 1 }] },
        { id: "t2", barcode: "UK-BOX-2", lines: [{ productId: "pr1", qty: 1 }] },
      ],
      requests: [
        { id: "r1", productId: "pr1", qty: 1, toteId: "t1", ...order },
        { id: "r2", productId: "pr1", qty: 1, toteId: "t2", ...order },
      ],
      outboundBoxes: [],
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a);
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });

    const done = (eventId, lines, requestIds) => ({
      eventId,
      staffId: "stf-ivan",
      at: Date.now() - 300,
      toteId: "t1",
      outboundCode: "UK-LBL-OZ7",
      outboundId: `out-${eventId}`,
      lines,
      requestIds,
      shortages: [],
    });
    const half = await ops(desk, [
      {
        key: "key-merge-half",
        kind: "pack_done",
        body: done("ev-h", [{ productId: "pr1", qty: 1 }], ["r1"]),
      },
    ]);
    assert.deepEqual(half.json.results, [
      { key: "key-merge-half", status: "flagged", reason: "mixed" },
    ]);

    const merged = await ops(desk, [
      {
        key: "key-merge-0001",
        kind: "pack_merge",
        body: {
          eventId: "ev-m",
          staffId: "stf-ivan",
          at: Date.now() - 200,
          toteId: "t1",
          fromToteId: "t2",
        },
      },
      // Сервер закрывает посылку площадки только с этикетками её штук и
      // этикеткой заказа (`deskPack.js`), как их шлёт стол.
      {
        key: "key-merge-l001",
        kind: "pack_event",
        body: {
          eventId: "ev-key-merge-l001",
          staffId: "stf-ivan",
          type: "pack_label",
          at: Date.now() - 150,
          toteId: "t1",
          code: "UK-LBL-OZ7-001",
          orderId: "r1",
          productId: "pr1",
        },
      },
      {
        key: "key-merge-l002",
        kind: "pack_event",
        body: {
          eventId: "ev-key-merge-l002",
          staffId: "stf-ivan",
          type: "pack_label",
          at: Date.now() - 150,
          toteId: "t1",
          code: "UK-LBL-OZ7-002",
          orderId: "r1",
          productId: "pr1",
        },
      },
      {
        key: "key-merge-l003",
        kind: "pack_event",
        body: {
          eventId: "ev-key-merge-l003",
          staffId: "stf-ivan",
          type: "pack_label",
          at: Date.now() - 150,
          toteId: "t1",
          code: "UK-ORD-R1",
          orderId: "r1",
        },
      },
      {
        key: "key-merge-done",
        kind: "pack_done",
        body: {
          ...done("ev-d", [{ productId: "pr1", qty: 2 }], ["r1", "r2"]),
          outboundCode: "UK-ORD-R1",
        },
      },
    ]);
    assert.deepEqual(
      merged.json.results.map((x) => [x.status, x.reason ?? null]),
      [
        ["applied", null],
        ["applied", null],
        ["applied", null],
        ["applied", null],
        ["applied", null],
      ],
    );
    const { snap } = await serverEvents("ops-m@sklad.ru", a.org);
    const box = Object.fromEntries(snap.data.boxes.map((b) => [b.id, b.lines]));
    assert.deepEqual([box.t1, box.t2], [[], []]);
    assert.deepEqual(
      snap.data.outboundBoxes.map((o) => o.requestIds),
      [["r1", "r2"]],
    );
    const kinds = await db.root.query(
      `SELECT kind, step FROM uklad.desk_ops WHERE org_id = $1 AND kind = 'pack_merge'`,
      [a.org],
    );
    assert.deepEqual(kinds.rows, [{ kind: "pack_merge", step: "pack" }]);
  },
);

test("старший перекладывает тару целиком, упаковщик без права — нет", { skip: SKIP }, async () => {
  const { a, boss, ivan } = await company("ops-mv@sklad.ru", "10.0.5.13");
  const data = {
    ...cabinetData(),
    boxes: [
      { id: "t1", barcode: "UK-BOX-1", lines: [{ productId: "pr1", qty: 1 }] },
      { id: "t2", barcode: "UK-BOX-2", lines: [{ productId: "pr1", qty: 2 }] },
    ],
    requests: [
      { id: "r1", productId: "pr1", qty: 2, toteId: "t2", status: "done", externalId: "WB-1" },
    ],
    outboundBoxes: [],
  };
  const saved = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 1, format: 8, data },
  });
  assert.equal(saved.status, 200);
  const desk = await makeDesk(a);
  const move = (key, staffId) => ({
    key,
    kind: "pack_move",
    body: { eventId: `ev-${key}`, staffId, at: Date.now() - 200, toteId: "t1", fromToteId: "t2" },
  });
  await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
  const no = await ops(desk, [move("key-move-ivan", "stf-ivan")]);
  assert.deepEqual(no.json.results, [
    { key: "key-move-ivan", status: "flagged", reason: "not_yours" },
  ]);
  await call("/api/cabinet/badges/check", { desk, body: { code: boss } });
  const yes = await ops(desk, [move("key-move-boss", "stf-boss")]);
  assert.deepEqual(yes.json.results, [{ key: "key-move-boss", status: "applied" }]);
  const { snap } = await serverEvents("ops-mv@sklad.ru", a.org);
  const box = Object.fromEntries(snap.data.boxes.map((b) => [b.id, b.lines]));
  assert.deepEqual(box.t1, [{ productId: "pr1", qty: 3 }]);
  assert.deepEqual(box.t2, []);
  assert.equal(snap.data.requests[0].toteId, "t1");
  const row = await db.root.query(
    `SELECT staff_ref, step FROM uklad.desk_ops WHERE org_id = $1 AND kind = 'pack_move' AND status = 'applied'`,
    [a.org],
  );
  assert.deepEqual(row.rows, [{ staff_ref: "stf-boss", step: "pack" }]);
});

test(
  "упаковка операцией: тара → короб, движения записаны, лишнего не взять",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-f@sklad.ru", "10.0.5.6");
    // Руководитель кладёт тару с собранным под заявку.
    const data = {
      ...cabinetData(),
      boxes: [{ id: "t1", barcode: "UK-BOX-1", lines: [{ productId: "pr1", qty: 3 }] }],
      requests: [
        { id: "r1", productId: "pr1", qty: 2, status: "done", toteId: "t1", note: "Тула" },
      ],
      outboundBoxes: [],
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a);
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });

    const body = (over = {}) => ({
      eventId: "ev-pack-1",
      staffId: "stf-ivan",
      at: Date.now() - 500,
      toteId: "t1",
      outboundCode: "UK-OUT-1",
      outboundId: "out1",
      lines: [{ productId: "pr1", qty: 2 }],
      requestIds: ["r1"],
      shortages: [{ id: "disp-1", productId: "pr1", qty: 1 }],
      ...over,
    });
    const more = await ops(desk, [
      {
        key: "key-pack-more",
        kind: "pack_done",
        body: body({ eventId: "ev-x", lines: [{ productId: "pr1", qty: 5 }] }),
      },
    ]);
    assert.deepEqual(more.json.results, [
      { key: "key-pack-more", status: "flagged", reason: "stock" },
    ]);

    // Этикетки — только журнал: сотня «упаковал» без закрытия тары не
    // двигает товар, и платить за пики по ним нельзя — пик считается по
    // движению в короб отгрузки (`uklad.stock_moves`).
    const labels = Array.from({ length: 5 }, (_, i) => ({
      key: `key-label-${i}xx`,
      kind: "pack_event",
      body: {
        eventId: `ev-label-${i}`,
        staffId: "stf-ivan",
        type: "pack_label",
        at: Date.now() - 400,
        toteId: "t1",
        productId: "pr1",
      },
    }));
    const lr = await ops(desk, labels);
    assert.ok(lr.json.results.every((x) => x.status === "applied"));
    const none = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.stock_moves WHERE org_id = $1 AND desk_id IS NOT NULL`,
      [a.org],
    );
    assert.equal(none.rows[0].n, 0);

    const r = await ops(desk, [{ key: "key-pack-0001", kind: "pack_done", body: body() }]);
    assert.deepEqual(r.json.results, [{ key: "key-pack-0001", status: "applied" }]);

    const { snap } = await serverEvents("ops-f@sklad.ru", a.org);
    assert.deepEqual(snap.data.boxes[0].lines, [{ productId: "pr1", qty: 1 }]);
    assert.deepEqual(snap.data.outboundBoxes[0].lines, [{ productId: "pr1", qty: 2 }]);
    assert.equal(snap.data.requests[0].packedBy, "stf-ivan");
    assert.equal(snap.data.disputes.find((d) => d.id === "disp-1").kind, "shortage");
    // Товары остались в таблице, а не вернулись в снимок.
    const raw = await db.root.query(
      `SELECT data ? 'products' AS has FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.equal(raw.rows[0].has, false);
    const moves = await db.root.query(
      `SELECT place_kind, place_ref, delta, staff_ref FROM uklad.stock_moves
     WHERE org_id = $1 AND desk_id IS NOT NULL ORDER BY place_kind`,
      [a.org],
    );
    assert.deepEqual(
      moves.rows.map((m) => [m.place_kind, m.place_ref, m.delta, m.staff_ref]),
      [
        ["box", "t1", -2, "stf-ivan"],
        ["outbound", "out1", 2, "stf-ivan"],
      ],
    );
  },
);

test(
  "сборка операцией: полка → тара, движения за сотрудником, лишнего не снять",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-g@sklad.ru", "10.0.5.7");
    const cell = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
    const data = {
      ...cabinetData(),
      boxes: [
        { id: "b1", barcode: "UK-BOX-1", address: cell, lines: [{ productId: "pr1", qty: 3 }] },
        { id: "t1", barcode: "UK-BOX-7", lines: [] },
      ],
      requests: [{ id: "r1", productId: "pr1", qty: 2, status: "new", note: "Тула" }],
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a, "dev-pick");
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });

    const unit = (i) => ({
      key: `key-pick-${i}xxx`,
      kind: "pick_unit",
      body: {
        eventId: `ev-pick-${i}`,
        staffId: "stf-ivan",
        at: Date.now() - 500,
        requestId: "r1",
        productId: "pr1",
        toteId: "t1",
        cell,
      },
    });
    const done = {
      key: "key-pick-done",
      kind: "pick_done",
      body: { eventId: "ev-pick-done", staffId: "stf-ivan", at: Date.now() - 400, requestId: "r1" },
    };
    // Роль решает, что можно у стола: своя роль «Упаковка» не собирает,
    // старший участка — да.
    // Вход руководителя в этом браузере погас со столом — входит заново.
    const office = { cookie: await login("ops-g@sklad.ru"), org: a.org };
    const team = (await call("/api/team", office)).json;
    // Роли у каждого склада свои (058): стол — на складе wh_1.
    const here = team.roles.filter((x) => x.warehouseRef === "wh_1");
    const roles = Object.fromEntries(here.map((x) => [x.name, x.id]));
    roles["Упаковка"] = (
      await call("/api/team/roles/save", {
        ...office,
        body: {
          name: "Упаковка",
          permissions: ["packing.view", "packing.do"],
          warehouseRef: "wh_1",
        },
      })
    ).json.roleId;
    const role = (name) =>
      call("/api/team/desk-role", {
        ...office,
        body: { staffRef: "stf-ivan", roleId: roles[name] },
      });
    assert.equal((await role("Упаковка")).status, 200);
    const packer = await ops(desk, [{ ...unit(0), key: "key-pick-pack" }]);
    assert.deepEqual(
      packer.json.results.map((x) => [x.status, x.reason]),
      [["flagged", "not_yours"]],
    );
    const lead = await role("Старший участка");
    assert.equal(lead.status, 200, JSON.stringify(lead.json));
    const r = await ops(desk, [unit(1), unit(2), unit(3), done]);
    assert.deepEqual(
      r.json.results.map((x) => [x.key, x.status, x.reason ?? null]),
      [
        ["key-pick-1xxx", "applied", null],
        ["key-pick-2xxx", "applied", null],
        // Третья штука сверх заявки: с полки не снимается.
        ["key-pick-3xxx", "flagged", "stock"],
        ["key-pick-done", "applied", null],
      ],
    );
    // Вторая штука легла не в ту тару: сборщик отменяет свой скан. Штука —
    // обратно в короб, заявка снова собирается; сверка остатков проходит.
    const back = await ops(desk, [
      {
        key: "key-pick-undo",
        kind: "pick_undo",
        body: {
          eventId: "ev-undo-1",
          staffId: "stf-ivan",
          at: Date.now() - 300,
          pickId: "ev-pick-2",
        },
      },
    ]);
    assert.deepEqual(
      back.json.results.map((x) => [x.status, x.reason ?? null]),
      [["applied", null]],
    );

    const { snap } = await serverEvents("ops-g@sklad.ru", a.org);
    const box = Object.fromEntries(snap.data.boxes.map((b) => [b.id, b.lines]));
    assert.deepEqual(box.b1, [{ productId: "pr1", qty: 2 }]);
    assert.deepEqual(box.t1, [{ productId: "pr1", qty: 1 }]);
    const req = snap.data.requests.find((x) => x.id === "r1");
    assert.deepEqual([req.status, req.pickedQty, req.toteId], ["in_progress", 1, "t1"]);
    assert.deepEqual(
      snap.data.staffEvents.filter((e) => e.type === "pick_undo").map((e) => e.undoes),
      ["ev-pick-2"],
    );
    assert.deepEqual(
      snap.data.staffEvents.filter((e) => e.type === "pick_scan").map((e) => [e.id, e.staffId]),
      [
        ["ev-pick-1", "stf-ivan"],
        ["ev-pick-2", "stf-ivan"],
      ],
    );
    const moves = await db.root.query(
      `SELECT place_kind, place_ref, sum(delta)::int AS d, min(staff_ref) AS who
       FROM uklad.stock_moves WHERE org_id = $1 AND desk_id IS NOT NULL
       GROUP BY 1, 2 ORDER BY 1, 2`,
      [a.org],
    );
    assert.deepEqual(
      moves.rows.map((m) => [m.place_kind, m.place_ref, m.d, m.who]),
      [
        ["box", "b1", -1, "stf-ivan"],
        ["box", "t1", 1, "stf-ivan"],
        ["box_at", "f1/m1/0/0#b1", -1, "stf-ivan"],
      ],
    );
    // «Нет на месте»: короб b1 — старшему на пересчёт, из него не собирают.
    const miss = await ops(desk, [
      {
        key: "key-pick-miss",
        kind: "pick_missing",
        body: {
          eventId: "ev-miss-1",
          staffId: "stf-ivan",
          at: Date.now() - 200,
          requestId: "r1",
          productId: "pr1",
          cell,
        },
      },
      { ...unit(4), body: { ...unit(4).body, at: Date.now() - 100 } },
    ]);
    assert.deepEqual(
      miss.json.results.map((x) => [x.status, x.reason ?? null]),
      [
        ["applied", null],
        ["flagged", "stock"],
      ],
    );
    const after = (await serverEvents("ops-g@sklad.ru", a.org)).snap.data;
    assert.deepEqual(
      after.disputes
        .filter((d) => d.id === "mis-ev-miss-1")
        .map((d) => [d.kind, d.boxId, d.qty, d.raisedBy]),
      [["inventory_short", "b1", 2, "stf-ivan"]],
    );
  },
);

test(
  "приёмка операциями: место вскрыто → в тару → на полку, движения за сотрудником",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-r@sklad.ru", "10.0.5.8");
    // Бейдж старшего — до стола: заведённый стол гасит вход руководителя.
    const olga = (await call("/api/cabinet/badges/issue", { ...a, body: { staffRef: "stf-olga" } }))
      .json.code;
    const cell = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 2 };
    const base = cabinetData();
    const data = {
      ...base,
      warehouse: { ...base.warehouse, floors: [{ id: "f1", modules: [{ id: "m1" }] }] },
      boxes: [{ id: "b5", barcode: "UK-BOX-5", lines: [], sealed: true, shipmentId: "s1" }],
      expectedShipments: [
        {
          id: "s1",
          status: "pending",
          lines: [{ id: "l1", productId: "pr1", expectedQty: 4, receivedQty: 0 }],
        },
      ],
      receivingEvents: [],
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a, "dev-recv");
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });

    const at = Date.now() - 500;
    const op = (key, kind, body) => ({
      key: `key-recv-${key}`,
      kind,
      body: { eventId: `ev-recv-${key}`, staffId: "stf-ivan", at, ...body },
    });
    const recv = (key) =>
      op(key, "recv_unit", {
        eventId: "ev-recv-unit",
        productId: "pr1",
        qty: 4,
        boxId: "b5",
        shipmentId: "s1",
        lineId: "l1",
      });
    const r = await ops(desk, [
      // До вскрытия в место не принять.
      recv("early"),
      op("open", "recv_open", { unitId: "b5" }),
      recv("unit"),
      // Тот же факт другим ключом (очередь и снимок) — второй раз не ляжет.
      recv("again"),
      // Сверх строки: сервер сам ставит «лишнее», стол об этом не говорил.
      op("extra", "recv_unit", {
        eventId: "ev-recv-extra",
        productId: "pr1",
        qty: 2,
        boxId: "b5",
        shipmentId: "s1",
        lineId: "l1",
      }),
      op("place", "recv_place", { boxId: "b5", cell }),
      op("close", "recv_close", { shipmentId: "s1" }),
    ]);
    assert.deepEqual(
      r.json.results.map((x) => [x.key, x.status, x.reason ?? null]),
      [
        ["key-recv-early", "flagged", "tote"],
        ["key-recv-open", "applied", null],
        ["key-recv-unit", "applied", null],
        ["key-recv-again", "applied", null],
        ["key-recv-extra", "applied", null],
        ["key-recv-place", "applied", null],
        ["key-recv-close", "applied", null],
      ],
    );

    const { snap } = await serverEvents("ops-r@sklad.ru", a.org);
    const box = snap.data.boxes.find((b) => b.id === "b5");
    assert.deepEqual(
      [box.sealed, box.lines, box.address],
      [undefined, [{ productId: "pr1", qty: 6 }], cell],
    );
    const sh = snap.data.expectedShipments[0];
    assert.deepEqual([sh.status, sh.lines[0].receivedQty], ["closed", 6]);
    assert.deepEqual(
      snap.data.receivingEvents.map((e) => [e.id, e.qty, e.staffId, e.discrepancy ?? null]),
      [
        ["ev-recv-unit", 4, "stf-ivan", null],
        ["ev-recv-extra", 2, "stf-ivan", "overage"],
      ],
    );
    // Лишнее — спорным старшему, заводит сервер.
    assert.deepEqual(
      snap.data.disputes
        .filter((d) => d.kind === "receive_overage")
        .map((d) => [d.id, d.qty, d.raisedBy]),
      [["ovr-ev-recv-extra", 2, "stf-ivan"]],
    );

    // Старший возвращает лишнее поставщику за столом. Тара уже на полке —
    // списание всё равно снимает с неё, а журнал движений подписан старшим.
    await call("/api/cabinet/badges/check", { desk, body: { code: olga } });
    const w = await ops(desk, [
      op("off", "dispute_resolve", {
        eventId: "ev-recv-off",
        staffId: "stf-olga",
        at: Date.now() - 200,
        disputeId: "ovr-ev-recv-extra",
        resolution: "written_off",
        note: "водитель забрал",
      }),
    ]);
    assert.deepEqual(w.json.results, [{ key: "key-recv-off", status: "applied" }]);
    const after = await serverEvents("ops-r@sklad.ru", a.org);
    assert.deepEqual(after.snap.data.boxes.find((b) => b.id === "b5").lines, [
      { productId: "pr1", qty: 4 },
    ]);
    assert.equal(
      after.snap.data.disputes.find((d) => d.id === "ovr-ev-recv-extra").resolution,
      "written_off",
    );
    const offMoves = await db.root.query(
      `SELECT place_kind, place_ref, delta, staff_ref FROM uklad.stock_moves
       WHERE org_id = $1 AND staff_ref = 'stf-olga' ORDER BY 1, 2`,
      [a.org],
    );
    assert.deepEqual(
      offMoves.rows.map((m) => [m.place_kind, m.place_ref, m.delta]),
      [
        ["box", "b5", -2],
        ["box_at", "f1/m1/0/2#b5", -2],
      ],
    );
    const moves = await db.root.query(
      `SELECT place_kind, place_ref, sum(delta)::int AS d, min(staff_ref) AS who
       FROM uklad.stock_moves WHERE org_id = $1 AND desk_id IS NOT NULL
         AND staff_ref = 'stf-ivan'
       GROUP BY 1, 2 ORDER BY 1, 2`,
      [a.org],
    );
    assert.deepEqual(
      moves.rows.map((m) => [m.place_kind, m.place_ref, m.d, m.who]),
      [
        ["box", "b5", 6, "stf-ivan"],
        ["box_at", "f1/m1/0/2#b5", 6, "stf-ivan"],
      ],
    );
  },
);

test(
  "рейс и решение старшего операциями: уехало своё, решает только старший",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-s@sklad.ru", "10.0.5.9");
    const olga = (await call("/api/cabinet/badges/issue", { ...a, body: { staffRef: "stf-olga" } }))
      .json.code;
    const data = {
      ...cabinetData(),
      boxes: [{ id: "b1", barcode: "UK-BOX-1", lines: [{ productId: "pr1", qty: 2 }] }],
      requests: [
        { id: "r1", productId: "pr1", qty: 1, status: "done", note: "Тула", toteId: "b0" },
      ],
      outboundBoxes: [
        {
          id: "o1",
          code: "UK-OUT-1",
          requestIds: ["r1"],
          lines: [{ productId: "pr1", qty: 1 }],
          packedBy: ["stf-ivan"],
          createdAt: 1,
        },
      ],
      shipments: [],
      disputes: [
        {
          id: "q7",
          kind: "shortage",
          boxId: "b1",
          productId: "pr1",
          qty: 1,
          raisedBy: "stf-ivan",
          raisedAt: 1,
        },
      ],
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a, "dev-ship");
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const at = Date.now() - 500;
    const ship = {
      key: "key-ship-1xxx",
      kind: "ship_run",
      body: {
        eventId: "ship-1",
        staffId: "stf-ivan",
        at,
        requestIds: ["r1"],
        vehicle: "А123ВС77",
        units: ["UK-OUT-1"],
      },
    };
    const resolve = (key, staffId) => ({
      key,
      kind: "dispute_resolve",
      body: {
        eventId: `ev-${key}`,
        staffId,
        at,
        disputeId: "q7",
        resolution: "written_off",
        note: "пересчитали",
      },
    });
    // Грузчик решать не вправе.
    let r = await ops(desk, [ship, resolve("key-res-ivan", "stf-ivan")]);
    assert.deepEqual(
      r.json.results.map((x) => [x.status, x.reason ?? null]),
      [
        ["applied", null],
        ["flagged", "not_yours"],
      ],
    );
    await call("/api/cabinet/badges/check", { desk, body: { code: olga } });
    r = await ops(desk, [resolve("key-res-olga", "stf-olga")]);
    assert.deepEqual(
      r.json.results.map((x) => [x.status, x.reason ?? null]),
      [["applied", null]],
    );

    const { snap } = await serverEvents("ops-s@sklad.ru", a.org);
    assert.equal(snap.data.requests.find((x) => x.id === "r1").status, "shipped");
    assert.deepEqual(
      snap.data.shipments.map((s) => [s.id, s.staffId, s.vehicle]),
      [["ship-1", "stf-ivan", "А123ВС77"]],
    );
    assert.equal(snap.data.outboundBoxes[0].shipmentId, "ship-1");
    const q7 = snap.data.disputes.find((d) => d.id === "q7");
    assert.deepEqual([q7.resolution, q7.resolvedBy], ["written_off", "stf-olga"]);
    assert.deepEqual(snap.data.boxes.find((b) => b.id === "b1").lines, [
      { productId: "pr1", qty: 1 },
    ]);
  },
);

test(
  "грузовая приёмка операцией: номера мест выдаёт сервер, повтор ключа — те же места",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-k@sklad.ru", "10.0.5.10");
    const data = {
      ...cabinetData(),
      // Другой стол уже взял номер 40, а счётчик в снимке отстал.
      pallets: [{ id: "pl0", barcode: "UK-PLT-40", boxIds: [] }],
      boxes: [{ id: "b1", barcode: "UK-BOX-7", lines: [] }],
      palletSeq: 3,
      boxSeq: 7,
      expectedShipments: [{ id: "s1", status: "pending", lines: [] }],
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a, "dev-recv");
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const cargo = {
      key: "key-cargo-1xx",
      kind: "recv_cargo",
      body: {
        eventId: "cargo-1",
        staffId: "stf-ivan",
        at: Date.now() - 500,
        shipmentId: "s1",
        pallets: 2,
        boxes: 1,
        declaredPallets: 3,
      },
    };
    const made = {
      pallets: [
        { id: "cargo-1-p0", barcode: "UK-PLT-41" },
        { id: "cargo-1-p1", barcode: "UK-PLT-42" },
      ],
      boxes: [{ id: "cargo-1-b0", barcode: "UK-BOX-8" }],
    };
    let r = await ops(desk, [cargo]);
    assert.deepEqual(r.json.results, [{ key: "key-cargo-1xx", status: "applied", made }]);
    // Ответ потерялся, стол повторяет тем же ключом — те же места, не новые.
    r = await ops(desk, [cargo]);
    assert.deepEqual(r.json.results, [
      { key: "key-cargo-1xx", status: "applied", duplicate: true, made },
    ]);
    // Тот же ключ с другим событием отвечает местами первой операции, а не
    // чужими; новая операция с чужим событием — отказ, мест не выдаёт.
    const other = { ...cargo, body: { ...cargo.body, eventId: "cargo-x" } };
    r = await ops(desk, [other]);
    assert.deepEqual(r.json.results[0].made, made);
    r = await ops(desk, [{ ...cargo, key: "key-cargo-2xx" }]);
    assert.deepEqual(r.json.results, [{ key: "key-cargo-2xx", status: "flagged", reason: "bad" }]);
    const { snap } = await serverEvents("ops-k@sklad.ru", a.org);
    assert.equal(snap.data.pallets.length, 3);
    assert.deepEqual([snap.data.palletSeq, snap.data.boxSeq], [42, 8]);
    const sh = snap.data.expectedShipments[0];
    assert.equal(sh.status, "receiving");
    assert.deepEqual(
      [sh.cargo.pallets, sh.cargo.boxes, sh.cargo.declaredPallets, sh.cargo.staffId],
      [2, 1, 3, "stf-ivan"],
    );
    assert.ok(snap.data.boxes.find((b) => b.id === "cargo-1-b0").sealed);
  },
);

test(
  "пересчёт пустой ячейки операцией: право счёта, только своя свободная тара, учёт не двигается",
  { skip: SKIP },
  async () => {
    const { a, boss, ivan } = await company("ops-inv@sklad.ru", "10.0.5.12");
    const A = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
    const FREE = { ...A, cellIndex: 1 };
    const base = cabinetData();
    const data = {
      ...base,
      warehouse: {
        ...base.warehouse,
        floors: [{ id: "f1", modules: [{ id: "m1", shelves: [{ id: "s0", cells: 3 }] }] }],
      },
      boxes: [
        { id: "b1", barcode: "UK-BOX-1", address: A, lines: [{ productId: "pr1", qty: 3 }] },
        { id: "t1", barcode: "UK-BOX-7", lines: [] },
        { id: "t2", barcode: "UK-BOX-8", lines: [{ productId: "pr1", qty: 1 }] },
      ],
      disputes: [],
      // Тара второго склада: столу первого её не видно.
      warehouseData: { wh_2: { boxes: [{ id: "tx", barcode: "UK-BOX-90", lines: [] }] } },
    };
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a, "dev-inv");
    const found = [{ productId: "pr1", qty: 2 }];
    const op = (key, staffId, over = {}) => ({
      key,
      kind: "inv_cell",
      body: {
        eventId: `ev-${key}`,
        staffId,
        at: Date.now() - 500,
        cell: FREE,
        lines: found,
        ...over,
      },
    });

    // Своей роли «Приёмка» пересчитывать нельзя: права `inventory.count` у неё нет.
    // Вход руководителя в этом браузере погас со столом — входит заново.
    const office = { cookie: await login("ops-inv@sklad.ru"), org: a.org };
    const receiver = (
      await call("/api/team/roles/save", {
        ...office,
        body: {
          name: "Приёмка",
          permissions: ["receiving.view", "receiving.do"],
          warehouseRef: "wh_1",
        },
      })
    ).json.roleId;
    const set = await call("/api/team/desk-role", {
      ...office,
      body: { staffRef: "stf-ivan", roleId: receiver },
    });
    assert.equal(set.status, 200);
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const denied = await ops(desk, [op("key-inv-ivan", "stf-ivan", { boxId: "t1" })]);
    assert.deepEqual(
      denied.json.results.map((x) => [x.status, x.reason]),
      [["flagged", "not_yours"]],
    );

    await call("/api/cabinet/badges/check", { desk, body: { code: boss } });
    const r = await ops(desk, [
      op("key-inv-full", "stf-boss", { boxId: "t2" }),
      op("key-inv-other", "stf-boss", { boxId: "tx" }),
      op("key-inv-busy", "stf-boss", { boxId: "t1", cell: A }),
      op("key-inv-empty", "stf-boss", { lines: [], cell: { ...A, cellIndex: 2 } }),
      op("key-inv-ok", "stf-boss", { boxId: "t1" }),
    ]);
    assert.deepEqual(
      r.json.results.map((x) => [x.key, x.status, x.reason ?? null]),
      [
        ["key-inv-full", "flagged", "stock"],
        ["key-inv-other", "flagged", "bad"],
        ["key-inv-busy", "flagged", "busy"],
        ["key-inv-empty", "applied", null],
        ["key-inv-ok", "applied", null],
      ],
    );

    // Учёт до решения старшего не двинулся: строки тары те же, движений нет.
    const cookie = await login("ops-inv@sklad.ru");
    const snap = (await call("/api/cabinet/snapshot", { cookie, org: a.org })).json.snapshot;
    const box = Object.fromEntries(snap.data.boxes.map((b) => [b.id, b]));
    assert.deepEqual(box.b1.lines, [{ productId: "pr1", qty: 3 }]);
    assert.deepEqual(box.t1.lines, []);
    assert.deepEqual(box.t1.address, FREE);
    assert.deepEqual(box.t2.address, undefined);
    assert.deepEqual(
      snap.data.disputes.map((d) => [d.kind, d.boxId, d.productId, d.qty, d.raisedBy]),
      [["inventory_over", "t1", "pr1", 2, "stf-boss"]],
    );
    assert.equal(snap.data.warehouseData.wh_2.boxes[0].address, undefined);
    const moves = await db.root.query(
      "SELECT count(*)::int AS n FROM uklad.stock_moves WHERE org_id = $1 AND desk_id IS NOT NULL",
      [a.org],
    );
    assert.equal(moves.rows[0].n, 0);
    // «Пусто» осталось строкой журнала операций стола.
    const logged = await db.root.query(
      "SELECT kind, status FROM uklad.desk_ops WHERE org_id = $1 AND kind = 'inv_cell'",
      [a.org],
    );
    assert.ok(logged.rows.some((x) => x.status === "applied"));

    // Акт: руководитель получает принятые пересчёты за сутки, стол — нет.
    const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
    const q = `/api/cabinet/inventory?from=${day}&to=${day}`;
    const act = await call(q, { cookie, org: a.org });
    assert.equal(act.status, 200);
    assert.deepEqual(
      act.json.entries
        .map((e) => [e.kind, e.staff, e.boxId ?? null, e.lines.length])
        .sort((x, y) => x[3] - y[3]),
      [
        ["inv_cell", "stf-boss", null, 0],
        ["inv_cell", "stf-boss", "t1", 1],
      ],
    );
    assert.equal((await call(q, { desk })).status, 403);
    assert.equal(
      (await call(`/api/cabinet/inventory?from=${day}`, { cookie, org: a.org })).status,
      400,
    );

    // Чужая компания своих пересчётов не видит, а заголовком к чужим не пройдёт.
    const b = await owner("ops-inv-b@sklad.ru", "10.0.1.92");
    const own = await call(q, b);
    assert.equal(own.status, 200);
    assert.deepEqual(own.json.entries, []);
    assert.ok([401, 403].includes((await call(q, { cookie: b.cookie, org: a.org })).status));

    // Вход паролем, но роль без «Персонала» (смотрящий) — акта не получает.
    await db.root.query(
      `UPDATE uklad.roles SET permissions = array_remove(permissions, 'staff.manage')
        WHERE org_id = $1 AND name = 'Владелец'`,
      [a.org],
    );
    assert.equal((await call(q, { cookie, org: a.org })).status, 403);
  },
);

test(
  "смена процесса: сотрудник просит, старший разрешает в кабинете, сервер держит процесс",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-switch@sklad.ru", "10.0.5.9");
    const desk = await makeDesk(a);
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const place = (key) => ({
      key,
      kind: "sort_place",
      body: { eventId: `ev-${key}`, at: Date.now() - 100, code: "UK-OUT-1", sortCode: "S1" },
    });

    // Стол упаковки: сортировку без перехода сервер не примет.
    const before = await ops(desk, [place("key-place-01")]);
    assert.equal(before.json.results[0].reason, "station");

    // Заявка — и пока старший не решил, применить её нельзя.
    const asked = await call("/api/desk/switch", {
      desk,
      body: { station: "sorting", from: "pack" },
    });
    assert.equal(asked.status, 200);
    const id = asked.json.id;
    const early = await call("/api/desk/switch/apply", { desk, body: { id, at: Date.now() } });
    assert.equal(early.status, 409);

    // Подделать переход пачкой операций стол не может.
    const forged = await ops(desk, [
      {
        key: "key-forged-01",
        kind: "station_switch",
        body: { eventId: "f1", at: Date.now(), station: "sorting" },
      },
    ]);
    assert.equal(forged.status, 400);
    // И разрешить свою заявку стол не может: решения — только из кабинета.
    const self = await call("/api/cabinet/switch-requests/decide", {
      desk,
      body: { id, approve: true },
    });
    assert.notEqual(self.status, 200);

    // Старший в кабинете видит заявку и разрешает.
    const cookie = await login("ops-switch@sklad.ru");
    const list = await call("/api/cabinet/switch-requests", { cookie, org: a.org });
    assert.equal(list.status, 200);
    assert.deepEqual(
      list.json.requests.map((r) => [r.id, r.staffRef, r.station, r.from]),
      [[id, "stf-ivan", "sorting", "pack"]],
    );
    const yes = await call("/api/cabinet/switch-requests/decide", {
      cookie,
      org: a.org,
      body: { id, approve: true },
    });
    assert.equal(yes.status, 200);
    // Второе решение по той же заявке — уже нечего решать.
    const again = await call("/api/cabinet/switch-requests/decide", {
      cookie,
      org: a.org,
      body: { id, approve: false },
    });
    assert.equal(again.status, 404);

    const st = await call(`/api/desk/switch?id=${id}`, { desk });
    assert.equal(st.json.status, "approved");
    const applied = await call("/api/desk/switch/apply", {
      desk,
      body: { id, at: Date.now() - 200 },
    });
    assert.deepEqual([applied.status, applied.json.station], [200, "sorting"]);

    // Решённая не пропадает без следа: в «Решённых» видно, что стол её применил.
    const open = await call("/api/cabinet/switch-requests", { cookie, org: a.org });
    assert.deepEqual(open.json.requests, []);
    const done = await call("/api/cabinet/switch-requests?status=decided", { cookie, org: a.org });
    assert.equal(done.status, 200);
    assert.deepEqual(
      done.json.requests.map((r) => [r.id, r.status, typeof r.decidedAt]),
      [[id, "applied", "number"]],
    );
    assert.ok(done.json.requests[0].decidedBy);
    // Стол решённые заявки не читает: это кабинет.
    const fromDesk = await call("/api/cabinet/switch-requests?status=decided", { desk });
    assert.notEqual(fromDesk.status, 200);

    // Теперь сортировка — его процесс, упаковка — нет.
    const after = await ops(desk, [place("key-place-02")]);
    assert.notEqual(after.json.results[0].reason, "station");
    const pack = await ops(desk, [
      {
        key: "key-pack-01",
        kind: "pack_event",
        body: { eventId: "p1", at: Date.now() - 50, toteId: "b1", code: "x" },
      },
    ]);
    assert.equal(pack.json.results[0].reason, "station");

    const j = await call("/api/cabinet/desks/journal?device=dev-1", { cookie, org: a.org });
    const rows = j.json.entries.filter((e) => e.kind === "station_switch");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].staffRef, "stf-ivan");
    assert.equal(rows[0].refs.station, "sorting");
    assert.ok(rows[0].refs.approvedBy);
  },
);

test(
  "работы склада у стола: взял и сделал операциями, чужую не взять, в счёт — не больше заданного",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-tasks@sklad.ru", "10.0.5.14");
    const base = cabinetData();
    const tasks = [
      { id: "t-mark", kind: "marking", status: "open", qty: 10, partnerId: "p1", createdAt: 1 },
      { id: "t-olga", kind: "marking", status: "open", qty: 3, staffId: "stf-olga", createdAt: 2 },
    ];
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data: { ...base, tasks } },
    });
    assert.equal(saved.status, 200);
    const desk = await makeDesk(a, "dev-1");
    await call("/api/cabinet/badges/check", { desk, body: { code: ivan } });
    const at = Date.now() - 500;
    const op = (key, kind, taskId, over = {}) => ({
      key,
      kind,
      body: { eventId: `ev-${key}`, staffId: "stf-ivan", at, taskId, ...over },
    });
    const r = await ops(desk, [
      op("key-task-take", "task_take", "t-mark"),
      op("key-task-more", "task_done", "t-mark", { qty: 11 }),
      op("key-task-done", "task_done", "t-mark", { qty: 4 }),
      op("key-task-olga", "task_take", "t-olga"),
    ]);
    assert.deepEqual(
      r.json.results.map((x) => [x.key, x.status, x.reason ?? null]),
      [
        ["key-task-take", "applied", null],
        ["key-task-more", "flagged", "bad"],
        ["key-task-done", "applied", null],
        ["key-task-olga", "flagged", "taken"],
      ],
    );

    const cookie = await login("ops-tasks@sklad.ru");
    const snap = (await call("/api/cabinet/snapshot", { cookie, org: a.org })).json.snapshot;
    const byId = Object.fromEntries(snap.data.tasks.map((t) => [t.id, t]));
    assert.deepEqual(
      [byId["t-mark"].status, byId["t-mark"].staffId, byId["t-mark"].qty, byId["t-mark"].doneAt],
      ["done", "stf-ivan", 4, at],
    );
    assert.equal(byId["t-olga"].status, "open");
    const logged = await db.root.query(
      `SELECT kind, status FROM uklad.desk_ops WHERE org_id = $1 AND kind LIKE 'task\\_%'
        ORDER BY received_at, kind`,
      [a.org],
    );
    assert.equal(logged.rows.filter((x) => x.status === "applied").length, 2);
  },
);
