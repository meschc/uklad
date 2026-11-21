// Подключения площадок на настоящем Postgres (миграция 035): ключ не уходит
// в ответы, журналы и базу открытым текстом; обходы белого списка — 403;
// чужая компания не видит и не ходит; роли без `integrations.manage` — 403.
// Без PG_ADMIN_URL тест пропускается.
/* global process, fetch, setTimeout, Buffer, Response, LOGS, HITS, REPLY */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, server, base, cookieName, pull, unpaidPull, UNPAID;
const sent = [];

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createTeam } = require("../src/cabinet/team.js");
  const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const team = createTeam({ auth, cfg, send, log: quiet });
  const badges = createDeskBadges({ auth, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const { createConnectors } = require("../src/cabinet/connectors.js");
  globalThis.LOGS = [];
  globalThis.HITS = [];
  globalThis.REPLY = null;
  const deps = {
    auth,
    log: { error: (...a) => LOGS.push(a.join(" ")) },
    secretKey: Buffer.alloc(32, 7),
    fetchImpl: async (u, o) => {
      HITS.push({ u, h: o.headers, body: o.body });
      // REPLY — ответ на всё или функция от адреса (у WB у поставки свой ответ).
      const r = typeof REPLY === "function" ? REPLY(u, o) : REPLY;
      return new Response(JSON.stringify(r ?? { orders: [] }), {
        headers: { "content-type": "application/json" },
      });
    },
  };
  const { createOrderPull } = require("../src/cabinet/orderPull.js");
  pull = createOrderPull(deps);
  // Неоплаченный кабинет («только чтение») — компании из `UNPAID`.
  unpaidPull = createOrderPull({ ...deps, unpaid: (org) => UNPAID?.has(org) ?? false });
  const conn = createConnectors({ ...deps, send, pull });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await badges.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)) ||
      (await conn.handle(req, res, url)),
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

async function call(method, path, { body, cookie, org, ip = "10.0.2.1" } = {}) {
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

/** Регистрация склада целиком → кука и компания. */
async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await post("/api/auth/register", { body, ip })).status, 202);
  const code = /^(\d{6})/.exec((await lastMail(email)).subject)[1];
  const r = await post("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: cookieOf(r.res), org: r.json.orgId, ip };
}

const tokenIn = (mail) => /#invite=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];

async function roles(who) {
  await ensureCabinet(who);
  const r = await call("GET", "/api/team", who);
  return Object.fromEntries(r.json.roles.map((x) => [x.name, x.id]));
}

/** Склад, на который зовут в этих тестах (миграция 034: без склада смотрящего не зовут). */
const WH = "w1";

