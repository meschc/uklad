// Ответ продавца на акт расхождений приёмки (миграция 048, Кирилл 17.11).
//
// Продавец отвечает один раз и только на свою закрытую поставку, пока не
// вышли трое суток; чужая поставка для него не существует. Возражение решает
// старший склада. Здесь — на настоящем Postgres. Без PG_ADMIN_URL тест
// пропускается.
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
  const { createDesks } = require("../src/cabinet/desks.js");
  const desks = createDesks({ auth, cfg, send, log: quiet });
  const { createReceivingAnswers } = require("../src/cabinet/receivingAnswers.js");
  const answers = createReceivingAnswers({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await desks.handle(req, res, url)) ||
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)) ||
      (await answers.handle(req, res, url)),
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

async function call(method, path, { body, cookie, org, ip = "10.0.5.1" } = {}) {
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

const HOUR = 3_600_000;

/** Склад с двумя продавцами и тремя поставками: своя свежая, своя старая, чужая. */
function cabinet(now) {
  const line = (id, productId, expectedQty, receivedQty) => ({
    id,
    productId,
    expectedQty,
    receivedQty,
  });
  return {
    warehouse: {
      id: "wh-a",
      name: "Складская 5",
      floors: [{ id: "fl-a", name: "Этаж 1", modules: [] }],
      staff: [],
      partners: [
        { id: "ptr-r", name: "Ромашка" },
        { id: "ptr-l", name: "Лютик" },
      ],
    },
    otherWarehouses: [],
    activeFloorId: "fl-a",
    products: [
      { id: "p-r", name: "Мыло", sku: "R-1", warehouseId: "wh-a", partnerId: "ptr-r" },
      { id: "p-l", name: "Шампунь", sku: "L-1", warehouseId: "wh-a", partnerId: "ptr-l" },
    ],
    placements: {},
    expectedShipments: [
      {
        id: "exp-fresh",
        source: "manual",
        status: "closed",
        createdAt: now - 30 * HOUR,
        closedAt: now - 24 * HOUR,
        lines: [line("l1", "p-r", 10, 8)],
      },
      {
        id: "exp-old",
        source: "manual",
        status: "closed",
        createdAt: now - 200 * HOUR,
        closedAt: now - 100 * HOUR,
        lines: [line("l2", "p-r", 5, 4)],
      },
      {
        id: "exp-other",
        source: "manual",
        status: "closed",
        createdAt: now - 30 * HOUR,
        closedAt: now - 24 * HOUR,
        lines: [line("l3", "p-l", 5, 4)],
      },
    ],
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
  "продавец отвечает на свой акт один раз, старший решает возражение",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-answers@example.com", "10.5.0.1");
    await writeCabinet(boss, cabinet(Date.now()));
    await post("/api/team/invite", {
      ...boss,
      body: { email: "romashka-a@example.com", warehouseRef: "wh-a", partnerRef: "ptr-r" },
    });
    const seller = await accept("romashka-a@example.com", boss.ip);
    const say = (body) => post("/api/receiving/answers", { ...seller, body });

    // Чужая поставка для продавца не существует, старая — срок вышел.
    assert.equal((await say({ shipmentId: "exp-other", answer: "agree" })).status, 404);
    const late = await say({ shipmentId: "exp-old", answer: "agree" });
    assert.equal(late.status, 409);
    assert.equal(late.json.error, "late");
    // Возражение без слов — нельзя.
    assert.equal((await say({ shipmentId: "exp-fresh", answer: "dispute" })).status, 400);

    const ok = await say({ shipmentId: "exp-fresh", answer: "dispute", comment: "Отгружали 10" });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.equal(ok.json.answer.answer, "dispute");
    // Второй ответ не переписывает первый.
    const again = await say({ shipmentId: "exp-fresh", answer: "agree" });
    assert.equal(again.status, 409);
    assert.equal(again.json.error, "answered");

    // Продавец решать не может; руководитель — может, один раз.
    const resolve = (who, body) => post("/api/receiving/answers/resolve", { ...who, body });
    const verdict = { shipmentId: "exp-fresh", resolution: "recount", reply: "Пересчитаем завтра" };
    assert.equal((await resolve(seller, verdict)).status, 403);
    const done = await resolve(boss, verdict);
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.equal(done.json.answer.resolution, "recount");
    assert.equal((await resolve(boss, verdict)).status, 409);

    // Продавец видит свой ответ и решение склада.
    const mine = await call("GET", "/api/receiving/answers", seller);
    assert.equal(mine.status, 200);
    assert.deepEqual(
      mine.json.answers.map((a) => [a.shipmentId, a.answer, a.resolution, a.reply]),
      [["exp-fresh", "dispute", "recount", "Пересчитаем завтра"]],
    );
  },
);
