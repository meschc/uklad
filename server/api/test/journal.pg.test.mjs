// Журнал действий склада (миграция 044) на настоящем Postgres.
//
// Кирилл 15.11: посекундная история действий, доступная руководителю, с
// разделением по процессу и товару. Проверяем три круга, как у прав: свой
// склад (операции стола видны со сотрудником, устройством и типом скана),
// второй склад той же компании (его журнал не показывает чужих операций,
// смотрящий второго склада первый не откроет) и чужая компания с тем же id
// склада (ничего не видит). Плюс тип скана и «пик за товар» по правилу базы
// и склад старых строк по привязке устройства. В конце — «Путь товара»
// (`cabinet/goodsPath.js`): поиск посылки по коду и её лента по шагам.
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
  const { createGoodsPath } = require("../src/cabinet/goodsPath.js");
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
    createGoodsPath({ auth, send, log: quiet }),
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
  // Роли у каждого склада свои (058).
  const roleId = roles.find((r) => r.name === role && r.warehouseRef === warehouseRef).id;
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
    const keeper = await invited(
      c.boss,
      "keeper-a@sklad.ru",
      "Кладовщик / оператор",
      "wh_a",
      "stf-k",
    );
    assert.equal((await journal(keeper, "?warehouse=wh_a")).status, 403);

    // Начальник склада читает журнал своего склада (Кирилл 24.11: «я начальник
    // склада и не могу смотреть журнал»).
    const head = await invited(c.boss, "head-a@sklad.ru", "Начальник склада", "wh_a", "stf-a");
    const mine = await journal(head, "?warehouse=wh_a");
    assert.equal(mine.status, 200, JSON.stringify(mine.json));
    assert.equal((await journal(head)).status, 200);
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
  // Миграция 044 шла, когда склады и устройства лежали в снимке (до 051 и
  // до справочников строками): возвращаем их туда.
  await db.root.query(
    `UPDATE uklad.cabinet_snapshots SET data = data || jsonb_build_object('warehouse',
       (SELECT card || jsonb_build_object('id', ref) FROM uklad.warehouses
        WHERE org_id = $1 AND position = 0 AND card IS NOT NULL AND deleted_at IS NULL),
       'devices', (SELECT data->'value' FROM uklad.cabinet_records
        WHERE org_id = $1 AND domain = 'warehouseSettings' AND ref = 'devices' AND warehouse_ref = 'wh_a'
          AND deleted_at IS NULL))
     WHERE org_id = $1`,
    [c.org],
  );
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

