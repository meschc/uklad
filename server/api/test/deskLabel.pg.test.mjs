// Ярлык площадки на столе упаковки (`deskLabel.js`) на настоящем Postgres:
// стол получает PDF ярлыка своей собранной заявки, ключ площадки не видит;
// несобранное, не заказ площадки и чужое — отказ; отказ площадки — с причиной.
// Без PG_ADMIN_URL тест пропускается.
/* global process, fetch, setTimeout, Buffer, Response */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
const PDF = Buffer.from("%PDF-1.4 ярлык");
let db, server, base, cookieName, deskCookieName;
const sent = [];
const hits = [];
let reply = null;

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  const { createDesks } = require("../src/cabinet/desks.js");
  const { createConnectors } = require("../src/cabinet/connectors.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {}, warn() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const secretKey = Buffer.alloc(32, 9);
  const fetchImpl = async (u, o) => {
    hits.push({ u, h: o.headers, body: o.body });
    if (reply) return new Response(JSON.stringify(reply.body), { status: reply.status });
    return new Response(PDF, { headers: { "content-type": "application/pdf" } });
  };
  const desks = createDesks({ auth, cfg, send, log: quiet, secretKey, fetchImpl });
  const conn = createConnectors({ auth, send, log: quiet, secretKey, fetchImpl });
  cookieName = auth.cookieName;
  deskCookieName = desks.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await desks.handle(req, res, url)) ||
      (await auth.handle(req, res, url)) ||
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
  return { cookie: tokenOf(r.cookies, cookieName), org: r.json.orgId };
}

const req = (id, over) => ({ id, productId: "pr1", qty: 1, createdAt: 1, updatedAt: 1, ...over });
const cabinet = () => ({
  warehouse: { id: "wh_a", name: "Склад", staff: [], partners: [{ id: "p1", name: "ИП Иванов" }] },
  devices: [{ id: "dev-a", name: "Стол", station: "pack", createdAt: 1 }],
  products: [{ id: "pr1", sku: "A-1", name: "Кружка", partnerId: "p1" }],
  boxes: [],
  outboundBoxes: [],
  staffEvents: [],
  requests: [
    req("r-oz", { source: "ozon", externalId: "123-1", status: "done" }),
    req("r-new", { source: "ozon", externalId: "123-2", status: "new" }),
    req("r-own", { status: "done", note: "Тула" }),
  ],
});

const label = (desk, requestId) => call("/api/desk/platform-label", { desk, body: { requestId } });

test("живой: стол получает ярлык площадки своей собранной заявки", { skip: SKIP }, async () => {
  const a = await owner("label-a@sklad.ru", "10.0.7.2");
  const w = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: cabinet() },
  });
  assert.equal(w.status, 200, JSON.stringify(w.json));
  const d = await call("/api/cabinet/desks", { ...a, body: { deviceRef: "dev-a", name: "Стол" } });
  assert.equal(d.status, 200, JSON.stringify(d.json));
  const desk = tokenOf(d.cookies, deskCookieName);
  // Браузер, на котором открыли стол, стал столом: руководитель входит заново.
  const r = await call("/api/auth/login", {
    body: { email: "label-a@sklad.ru", password: PW },
    ip: "10.0.7.9",
  });
  a.cookie = tokenOf(r.cookies, cookieName);

  // Подключения ещё нет — ярлыка нет, а не чужой ключ.
  assert.deepEqual([(await label(desk, "r-oz")).status], [404]);

  const save = await call("/api/connectors/save", {
    ...a,
    body: { system: "ozon", label: "Иванов", token: "OZ-SECRET", clientId: "42", partnerId: "p1" },
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));

  const ok = await label(desk, "r-oz");
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.mime, "application/pdf");
  assert.deepEqual(Buffer.from(ok.json.file, "base64"), PDF);
  const hit = hits.at(-1);
  assert.equal(hit.u, "https://api-seller.ozon.ru/v2/posting/fbs/package-label");
  assert.deepEqual(JSON.parse(hit.body), { posting_number: ["123-1"] });
  assert.equal(hit.h["Api-Key"], "OZ-SECRET");
  assert.ok(!JSON.stringify(ok.json).includes("OZ-SECRET"));

  // Несобранное, не заказ площадки, нет такой заявки — отказ без запроса площадке.
  const before = hits.length;
  assert.deepEqual([(await label(desk, "r-new")).json.error], ["not_picked"]);
  assert.deepEqual([(await label(desk, "r-own")).json.error], ["not_marketplace"]);
  assert.equal((await label(desk, "нет-такой")).status, 404);
  assert.equal(hits.length, before);

  // Площадка отказала (ещё не «собран») — причина доходит до стола.
  reply = { status: 400, body: { message: "POSTING_NOT_AWAITING_DELIVER" } };
  const no = await label(desk, "r-oz");
  assert.deepEqual([no.status, no.json.detail], [502, "POSTING_NOT_AWAITING_DELIVER"]);
  reply = null;

  // Кабинет руководителя этот маршрут не обслуживает: он только для стола.
  const boss = await call("/api/desk/platform-label", { ...a, body: { requestId: "r-oz" } });
  assert.notEqual(boss.status, 200);
});
