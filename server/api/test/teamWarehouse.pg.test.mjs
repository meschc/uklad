// Человек из приглашения — на своём складе и в своей карточке (миграция 034).
//
// Кирилл 14.11: пригласил «Старшего смены» с карточки «Константин Рябов» на
// «Складской 5», а вошедший увидел «Логопарк Шереметьево» — склад, который в
// ту минуту был открыт у руководителя. Здесь — этот сценарий на настоящем
// Postgres, второй склад той же компании, смена почты в карточке и чужая
// компания. Без PG_ADMIN_URL тест пропускается.
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
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {}, warn() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const team = createTeam({ auth, cfg, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
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

async function roles(who) {
  const r = await call("GET", "/api/team", who);
  return Object.fromEntries(r.json.roles.map((x) => [x.name, x.id]));
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

/** Кабинет из двух складов, как у Кирилла. `active` — какой открыт у руководителя. */
function cabinet(active) {
  const a = {
    id: "wh-a",
    name: "Складская 5",
    floors: [{ id: "fl-a", name: "Этаж 1", modules: [] }],
    staff: [
      { id: "stf-k", name: "Константин Рябов", role: "Старший смены", hourlyRate: 420 },
      { id: "stf-t", name: "Тимур Ахметов", role: "Кладовщик", hourlyRate: 380 },
    ],
  };
  const b = {
    id: "wh-b",
    name: "Логопарк Шереметьево",
    floors: [{ id: "fl-b", name: "Этаж 1", modules: [] }],
    staff: [{ id: "stf-e", name: "Елена Дорохова", role: "Начальник склада", hourlyRate: 600 }],
  };
  const work = {
    "wh-a": { requests: [{ id: "req-a", title: "Заявка Складской 5" }] },
    "wh-b": { requests: [{ id: "req-b", title: "Заявка Логопарка" }] },
  };
  const [on, off] = active === "wh-a" ? [a, b] : [b, a];
  return {
    warehouse: on,
    otherWarehouses: [off],
    activeFloorId: on.floors[0].id,
    requests: work[on.id].requests,
    warehouseData: { [off.id]: work[off.id] },
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
  "приглашённый на «Складскую 5» видит её, что бы ни открыл руководитель",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-place@example.com", "10.3.0.1");
    const r = await roles(boss);
    await writeCabinet(boss, cabinet("wh-a"));
    const inv = await post("/api/team/invite", {
      ...boss,
      body: {
        email: "kirill-place@example.com",
        roleId: r["Старший смены"],
        warehouseRef: "wh-a",
        staffRef: "stf-k",
      },
    });
    assert.equal(inv.status, 200, JSON.stringify(inv.json));
    const lead = await accept("kirill-place@example.com", boss.ip);
    assert.equal(lead.org, boss.org);

    const check = async () => {
      const s = await snap(lead);
      assert.equal(s.viewer, true);
      assert.equal(s.data.warehouse.id, "wh-a");
      assert.equal(s.data.warehouse.name, "Складская 5");
      assert.deepEqual(s.data.otherWarehouses, []);
      assert.deepEqual(s.data.warehouseData, {});
      assert.deepEqual(
        s.data.requests.map((x) => x.id),
        ["req-a"],
      );
      assert.equal(s.data.activeFloorId, "fl-a");
      // Себя он видит в персонале своего склада, без ставки.
      const me = s.data.warehouse.staff.find((m) => m.id === "stf-k");
      assert.equal(me.name, "Константин Рябов");
      assert.equal(me.hourlyRate, undefined);
      // Шапка: его имя из карточки и его роль, а не запасное «Кладовщик».
      assert.equal(s.data.account.name, "Константин Рябов");
      assert.equal(s.data.account.title, "Старший смены");
      // Чужого склада нет нигде в ответе.
      assert.ok(!JSON.stringify(s.data).includes("Логопарк"));
    };
    await check();
    // Руководитель открыл «Логопарк»: у приглашённого ничего не меняется.
    await writeCabinet(boss, cabinet("wh-b"));
    assert.equal((await snap(boss)).data.warehouse.id, "wh-b");
    await check();

    // В команде у человека — его склад и карточка.
    const team = (await call("GET", "/api/team", boss)).json;
    const m = team.members.find((x) => x.email === "kirill-place@example.com");
    assert.equal(m.warehouseRef, "wh-a");
    assert.equal(m.staffRef, "stf-k");
    assert.equal(m.roleName, "Старший смены");
    // Создать склад — это запись кабинета целиком: старшему смены нельзя.
    const cur = await snap(lead);
    const added = {
      ...cur.data,
      otherWarehouses: [{ id: "wh-new", name: "Новый склад", floors: [], staff: [] }],
    };
    const write = await post("/api/cabinet/snapshot", {
      ...lead,
      body: { version: cur.version, format: 8, data: added },
    });
    assert.equal(write.status, 403);
    // Своего «Персонала» у него нет — и команду он не видит.
    assert.equal((await call("GET", "/api/team", lead)).status, 403);
  },
);

test("приглашение только на склад и карточку этой компании", { skip: SKIP }, async () => {
  const boss = await owner("boss-check@example.com", "10.3.0.2");
  const r = await roles(boss);
  await writeCabinet(boss, cabinet("wh-a"));
  const invite = (body) =>
    post("/api/team/invite", {
      ...boss,
      body: { email: "x-check@example.com", roleId: r["Кладовщик"], ...body },
    });
  // Без склада смотрящего не зовут: иначе он увидел бы «какой открыт».
  assert.equal((await invite({})).status, 400);
  assert.equal((await invite({ warehouseRef: "wh-zzz" })).status, 404);
  // Карточка с другого склада — не карточка этого.
  assert.equal((await invite({ warehouseRef: "wh-a", staffRef: "stf-e" })).status, 404);
  assert.equal((await invite({ warehouseRef: "wh-a", staffRef: "bad ref" })).status, 400);
  assert.equal((await invite({ staffRef: "stf-k" })).status, 400);
  // Начальнику склада («Персонал») склад не обязателен: ему виден весь кабинет.
  const chief = await post("/api/team/invite", {
    ...boss,
    body: { email: "chief-check@example.com", roleId: r["Начальник склада"] },
  });
  assert.equal(chief.status, 200);
});

test(
  "поменяли почту в карточке — письмо уходит на новую, старая ссылка мертва",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-mail@example.com", "10.3.0.3");
    const r = await roles(boss);
    await writeCabinet(boss, cabinet("wh-a"));
    const place = { warehouseRef: "wh-a", staffRef: "stf-t" };
    const send = (email) =>
      post("/api/team/invite", {
        ...boss,
        body: { email, roleId: r["Кладовщик"], ...place },
      });
    assert.equal((await send("old-mail@example.com")).status, 200);
    const oldToken = tokenIn(await lastMail("old-mail@example.com"));
    assert.equal((await send("new-mail@example.com")).status, 200);
    assert.equal((await post("/api/auth/invite/info", { body: { token: oldToken } })).status, 404);
    let team = (await call("GET", "/api/team", boss)).json;
    const onCard = team.members.filter((m) => m.staffRef === "stf-t");
    assert.equal(onCard.length, 1);
    assert.equal(onCard[0].email, "new-mail@example.com");
    // Принял — у карточки есть вход. Второго входа ей не дать, на какую почту ни зови.
    const keeper = await accept("new-mail@example.com", boss.ip);
    assert.equal((await snap(keeper)).data.warehouse.id, "wh-a");
    const again = await send("third-mail@example.com");
    assert.equal(again.status, 409);
    assert.equal(again.json.error, "card_taken");
    team = (await call("GET", "/api/team", boss)).json;
    assert.equal(team.members.filter((m) => m.staffRef === "stf-t").length, 1);
  },
);

test(
  "склад не назначен, складов несколько — кабинета нет, пока руководитель не назначит",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-legacy@example.com", "10.3.0.4");
    const r = await roles(boss);
    await writeCabinet(boss, cabinet("wh-b"));
    await post("/api/team/invite", {
      ...boss,
      body: { email: "legacy@example.com", roleId: r["Кладовщик"], warehouseRef: "wh-a" },
    });
    const keeper = await accept("legacy@example.com", boss.ip);
    const team = (await call("GET", "/api/team", boss)).json;
    const id = team.members.find((m) => m.email === "legacy@example.com").id;
    // Как у тех, кто вошёл до миграции 034 и не нашёлся по почте.
    await db.root.query(`UPDATE uklad.members SET warehouse_ref = NULL WHERE id = $1`, [id]);
    const blind = await call("GET", "/api/cabinet/snapshot", keeper);
    assert.equal(blind.status, 403);
    assert.equal(blind.json.error, "no_warehouse");
    // Руководитель назначает склад и карточку.
    const place = (body) => post("/api/team/place", { ...boss, body: { memberId: id, ...body } });
    assert.equal((await place({ warehouseRef: "wh-zzz" })).status, 404);
    assert.equal((await place({ warehouseRef: "wh-a", staffRef: "stf-e" })).status, 404);
    assert.equal((await place({ warehouseRef: "wh-a", staffRef: "stf-t" })).status, 200);
    assert.equal((await snap(keeper)).data.warehouse.id, "wh-a");
    // Себе склад сам не назначит: у него нет «Персонала».
    const self = await post("/api/team/place", {
      ...keeper,
      body: { memberId: id, warehouseRef: "wh-b" },
    });
    assert.equal(self.status, 403);
    // Та же карточка второму человеку не достанется.
    await post("/api/team/invite", {
      ...boss,
      body: { email: "second@example.com", roleId: r["Кладовщик"], warehouseRef: "wh-a" },
    });
    await accept("second@example.com", boss.ip);
    const second = (await call("GET", "/api/team", boss)).json.members.find(
      (m) => m.email === "second@example.com",
    ).id;
    const taken = await post("/api/team/place", {
      ...boss,
      body: { memberId: second, warehouseRef: "wh-a", staffRef: "stf-t" },
    });
    assert.equal(taken.status, 409);
  },
);

test(
  "план правит только у своего склада, даже если он не открыт у руководителя",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-plan@example.com", "10.3.0.5");
    await writeCabinet(boss, cabinet("wh-b"));
    const planner = await post("/api/team/roles/save", {
      ...boss,
      body: { name: "Планировщик", permissions: ["stock.view", "plan.edit"] },
    });
    await post("/api/team/invite", {
      ...boss,
      body: { email: "plan@example.com", roleId: planner.json.roleId, warehouseRef: "wh-a" },
    });
    const who = await accept("plan@example.com", boss.ip);
    const seen = await snap(who);
    assert.equal(seen.data.warehouse.id, "wh-a");
    const doc = { ...seen.data };
    delete doc.products;
    const floors = [{ id: "fl-a", name: "Этаж 1 (новый)", modules: [] }];
    const res = await post("/api/cabinet/snapshot/changes", {
      ...who,
      body: {
        version: seen.version,
        format: 8,
        slots: [],
        upsert: [],
        remove: [],
        doc: { ...doc, warehouse: { ...doc.warehouse, floors } },
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const full = (await snap(boss)).data;
    // Открытый у руководителя «Логопарк» не тронут, план лёг на «Складскую 5».
    assert.equal(full.warehouse.id, "wh-b");
    assert.equal(full.warehouse.floors[0].name, "Этаж 1");
    assert.equal(full.otherWarehouses[0].id, "wh-a");
    assert.equal(full.otherWarehouses[0].floors[0].name, "Этаж 1 (новый)");
    // План чужого склада, присланный под видом своего, не ложится никуда.
    const fresh = await snap(who);
    const spoof = await post("/api/cabinet/snapshot/changes", {
      ...who,
      body: {
        version: fresh.version,
        format: 8,
        slots: [],
        upsert: [],
        remove: [],
        doc: { ...doc, warehouse: { id: "wh-b", floors: [] } },
      },
    });
    assert.equal(spoof.status, 200);
    const after = (await snap(boss)).data;
    assert.equal(after.warehouse.floors.length, 1);
    assert.equal(after.warehouse.floors[0].name, "Этаж 1");
  },
);

test("чужая компания: ни склада, ни карточки, ни кабинета", { skip: SKIP }, async () => {
  const bossA = await owner("boss-iso-a@example.com", "10.3.0.6");
  const bossB = await owner("boss-iso-b@example.com", "10.3.0.7");
  const ra = await roles(bossA);
  await writeCabinet(bossA, cabinet("wh-a"));
  const dataB = cabinet("wh-a");
  dataB.warehouse = { ...dataB.warehouse, id: "wh-b-only", name: "Склад Б" };
  dataB.otherWarehouses = [];
  dataB.warehouseData = {};
  await writeCabinet(bossB, dataB);
  // Склад компании Б в приглашении компании А — нет такого склада.
  const foreign = await post("/api/team/invite", {
    ...bossA,
    body: { email: "iso@example.com", roleId: ra["Кладовщик"], warehouseRef: "wh-b-only" },
  });
  assert.equal(foreign.status, 404);
  await post("/api/team/invite", {
    ...bossA,
    body: { email: "iso@example.com", roleId: ra["Кладовщик"], warehouseRef: "wh-a" },
  });
  const keeper = await accept("iso@example.com", bossA.ip);
  // Попросить компанию Б заголовком — входа туда нет.
  const other = await call("GET", "/api/cabinet/snapshot", { ...keeper, org: bossB.org });
  assert.equal(other.status, 401);
  // Руководитель Б не переставит человека компании А.
  const memberA = (await call("GET", "/api/team", bossA)).json.members.find(
    (m) => m.email === "iso@example.com",
  ).id;
  const move = await post("/api/team/place", {
    ...bossB,
    body: { memberId: memberA, warehouseRef: "wh-b-only" },
  });
  assert.equal(move.status, 404);
  assert.equal((await snap(keeper)).data.warehouse.id, "wh-a");
});