/** Путь одной штуки по складу А, строками операций, как их пишут столы. */
test(
  "действия руководителей: свой склад, компания — владельцу, член из сессии",
  { skip: SKIP },
  async () => {
    const { asOrg } = await import("../../db/test/helpers.js");
    const { logAction } = require("../src/cabinet/audit.js");
    const c = await company("journal-audit@sklad.ru", "10.0.7.20");
    const lead = await invited(c.boss, "lead-audit@sklad.ru", "Старший смены", "wh_b", "stf-l");
    const lines = [];
    const log = { info: (m) => lines.push(m) };
    const put = (warehouse, action, target) =>
      asOrg(db.pool, c.org, (x) =>
        logAction(x, log, { action, warehouse, target, details: { n: 1 }, source: "system" }),
      );
    await put("wh_a", "role.save", "role-a");
    await put("wh_b", "connector.delete", "conn-b");
    await put(null, "company.account", null);
    // Строка лога поддержки — с id, без имён.
    assert.equal(lines.length, 3);
    assert.match(lines[1], /действие connector\.delete .*"warehouse":"wh_b".*"target":"conn-b"/);

    const kinds = (r) => r.json.entries.filter((e) => e.source === "audit").map((e) => e.kind);
    // Без фильтра процессов они в общей ленте, с другим процессом — нет.
    assert.equal(kinds(await journal(c.boss, "?warehouse=wh_a")).length, 5);
    assert.deepEqual(kinds(await journal(c.boss, "?warehouse=wh_a&steps=pick")), []);
    // Владелец: склад А и действия компании.
    const boss = await journal(c.boss, "?warehouse=wh_a&steps=admin");
    assert.equal(boss.status, 200, JSON.stringify(boss.json));
    // Стол и бейдж склада А, заведённые в `company`, — тоже в журнале (шаг 8).
    assert.deepEqual(kinds(boss).sort(), [
      "badge.issue",
      "company.account",
      "desk.bind",
      "product.create",
      "role.save",
    ]);
    // Старший склада Б: только склад Б, без действий компании и склада А.
    const own = await journal(lead, "?steps=admin");
    assert.equal(own.status, 200, JSON.stringify(own.json));
    assert.deepEqual(kinds(own).sort(), ["connector.delete", "member.accept", "member.invite"]);
    // Принял приглашение — сам принявший, его склад, без почты.
    const accepted = own.json.entries.find((e) => e.kind === "member.accept");
    const invitedRow = own.json.entries.find((e) => e.kind === "member.invite");
    assert.equal(accepted.member.id, invitedRow.target);
    // Старший — не владелец: метки владельца нет. Приглашал владелец — метка есть,
    // по ней кабинет пишет его имя вместо «Кабинет» (разбор 27.11).
    assert.equal(accepted.member.owner, undefined);
    assert.equal(invitedRow.member.owner, true);
    assert.equal(accepted.target, invitedRow.target);
    // Имя приглашённого и роль — подставлены при чтении, в строке журнала их нет.
    const invite = own.json.entries.find((e) => e.kind === "member.invite");
    assert.equal(invite.roleName, "Старший смены");
    assert.ok(!JSON.stringify(invite.details ?? {}).includes("Старший"));
    const stored = await db.root.query(
      `SELECT details::text AS d FROM uklad.audit_events WHERE action = 'member.invite' AND org_id = $1`,
      [c.org],
    );
    assert.ok(stored.rows.every((r) => !/@|Старший/.test(r.d)));
    assert.equal((await journal(lead, "?warehouse=wh_a&steps=admin")).status, 403);

    // Подписать действие чужим участником нельзя: RLS сверяет с сессией.
    const someone = "00000000-0000-7000-8000-000000000001";
    await assert.rejects(
      asOrg(db.pool, c.org, (x) =>
        x.query(
          `INSERT INTO uklad.audit_events (org_id, action, member_id) VALUES ($1, 'role.save', $2)`,
          [c.org, someone],
        ),
      ),
    );
    // Чужой компании строку не записать.
    const other = await company("journal-audit2@sklad.ru", "10.0.7.21");
    await assert.rejects(
      asOrg(db.pool, other.org, (x) =>
        x.query(`INSERT INTO uklad.audit_events (org_id, action) VALUES ($1, 'role.save')`, [
          c.org,
        ]),
      ),
    );
    // Журнал не правят и не чистят.
    await assert.rejects(asOrg(db.pool, c.org, (x) => x.query(`DELETE FROM uklad.audit_events`)));
    // Из кабинета без участника — «кто-то» — нельзя; стол без сессии — можно, со
    // своим сотрудником.
    await assert.rejects(
      asOrg(db.pool, c.org, (x) =>
        x.query(`INSERT INTO uklad.audit_events (org_id, action) VALUES ($1, 'role.save')`, [
          c.org,
        ]),
      ),
    );
    await asOrg(db.pool, c.org, (x) =>
      logAction(x, log, {
        action: "badge.issue",
        warehouse: "wh_a",
        source: "desk",
        staffRef: "stf-a",
      }),
    );
    const desk = (await journal(c.boss, "?warehouse=wh_a&steps=admin")).json.entries.find(
      (e) => e.kind === "badge.issue",
    );
    assert.equal(desk.by, "desk");
    assert.equal(desk.staffRef, "stf-a");
    // Из кабинета с участником сессии — пишется, участник подставляется сам.
    await asOrg(
      db.pool,
      c.org,
      (x) => logAction(x, log, { action: "role.delete", warehouse: "wh_a" }),
      someone,
    );
    const { rows } = await db.root.query(
      `SELECT member_id, source FROM uklad.audit_events WHERE action = 'role.delete'`,
    );
    assert.deepEqual(rows, [{ member_id: someone, source: "cabinet" }]);
    // Что если нажать 1000 раз или прислать двадцать раз одновременно: одна строка.
    const rowsOf = async (action) =>
      (
        await db.root.query(`SELECT count(*)::int AS n FROM uklad.audit_events WHERE action = $1`, [
          action,
        ])
      ).rows[0].n;
    const tap = (target) =>
      asOrg(
        db.pool,
        c.org,
        (x) => logAction(x, log, { action: "member.disable", warehouse: "wh_a", target }),
        someone,
      );
    for (let i = 0; i < 1000; i++) await tap("m-1");
    await Promise.all(Array.from({ length: 20 }, () => tap("m-1")));
    assert.equal(await rowsOf("member.disable"), 1);
    // Другой человек (target) — своя строка: схлопываются только одинаковые.
    await tap("m-2");
    assert.equal(await rowsOf("member.disable"), 2);
    // X → Y → X за окно — три строки: последней в журнале должна быть X.
    const set = (to) =>
      asOrg(
        db.pool,
        c.org,
        (x) =>
          logAction(x, log, {
            action: "role.rename",
            warehouse: "wh_b",
            target: "r",
            details: { to },
          }),
        someone,
      );
    await set("X");
    await set("Y");
    await set("X");
    assert.equal(await rowsOf("role.rename"), 3);
    // Ключи, токены, почты и телефоны в подробности не попадают, на любой глубине.
    for (const details of [{ token: "x" }, { a: [{ apiKey: "x" }] }, { email: "a@b.c" }]) {
      await assert.rejects(
        asOrg(db.pool, c.org, (x) => logAction(x, log, { action: "connector.save", details })),
      );
    }
    // Огромные подробности — отказ, а не забитая база.
    await assert.rejects(
      asOrg(db.pool, c.org, (x) =>
        logAction(x, log, {
          action: "role.save",
          details: { s: "x".repeat(2001) },
          source: "system",
        }),
      ),
    );
    // Действие откатилось (обрыв, ошибка после записи) — строки нет.
    await assert.rejects(
      asOrg(db.pool, c.org, async (x) => {
        await logAction(x, log, { action: "role.move", warehouse: "wh_a", source: "system" });
        throw new Error("обрыв");
      }),
    );
    assert.equal(await rowsOf("role.move"), 0);
    // Неверный вид действия — ошибка, а не тихий пропуск.
    await assert.rejects(asOrg(db.pool, c.org, (x) => logAction(x, log, { action: "Bad Action" })));
  },
);

