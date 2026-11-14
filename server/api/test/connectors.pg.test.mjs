// Подключения площадок на настоящем Postgres (миграция 035): ключ не уходит
// в ответы, журналы и базу открытым текстом; обходы белого списка — 403;
// чужая компания не видит и не ходит; роли без `integrations.manage` — 403.
// Без PG_ADMIN_URL тест пропускается.
/* global process, fetch, setTimeout, Buffer, Response, LOGS, HITS */
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
  const conn = createConnectors({
    auth,
    send,
    log: { error: (...a) => LOGS.push(a.join(" ")) },
    secretKey: Buffer.alloc(32, 7),
    fetchImpl: async (u, o) => {
      HITS.push({ u, h: o.headers });
      return new Response(JSON.stringify({ orders: [] }), {
        headers: { "content-type": "application/json" },
      });
    },
  });
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