/** У компании ещё нет кабинета — завести с одним складом `WH`. */
async function ensureCabinet(who) {
  const cur = await call("GET", "/api/cabinet/snapshot", who);
  if (cur.json?.snapshot) return;
  const data = { warehouse: { id: WH, name: "Склад", staff: [] } };
  const r = await post("/api/cabinet/snapshot", { ...who, body: { version: 0, format: 8, data } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}

/** Тело приглашения со складом `WH`. */
async function inviteBody(who, body) {
  await ensureCabinet(who);
  return { warehouseRef: WH, ...body };
}

/** Пригласить и принять новым человеком → его кука. */
async function join(who, email, roleId, place = {}) {
  const body = await inviteBody(who, { email, roleId, ...place });
  const inv = await post("/api/team/invite", { ...who, body });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  const token = tokenIn(await lastMail(email));
  const acc = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
    ip: who.ip,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  return { cookie: cookieOf(acc.res), org: acc.json.orgId, ip: who.ip, token };
}

test("живой: подключения площадок", { skip: SKIP }, async () => {
  const TOKEN = "SECRET-WB-TOKEN-1234567890";
  const a = await owner("conn-a@example.com", "10.3.0.1");
  const b = await owner("conn-b@example.com", "10.3.0.2");
  const r = await roles(a);
  const save = await post("/api/connectors/save", {
    ...a,
    body: { system: "wildberries", label: "ИП", token: TOKEN },
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  const id = save.json.id;
  const ym = await post("/api/connectors/save", {
    ...a,
    body: { system: "yandex-market", label: "ЯМ", token: TOKEN, clientId: "123" },
  });
  // список без ключа
  const list = await call("GET", "/api/connectors", a);
  assert.ok(!JSON.stringify(list.json).includes(TOKEN));
  // в базе только шифротекст
  const raw = await db.pool.query(
    "SELECT encode(secret,'escape') s, params FROM uklad.connector_accounts",
  );
  assert.ok(raw.rows.every((x) => !x.s.includes(TOKEN)));
  // прокси: разрешённое
  const ok1 = await post("/api/connectors/wildberries/proxy", {
    ...a,
    body: { system: "wildberries", account: id, method: "GET", path: "/api/v3/orders/new" },
  });
  assert.equal(ok1.status, 200);
  assert.ok(!JSON.stringify(ok1.json).includes(TOKEN));
  assert.equal(HITS.at(-1).u, "https://marketplace-api.wildberries.ru/api/v3/orders/new");
  // SSRF и обходы
  const bad = [
    ["GET", "/api/v3/orders/new?x=1"],
    ["GET", "@evil.com/api/v3/orders/new"],
    ["GET", "//evil.com"],
    ["PUT", "/api/v3/stocks/..%2f..%2fadmin"],
    ["PUT", "/api/v3/stocks/a/../../x"],
    ["GET", "/api/v3/orders/new\n"],
    ["DELETE", "/api/v3/orders/new"],
    ["PUT", "/api/v3/stocks/.."],
    ["GET", "/api/v3/orders/new#x"],
  ];
  const before = HITS.length;
  for (const [method, path] of bad) {
    const x = await post("/api/connectors/wildberries/proxy", {
      ...a,
      body: { system: "wildberries", account: id, method, path },
    });
    assert.equal(x.status, 403, `${method} ${JSON.stringify(path)} → ${x.status}`);
  }
  // чужая система с id WB-подключения
  const cross = await post("/api/connectors/ozon/proxy", {
    ...a,
    body: { system: "ozon", account: id, method: "POST", path: "/v2/products/stocks" },
  });
  assert.equal(cross.status, 404);
  // ЯМ: чужой campaignId в пути не проходит
  const ymBad = await post("/api/connectors/yandex-market/proxy", {
    ...a,
    body: {
      system: "yandex-market",
      account: ym.json.id,
      method: "GET",
      path: "/v2/campaigns/999/orders",
    },
  });
  assert.equal(ymBad.status, 403);
  // query: ключи только простые
  const q = await post("/api/connectors/wildberries/proxy", {
    ...a,
    body: {
      system: "wildberries",
      account: id,
      method: "GET",
      path: "/api/v3/orders/new",
      query: { "a&b": "1" },
    },
  });
  assert.equal(q.status, 400);
  assert.equal(HITS.length, before);
  // чужая компания: не видит, не ходит, не удаляет
  assert.deepEqual((await call("GET", "/api/connectors", b)).json.connections, []);
  const fp = await post("/api/connectors/wildberries/proxy", {
    ...b,
    body: { system: "wildberries", account: id, method: "GET", path: "/api/v3/orders/new" },
  });
  assert.equal(fp.status, 404);
  const fo = await call("GET", "/api/connectors", { ...b, org: a.org });
  assert.ok(
    fo.status === 401 || fo.status === 403 || (fo.json.connections ?? []).length === 0,
    String(fo.status),
  );
  assert.equal((await post("/api/connectors/delete", { ...b, body: { id } })).status, 404);
  // роли без права: 403 на всё
  for (const name of ["Старший смены", "Кладовщик", "Приёмщик"]) {
    const w = await join(
      a,
      `conn-${name.length}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      r[name],
    );
    assert.equal((await call("GET", "/api/connectors", w)).status, 403, name);
    assert.equal(
      (
        await post("/api/connectors/wildberries/proxy", {
          ...w,
          body: { system: "wildberries", account: id, method: "GET", path: "/api/v3/orders/new" },
        })
      ).status,
      403,
      name,
    );
    assert.equal(
      (
        await post("/api/connectors/save", {
          ...w,
          body: { system: "wildberries", label: "x", token: "t" },
        })
      ).status,
      403,
      name,
    );
  }
  // начальник склада — может
  const chief = await join(a, "conn-chief@example.com", r["Начальник склада"]);
  assert.equal((await call("GET", "/api/connectors", chief)).status, 200);
  // без сессии
  assert.equal((await call("GET", "/api/connectors", {})).status, 401);
  // удаление: ключ затёрт, прокси не ходит
  assert.equal((await post("/api/connectors/delete", { ...a, body: { id } })).status, 200);
  assert.equal(
    (
      await post("/api/connectors/wildberries/proxy", {
        ...a,
        body: { system: "wildberries", account: id, method: "GET", path: "/api/v3/orders/new" },
      })
    ).status,
    404,
  );
  assert.ok(!LOGS.join("\n").includes(TOKEN));
});

// Подкачка заказов на сервере (миграция 050): без открытого кабинета заказ
// площадки становится заявкой склада, второй раз не заводится, чужая компания
// его не видит, а поиск «кому пора» не отдаёт ключ.
test("живой: сервер сам заводит заказы площадки заявками", { skip: SKIP }, async () => {
  const a = await owner("pull-a@example.com", "10.4.0.1");
  const b = await owner("pull-b@example.com", "10.4.0.2");
  const products = [
    { id: "p1", name: "Кружка", sku: "ART-1", barcode: "4600000000001", partnerId: "pt1" },
    { id: "p2", name: "Кружка склада", sku: "ART-1", barcode: "4600000000002" },
  ];
  const data = {
    warehouse: { id: WH, name: "Склад", staff: [], partners: [{ id: "pt1", name: "ИП Иванов" }] },
    products,
    requests: [],
  };
  const w = await post("/api/cabinet/snapshot", { ...a, body: { version: 0, format: 8, data } });
  assert.equal(w.status, 200, JSON.stringify(w.json));
  await ensureCabinet(b);
  // Подключение партнёра, сохранено до 050 — без склада: склад в компании один.
  const save = await post("/api/connectors/save", {
    ...a,
    body: { system: "wildberries", label: "ИП Иванов", token: "WB-A", partnerId: "pt1" },
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  const saveB = await post("/api/connectors/save", {
    ...b,
    body: { system: "wildberries", label: "Свой", token: "WB-B" },
  });
  assert.equal(saveB.status, 200);

  // Поиск «кому пора» отдаёт только компанию, номер, площадку и билет.
  const app = await db.pool.connect();
  try {
    await app.query("BEGIN");
    const claim = await app.query(`SELECT * FROM auth.connector_pull_claim('90 seconds')`);
    assert.deepEqual(Object.keys(claim.rows[0]).sort(), ["id", "org_id", "system", "ticket"]);
    // Флаг подкачки приложению поверх компаний ничего не открывает.
    await app.query(`SELECT set_config('app.order_pull', 'on', true)`);
    const peek = await app.query(`SELECT count(*)::int AS n FROM uklad.connector_accounts`);
    assert.equal(peek.rows[0].n, 0);
    // Вход в компанию — только по билету своего подключения.
    const { id: cid, ticket, org_id: corg } = claim.rows[0];
    const other = cid === saveB.json.id ? save.json.id : saveB.json.id;
    const enter = async (id, t) =>
      (await app.query(`SELECT auth.connector_pull_enter($1, $2) AS org`, [id, t])).rows[0].org;
    assert.equal(await enter(cid, null), null);
    assert.equal(await enter(cid, "0".repeat(64)), null);
    assert.equal(await enter(other, ticket), null);
    assert.equal(await enter(cid, ticket), corg);
    const seen = await app.query(`SELECT DISTINCT org_id FROM uklad.connector_accounts`);
    assert.deepEqual(
      seen.rows.map((r) => r.org_id),
      [corg],
    );
    await app.query("ROLLBACK");
  } finally {
    app.release();
  }

  globalThis.REPLY = {
    orders: [
      { id: 111, article: "ART-1", skus: ["4600000000001"] },
      { id: 222, article: "NOPE", skus: [] },
    ],
  };
  const version = (await call("GET", "/api/cabinet/snapshot", a)).json.snapshot.version;
  await pull.tick();
  const snap = (await call("GET", "/api/cabinet/snapshot", a)).json.snapshot;
  assert.equal(snap.version, version + 1);
  const made = snap.data.requests.filter((r) => r.source === "wildberries");
  // Товар партнёра, а не одноимённый товар склада.
  assert.deepEqual(
    made.map((r) => [r.externalId, r.productId, r.qty, r.status]),
    [["111", "p1", 1, "new"]],
  );
  const listed = (await call("GET", "/api/connectors", a)).json.connections[0];
  assert.equal(listed.lastPull.created, 1);
  assert.deepEqual(listed.lastPull.unknown, ["222"]);
  assert.ok(!JSON.stringify(listed).includes("WB-A"));
  // Чужая компания своего заказа не получила и чужого не видит.
  const snapB = (await call("GET", "/api/cabinet/snapshot", b)).json.snapshot;
  assert.ok(!(snapB.data.requests ?? []).some((r) => r.externalId === "111"));

  // Второй обход в ту же минуту никого не берёт; кнопка — берёт, но дубля нет.
  const hits = HITS.length;
  await pull.tick();
  assert.equal(HITS.length, hits);
  const now = await post("/api/connectors/pull", { ...a, body: {} });
  assert.equal(now.status, 200, JSON.stringify(now.json));
  assert.equal(now.json.created, 0);
  // «Проверить связь» — одно подключение, и только своей компании.
  const one = await post("/api/connectors/pull", { ...a, body: { id: save.json.id } });
  assert.equal(one.status, 200, JSON.stringify(one.json));
  const foreign = await post("/api/connectors/pull", { ...a, body: { id: saveB.json.id } });
  assert.equal(foreign.status, 404);

  // Название меняется, ключ остаётся; чужое подключение не переименовать.
  const renamed = await post("/api/connectors/rename", {
    ...a,
    body: { id: save.json.id, label: "Иванов, Ozon" },
  });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
  const relisted = (await call("GET", "/api/connectors", a)).json.connections[0];
  assert.equal(relisted.label, "Иванов, Ozon");
  const hijack = await post("/api/connectors/rename", {
    ...a,
    body: { id: saveB.json.id, label: "чужое" },
  });
  assert.equal(hijack.status, 404);
  const bList = (await call("GET", "/api/connectors", b)).json.connections[0];
  assert.equal(bList.label, "Свой");
  const again = (await call("GET", "/api/cabinet/snapshot", a)).json.snapshot;
  assert.equal(again.data.requests.filter((r) => r.externalId === "111").length, 1);

  // Отменённый складом заказ не воскресает.
  const cancelled = again.data.requests.map((r) =>
    r.externalId === "111" ? { ...r, status: "cancelled" } : r,
  );
  const put = await post("/api/cabinet/snapshot", {
    ...a,
    body: { version: again.version, format: 8, data: { ...again.data, requests: cancelled } },
  });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  await post("/api/connectors/pull", { ...a, body: {} });
  const last = (await call("GET", "/api/cabinet/snapshot", a)).json.snapshot;
  assert.equal(last.data.requests.filter((r) => r.externalId === "111").length, 1);

  // Не оплачен — площадку не спрашиваем, в строке подключения причина.
  UNPAID = new Set([a.org]);
  await db.root.query(`UPDATE uklad.connector_accounts SET pulled_at = NULL`);
  const paidHits = HITS.length;
  await unpaidPull.tick();
  const unpaidAsked = HITS.slice(paidHits).map((h) => h.h.Authorization);
  assert.ok(
    unpaidAsked.includes("WB-B") && !unpaidAsked.includes("WB-A"),
    JSON.stringify(unpaidAsked),
  );
  const unpaidRow = (await call("GET", "/api/connectors", a)).json.connections[0];
  assert.equal(unpaidRow.lastPull.error, "unpaid");
  UNPAID = null;

  // Удалённая компания площадку больше не спрашивает.
  await db.root.query(`UPDATE uklad.orgs SET deleted_at = now() WHERE id = $1`, [a.org]);
  await db.root.query(`UPDATE uklad.connector_accounts SET pulled_at = NULL`);
  const before = HITS.length;
  await pull.tick();
  const asked = HITS.slice(before).map((h) => h.h.Authorization);
  assert.ok(asked.includes("WB-B") && !asked.includes("WB-A"), JSON.stringify(asked));
  globalThis.REPLY = null;
});

// Шаг 5 `docs/domain/fbs.md`: собранный на складе заказ сервер сам отмечает
// «собран» на площадке — и только собранный целиком.
test(
  "живой: собранный заказ Маркета — «готов к отгрузке» на площадке",
  { skip: SKIP },
  async () => {
    const c = await owner("assemble-c@example.com", "10.4.0.3");
    const data = {
      warehouse: { id: WH, name: "Склад", staff: [], partners: [] },
      products: [{ id: "p1", name: "Кружка", sku: "ART-9" }],
      requests: [],
    };
    const w = await post("/api/cabinet/snapshot", { ...c, body: { version: 0, format: 8, data } });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    const save = await post("/api/connectors/save", {
      ...c,
      body: { system: "yandex-market", label: "Свой", token: "YM-C", clientId: "777" },
    });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    globalThis.REPLY = { orders: [{ id: 555, items: [{ offerId: "ART-9", count: 1 }] }] };
    const statusHits = () => HITS.filter((h) => /\/orders\/555\/status$/.test(h.u));
    const again = async () => {
      await db.root.query(`UPDATE uklad.connector_accounts SET pulled_at = NULL`);
      await pull.tick();
    };
    await again();
    // Заказ только пришёл — площадке ещё нечего сказать.
    assert.equal(statusHits().length, 0);
    const snap = (await call("GET", "/api/cabinet/snapshot", c)).json.snapshot;
    const req = snap.data.requests.find((r) => r.externalId === "555");
    assert.ok(req, "заявка заведена");
    const put = await post("/api/cabinet/snapshot", {
      ...c,
      body: {
        version: snap.version,
        format: 8,
        data: { ...snap.data, requests: [{ ...req, status: "done", pickedAt: 1 }] },
      },
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    await again();
    const hits = statusHits();
    assert.equal(hits.length, 1);
    assert.match(hits[0].u, /\/v2\/campaigns\/777\/orders\/555\/status$/);
    assert.deepEqual(JSON.parse(hits[0].body), {
      order: { status: "PROCESSING", substatus: "READY_TO_SHIP" },
    });
    const listed = (await call("GET", "/api/connectors", c)).json.connections[0];
    assert.equal(listed.lastPull.assembled, 1);
    globalThis.REPLY = null;
  },
);

test(
  "живой: собранное задание WB — в поставку дня, второй раз не добавляется",
  { skip: SKIP },
  async () => {
    const c = await owner("assemble-wb@example.com", "10.4.0.4");
    const data = {
      warehouse: { id: WH, name: "Склад", staff: [], partners: [] },
      products: [{ id: "p1", name: "Кружка", sku: "ART-W" }],
      requests: [],
    };
    const w = await post("/api/cabinet/snapshot", { ...c, body: { version: 0, format: 8, data } });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    const save = await post("/api/connectors/save", {
      ...c,
      body: { system: "wildberries", label: "Свой WB", token: "WB-C" },
    });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    // Задание в «новых», пока не в поставке; в поставке — уходит из «новых».
    let inSupply = false;
    globalThis.REPLY = (u, o) => {
      if (o.method === "POST" && u.endsWith("/api/v3/supplies")) return { id: "WB-GI-42" };
      if (o.method === "PATCH") {
        inSupply = true;
        return null;
      }
      return inSupply
        ? { orders: [] }
        : { orders: [{ id: 9001, article: "ART-W", skus: [], warehouseId: 3, cargoType: 1 }] };
    };
    const supplyHits = () => HITS.filter((h) => /\/supplies/.test(h.u));
    const again = async () => {
      await db.root.query(`UPDATE uklad.connector_accounts SET pulled_at = NULL`);
      await pull.tick();
    };
    await again();
    assert.equal(supplyHits().length, 0, "несобранное в поставку не идёт");
    const snap = (await call("GET", "/api/cabinet/snapshot", c)).json.snapshot;
    const req = snap.data.requests.find((r) => r.externalId === "9001");
    assert.ok(req, "заявка заведена");
    const put = await post("/api/cabinet/snapshot", {
      ...c,
      body: {
        version: snap.version,
        format: 8,
        data: { ...snap.data, requests: [{ ...req, status: "done", pickedAt: 1 }] },
      },
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    await again();
    const hits = supplyHits();
    assert.deepEqual(
      hits.map((h) => h.u.replace("https://marketplace-api.wildberries.ru", "")),
      ["/api/v3/supplies", "/api/marketplace/v3/supplies/WB-GI-42/orders"],
    );
    assert.deepEqual(JSON.parse(hits[1].body), { orders: [9001] });
    const listed = (await call("GET", "/api/connectors", c)).json.connections[0];
    assert.equal(listed.lastPull.assembled, 1);
    // Следующий проход: задания уже нет в «новых» — к WB с поставкой не ходим.
    await again();
    assert.equal(supplyHits().length, 2);
    globalThis.REPLY = null;
  },
);

test(
  "живой: заказ отменён на площадке — заявка «отменена», стол её не упакует",
  { skip: SKIP },
  async () => {
    const c = await owner("cancel-ym@example.com", "10.4.0.5");
    const data = {
      warehouse: { id: WH, name: "Склад", staff: [], partners: [] },
      products: [{ id: "p1", name: "Кружка", sku: "ART-X" }],
      requests: [],
    };
    const w = await post("/api/cabinet/snapshot", { ...c, body: { version: 0, format: 8, data } });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    const save = await post("/api/connectors/save", {
      ...c,
      body: { system: "yandex-market", label: "Свой", token: "YM-X", clientId: "778" },
    });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    let cancelledOnPlatform = false;
    globalThis.REPLY = (u) =>
      u.includes("status=CANCELLED")
        ? { orders: cancelledOnPlatform ? [{ id: 556, status: "CANCELLED" }] : [] }
        : { orders: [{ id: 556, items: [{ offerId: "ART-X", count: 1 }] }] };
    const again = async () => {
      await db.root.query(`UPDATE uklad.connector_accounts SET pulled_at = NULL`);
      await pull.tick();
    };
    const request = async () =>
      (await call("GET", "/api/cabinet/snapshot", c)).json.snapshot.data.requests.find(
        (r) => r.externalId === "556",
      );
    await again();
    assert.equal((await request()).status, "new");
    const asked = HITS.filter((h) => h.u.includes("status=CANCELLED"));
    assert.ok(asked.length > 0, "площадку спросили об отменах");
    assert.match(asked[0].u, /updatedAtFrom=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}%2B03%3A00/);

    cancelledOnPlatform = true;
    await again();
    const r = await request();
    assert.equal(r.status, "cancelled");
    const listed = (await call("GET", "/api/connectors", c)).json.connections[0];
    assert.equal(listed.lastPull.cancelled, 1);
    globalThis.REPLY = null;
  },
);

test(
  "живой: остатки уходят на Ozon — свободное после заявок, склад выбирает руководитель",
  { skip: SKIP },
  async () => {
    const c = await owner("stock-oz@example.com", "10.4.0.6");
    const data = {
      warehouse: { id: WH, name: "Склад", staff: [], partners: [] },
      products: [
        { id: "p1", name: "Кружка", sku: "MUG-1" },
        { id: "p2", name: "Ложка", sku: "SPOON-1" },
      ],
      boxes: [{ id: "b1", lines: [{ productId: "p1", qty: 5 }] }],
      requests: [],
    };
    const w = await post("/api/cabinet/snapshot", { ...c, body: { version: 0, format: 8, data } });
    assert.equal(w.status, 200, JSON.stringify(w.json));
    const save = await post("/api/connectors/save", {
      ...c,
      body: { system: "ozon", label: "Свой", token: "OZ-S", clientId: "991" },
    });
    assert.equal(save.status, 200, JSON.stringify(save.json));
    const id = save.json.id;
    let warehouses = [
      { warehouse_id: 11, name: "Первый" },
      { warehouse_id: 22, name: "Второй" },
    ];
    globalThis.REPLY = (u, o) => {
      if (u.endsWith("/v2/warehouse/list")) return { warehouses };
      if (u.endsWith("/v2/products/stocks")) {
        const rows = JSON.parse(o.body).stocks;
        return { result: rows.map((r) => ({ offer_id: r.offer_id, updated: true, errors: [] })) };
      }
      if (u.endsWith("/v4/posting/fbs/unfulfilled/list"))
        return {
          result: {
            postings: [
              {
                posting_number: "77-1",
                status: "awaiting_packaging",
                products: [{ offer_id: "MUG-1", quantity: 2 }],
              },
            ],
          },
        };
      return { result: { postings: [] }, postings: [] };
    };
    const again = async () => {
      await db.root.query(`UPDATE uklad.connector_accounts SET pulled_at = NULL`);
      await pull.tick();
    };
    const pushed = () => HITS.filter((h) => h.u.endsWith("/v2/products/stocks"));

    // По умолчанию выгрузка выключена — остатки не уходят вовсе.
    await again();
    assert.equal(pushed().length, 0);
    assert.equal(HITS.filter((h) => h.u.endsWith("/v2/warehouse/list")).length, 0);
    const on = await post("/api/connectors/stock", { ...c, body: { id, enabled: true } });
    assert.equal(on.status, 200, JSON.stringify(on.json));
    const conn = (await call("GET", "/api/connectors", c)).json.connections.find(
      (x) => x.id === id,
    );
    assert.equal(conn.stockPush, true);

    // Два склада FBS — без выбора остатки не уходят, руководитель видит почему.
    await again();
    assert.equal(pushed().length, 0);
    let listed = (await call("GET", "/api/connectors", c)).json.connections.find(
      (x) => x.id === id,
    );
    assert.equal(listed.lastPull.stockError, "ozon_warehouse");
    assert.equal(listed.lastPull.stockChoices.length, 2);

    const pick = await post("/api/connectors/stock", {
      ...c,
      body: { id, warehouseId: 22 },
    });
    assert.equal(pick.status, 200, JSON.stringify(pick.json));
    const bad = await post("/api/connectors/stock", {
      ...c,
      body: { id, warehouseId: "22" },
    });
    assert.equal(bad.status, 400);

    await again();
    const sent = pushed().flatMap((h) => JSON.parse(h.body).stocks);
    // Кружка: 5 на складе − 2 в новой заявке; ложки нет — ноль.
    assert.deepEqual(
      sent.sort((a, b) => a.offer_id.localeCompare(b.offer_id)),
      [
        { offer_id: "MUG-1", stock: 3, warehouse_id: 22 },
        { offer_id: "SPOON-1", stock: 0, warehouse_id: 22 },
      ],
    );
    listed = (await call("GET", "/api/connectors", c)).json.connections.find((x) => x.id === id);
    assert.equal(listed.lastPull.stocked, 2);
    assert.equal(listed.lastPull.stockError, undefined);

    // Ничего не изменилось — второй раз не шлём.
    const n = pushed().length;
    await again();
    assert.equal(pushed().length, n);
    warehouses = [];
    globalThis.REPLY = null;
  },
);