async function seedPath(c, prefix) {
  const desk = (
    await db.root.query(`SELECT id FROM auth.desk_sessions WHERE org_id = $1 LIMIT 1`, [c.org])
  ).rows[0].id;
  const t0 = Date.now() - 3_600_000;
  const cell = { floorId: "fl-a", moduleId: "m1", shelfIndex: 0, cellIndex: 1 };
  const steps = [
    ["recv_unit", { boxId: "b-in", productId: "pr1", qty: 5 }],
    ["recv_place", { boxId: "b-in", cell }],
    ["pick_unit", { requestId: "r-a", productId: "pr1", toteId: "t-a", cell }],
    [
      "pack_event",
      {
        type: "pack_scan",
        toteId: "t-a",
        orderId: "r-a",
        productId: "pr1",
        code: `${MARK}\u001d93TAIL`,
      },
    ],
    [
      "pack_done",
      {
        toteId: "t-a",
        outboundCode: "UK-OUT-7KQ2",
        requestIds: ["r-a"],
        lines: [{ productId: "pr1", qty: 1 }],
      },
    ],
    ["sort_place", { outboundCode: "UK-OUT-7KQ2", sortCode: "UK-SORT-1" }],
    ["sort_close", { sortCode: "UK-SORT-1" }],
    ["ship_run", { requestIds: ["r-a"], vehicle: "А123ВС" }],
    // Чужая посылка: другой заказ, другой код — в поиск не попадает.
    [
      "pack_done",
      {
        toteId: "t-z",
        outboundCode: "UK-OUT-0000",
        requestIds: ["r-z"],
        lines: [{ productId: "pr9", qty: 1 }],
      },
    ],
  ];
  for (const [i, [kind, body]] of steps.entries()) {
    await db.root.query(
      `INSERT INTO uklad.desk_ops (org_id, op_key, desk_id, kind, body, status, staff_ref,
                                   warehouse_ref, happened_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'applied', 'stf-a', 'wh_a', $6)`,
      [c.org, `${prefix}-${i}`, desk, kind, JSON.stringify(body), new Date(t0 + i * 60_000)],
    );
  }
}

