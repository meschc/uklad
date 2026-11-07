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

test(
  "отмена отметки: в срок снимается, старая запись снимка её не вернёт",
  { skip: SKIP },
  async () => {
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

    // Стол успел отправить снимок с отметкой до отмены — запись приходит позже.
    const stale = await call("/api/cabinet/snapshot", {
      desk,
      body: { version: undone.json.version, format: 8, data: { ...snap.data } },
    });
    assert.equal(stale.status, 200);
    const { ids } = await serverEvents("ops-b@sklad.ru", a.org);
    assert.equal(
      ids.some(([id]) => id === "evb"),
      false,
    );
  },
);

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

    const empty = await owner("ops-d@sklad.ru", "10.0.5.4");
    const deskD = await makeDesk(empty);
    assert.equal((await ops(deskD, [mark("key-000001", "e", "shift_start")])).status, 409);
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
    const desk = await makeDesk(a);
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

    const { snap } = await serverEvents("ops-g@sklad.ru", a.org);
    const box = Object.fromEntries(snap.data.boxes.map((b) => [b.id, b.lines]));
    assert.deepEqual(box.b1, [{ productId: "pr1", qty: 1 }]);
    assert.deepEqual(box.t1, [{ productId: "pr1", qty: 2 }]);
    const req = snap.data.requests.find((x) => x.id === "r1");
    assert.deepEqual([req.status, req.pickedQty, req.toteId], ["done", 2, "t1"]);
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
        ["box", "b1", -2, "stf-ivan"],
        ["box", "t1", 2, "stf-ivan"],
        ["box_at", "f1/m1/0/0#b1", -2, "stf-ivan"],
      ],
    );
  },
);

test(
  "приёмка операциями: место вскрыто → в тару → на полку, движения за сотрудником",
  { skip: SKIP },
  async () => {
    const { a, ivan } = await company("ops-r@sklad.ru", "10.0.5.8");
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
    const desk = await makeDesk(a);
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
        ["key-recv-place", "applied", null],
        ["key-recv-close", "applied", null],
      ],
    );

    const { snap } = await serverEvents("ops-r@sklad.ru", a.org);
    const box = snap.data.boxes.find((b) => b.id === "b5");
    assert.deepEqual(
      [box.sealed, box.lines, box.address],
      [undefined, [{ productId: "pr1", qty: 4 }], cell],
    );
    const sh = snap.data.expectedShipments[0];
    assert.deepEqual([sh.status, sh.lines[0].receivedQty], ["closed", 4]);
    assert.deepEqual(
      snap.data.receivingEvents.map((e) => [e.id, e.qty, e.staffId]),
      [["ev-recv-unit", 4, "stf-ivan"]],
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
        ["box", "b5", 4, "stf-ivan"],
        ["box_at", "f1/m1/0/2#b5", 4, "stf-ivan"],
      ],
    );
  },
);