test("путь товара: поиск по хвосту кода и лента от приёмки до рейса", { skip: SKIP }, async () => {
  const c = await company("path-a@sklad.ru", "10.0.7.7");
  await seedPath(c, "key-path");
  const find = (who, q) => call(`/api/cabinet/goods-path?${q}`, who);

  // Хвост серийного номера DataMatrix, хвост кода посылки, заказ, товар.
  for (const q of ["q=cdef", "q=7KQ2", "q=UK-OUT-7KQ2", "orders=r-a", "products=pr1"]) {
    const r = await find(c.boss, `warehouse=wh_a&${q}`);
    assert.equal(r.status, 200, `${q}: ${JSON.stringify(r.json)}`);
    assert.deepEqual(
      r.json.matches.map((m) => m.outboundCode),
      ["UK-OUT-7KQ2"],
      q,
    );
  }
  const byCode = (await find(c.boss, "warehouse=wh_a&q=cdef")).json.matches[0];
  assert.deepEqual(byCode.requestIds, ["r-a"]);
  assert.equal(byCode.code, MARK, "код без криптохвоста");
  assert.equal(byCode.staffRef, "stf-a");
  // Дата сужает: посылка была час назад.
  const later = await find(c.boss, `warehouse=wh_a&q=cdef&since=${Date.now() - 60_000}`);
  assert.deepEqual(later.json.matches, []);
  assert.equal((await find(c.boss, "warehouse=wh_a")).status, 400);
  assert.equal((await find(c.boss, "warehouse=wh_a&orders=r a")).status, 400);

  const steps = await call(
    `/api/cabinet/goods-path/steps?warehouse=wh_a&parcel=${byCode.id}`,
    c.boss,
  );
  assert.equal(steps.status, 200, JSON.stringify(steps.json));
  assert.deepEqual(
    steps.json.events.map((e) => e.kind),
    [
      "recv_unit",
      "recv_place",
      "pick_unit",
      "pack_event",
      "pack_done",
      "sort_place",
      "sort_close",
      "ship_run",
    ],
  );
  const scan = steps.json.events.find((e) => e.kind === "pack_event");
  assert.equal(scan.refs.code, MARK);
  assert.equal(steps.json.events.at(-1).refs.vehicle, "А123ВС");

  // Заказ без посылки — лента по заказу.
  const order = await call(`/api/cabinet/goods-path/steps?warehouse=wh_a&order=r-a`, c.boss);
  assert.ok(order.json.events.some((e) => e.kind === "pick_unit"));

  // Второй склад той же компании и чужая компания не видят посылку склада А.
  assert.deepEqual((await find(c.boss, "warehouse=wh_b&q=cdef")).json.matches, []);
  const lead = await invited(c.boss, "path-lead@sklad.ru", "Старший смены", "wh_b", "stf-l");
  assert.equal((await find(lead, "warehouse=wh_a&q=cdef")).status, 403);
  const keeper = await invited(
    c.boss,
    "path-keeper@sklad.ru",
    "Кладовщик / оператор",
    "wh_a",
    "stf-k",
  );
  assert.equal((await find(keeper, "warehouse=wh_a&q=cdef")).status, 403);
  const other = await company("path-b@sklad.ru", "10.0.7.8");
  assert.deepEqual((await find(other.boss, "warehouse=wh_a&q=cdef")).json.matches, []);
  const foreign = await call(
    `/api/cabinet/goods-path/steps?warehouse=wh_a&parcel=${byCode.id}`,
    other.boss,
  );
  assert.equal(foreign.status, 404);
});

test(
  "путь товара: вынутая с места посылка (sort_undo) в ленте не числится",
  { skip: SKIP },
  async () => {
    const c = await company("path-undo@sklad.ru", "10.0.7.9");
    await seedPath(c, "key-pu");
    const { rows } = await db.root.query(
      `SELECT desk_id, happened_at FROM uklad.desk_ops
      WHERE org_id = $1 AND kind = 'sort_place'`,
      [c.org],
    );
    const placed = rows[0].happened_at.getTime();
    // Положил не туда, вынул, положил снова — до закрытия отгрузки (+1 мин).
    for (const [i, kind, at] of [
      [1, "sort_undo", placed + 10_000],
      [2, "sort_place", placed + 20_000],
    ]) {
      await db.root.query(
        `INSERT INTO uklad.desk_ops (org_id, op_key, desk_id, kind, body, status, staff_ref,
                                   warehouse_ref, happened_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'applied', 'stf-a', 'wh_a', $6)`,
        [
          c.org,
          `key-pu-x${i}`,
          rows[0].desk_id,
          kind,
          JSON.stringify({ outboundCode: "UK-OUT-7KQ2", sortCode: "UK-SORT-1" }),
          new Date(at),
        ],
      );
    }
    const found = await call(`/api/cabinet/goods-path?warehouse=wh_a&q=7KQ2`, c.boss);
    const id = found.json.matches[0].id;
    const steps = await call(`/api/cabinet/goods-path/steps?warehouse=wh_a&parcel=${id}`, c.boss);
    const sorts = steps.json.events.filter((e) => e.kind === "sort_place");
    assert.equal(sorts.length, 1);
    assert.equal(new Date(sorts[0].at).getTime(), placed + 20_000);
    assert.ok(steps.json.events.some((e) => e.kind === "sort_close"));
  },
);

test(
  "принятие приглашения: две вкладки одновременно — одна строка журнала",
  { skip: SKIP },
  async () => {
    const c = await company("journal-accept@sklad.ru", "10.0.7.30");
    const roles = (await call("/api/team", c.boss)).json.roles;
    const roleId = roles.find((r) => r.name === "Старший смены" && r.warehouseRef === "wh_b").id;
    const email = "accept-twice@sklad.ru";
    const inv = await call("/api/team/invite", {
      ...c.boss,
      body: { email, roleId, warehouseRef: "wh_b" },
    });
    assert.equal(inv.status, 200, JSON.stringify(inv.json));
    const token = /#invite=([A-Za-z0-9_-]{43})/.exec((await lastMail(email)).text)[1];
    const body = { token, password: PW, consent: true };
    const tries = await Promise.all(
      Array.from({ length: 5 }, () => call("/api/auth/invite/accept", { body })),
    );
    assert.ok(
      tries.some((r) => r.status === 200),
      JSON.stringify(tries.map((r) => r.status)),
    );
    const { rows } = await db.root.query(
      `SELECT warehouse_ref, details::text AS d FROM uklad.audit_events
     WHERE org_id = $1 AND action = 'member.accept'`,
      [c.org],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].warehouse_ref, "wh_b");
    assert.ok(!rows[0].d.includes("@"));
    // Принятое приглашение второй раз не принять.
    const again = await call("/api/auth/invite/accept", { body });
    assert.notEqual(again.status, 200);
  },
);
