// Заявка продавца на отгрузку через сервер (п. 2.1а «До запуска»).
//
// «Как сломать» до кода: чужой товар, товар другого склада, плохое
// количество, повтор с тем же ключом, ключ чужой заявки, больше свободного,
// повтор номера заказа площадки, склад вместо продавца. Здесь — на настоящем
// Postgres. Без PG_ADMIN_URL тест пропускается.
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
  const { createSellerRequests } = require("../src/cabinet/sellerRequests.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {}, warn() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const team = createTeam({ auth, cfg, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  const requests = createSellerRequests({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)) ||
      (await requests.handle(req, res, url)),
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

async function call(method, path, { body, cookie, org, ip = "10.0.6.1" } = {}) {
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

async function invite(boss, email, partnerRef) {
  await post("/api/team/invite", {
    ...boss,
    body: { email, warehouseRef: "wh-a", partnerRef },
  });
  const token = tokenIn(await lastMail(email));
  const acc = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
    ip: boss.ip,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  return { cookie: cookieOf(acc.res), org: acc.json.orgId, ip: boss.ip };
}

const snap = async (who) => (await call("GET", "/api/cabinet/snapshot", who)).json?.snapshot;

/** Два склада, два продавца. На складе A: 10 мыла Ромашки, 5 шампуня Лютика. */
function cabinet() {
  const wh = (id, name) => ({
    id,
    name,
    floors: [{ id: `fl-${id}`, name: "Этаж 1", modules: [] }],
    staff: [],
    partners: [
      { id: "ptr-r", name: "Ромашка" },
      { id: "ptr-l", name: "Лютик" },
    ],
  });
  return {
    warehouse: wh("wh-a", "Складская 5"),
    otherWarehouses: [wh("wh-b", "Промзона 2")],
    activeFloorId: "fl-wh-a",
    products: [
      { id: "p-r", name: "Мыло", sku: "R-1", warehouseId: "wh-a", partnerId: "ptr-r" },
      { id: "p-l", name: "Шампунь", sku: "L-1", warehouseId: "wh-a", partnerId: "ptr-l" },
      { id: "p-rb", name: "Мыло Б", sku: "R-2", warehouseId: "wh-b", partnerId: "ptr-r" },
    ],
    placements: {},
    boxes: [
      { id: "box-1", lines: [{ productId: "p-r", qty: 10 }] },
      { id: "box-2", lines: [{ productId: "p-l", qty: 5 }] },
    ],
    requests: [
      {
        id: "req-ozon",
        productId: "p-r",
        qty: 1,
        source: "ozon",
        externalId: "OZ-77",
        status: "shipped",
        createdAt: 1,
        updatedAt: 1,
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

const KEY = "k-0001-aaaa";

test(
  "продавец заводит заявку только на свой товар и в пределах свободного",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-requests@example.com", "10.6.0.1");
    await writeCabinet(boss, cabinet());
    const romashka = await invite(boss, "romashka-r@example.com", "ptr-r");
    const lyutik = await invite(boss, "lyutik-r@example.com", "ptr-l");
    const ask = (who, body) => post("/api/requests", { ...who, body });
    const one = (productId, qty, key = KEY) => ({ key, items: [{ productId, qty }] });

    // Плохое тело — 400 до всякой базы.
    for (const qty of [0, -5, 1.5, 2_000_000, "3"]) {
      assert.equal((await ask(romashka, one("p-r", qty))).status, 400, `qty ${qty}`);
    }
    assert.equal((await ask(romashka, one("p-r", 1, "short"))).status, 400);
    assert.equal((await ask(romashka, { key: KEY, items: [] })).status, 400);

    // Чужой товар и свой товар другого склада для продавца не существуют.
    assert.equal((await ask(romashka, one("p-l", 1, "k-other-0001"))).json.error, "not_found");
    assert.equal((await ask(romashka, one("p-rb", 1, "k-other-0002"))).json.error, "not_found");

    // Больше свободного — отказ с числом свободного.
    const big = await ask(romashka, one("p-r", 11, "k-big-00001"));
    assert.equal(big.status, 409);
    assert.deepEqual([big.json.error, big.json.free], ["short", 10]);

    // Своё: статус и поля склада из тела не берутся.
    const made = await ask(romashka, {
      ...one("p-r", 3),
      note: "  Коледино ",
      status: "done",
      pickedQty: 3,
      warehouseId: "wh-b",
    });
    assert.equal(made.status, 200, JSON.stringify(made.json));
    const [r] = made.json.requests;
    assert.deepEqual(
      [r.productId, r.qty, r.status, r.by, r.note, r.pickedQty],
      ["p-r", 3, "new", "seller", "Коледино", undefined],
    );
    // Кто из людей продавца завёл — в заявке.
    assert.equal(typeof r.byMember, "string");

    // Повтор с тем же ключом — те же заявки, второй не заводится.
    const again = await ask(romashka, one("p-r", 3));
    assert.equal(again.status, 200);
    assert.equal(again.json.duplicate, true);
    assert.equal(again.json.requests[0].id, r.id);
    // Тот же ключ у другого продавца чужую заявку не отдаёт.
    const stolen = await ask(lyutik, one("p-l", 1));
    assert.deepEqual([stolen.status, stolen.json.error], [409, "key_taken"]);

    // Склад видит одну заявку продавца, на своём складе; свободного стало 7.
    const all = (await snap(boss)).data.requests.filter((x) => x.by === "seller");
    assert.deepEqual(
      all.map((x) => [x.id, x.qty]),
      [[r.id, 3]],
    );
    const over = await ask(romashka, one("p-r", 8, "k-over-0001"));
    assert.deepEqual([over.json.error, over.json.free], ["short", 7]);

    // Номер заказа площадки, который уже был заявкой, второй раз не заводится.
    const dup = await ask(romashka, {
      ...one("p-r", 1, "k-ozon-0001"),
      source: "ozon",
      externalId: "oz-77",
    });
    assert.deepEqual([dup.status, dup.json.error], [409, "duplicate_order"]);
    // Тот же номер у другого продавца — его заказ, не «уже есть».
    const hers = await ask(lyutik, {
      ...one("p-l", 1, "k-ozon-0002"),
      source: "ozon",
      externalId: "OZ-77",
    });
    assert.equal(hers.status, 200, JSON.stringify(hers.json));

    // Продавец видит свою заявку в своём кабинете, Лютик — нет.
    const mine = (await snap(romashka)).data.requests.map((x) => x.id);
    assert.ok(mine.includes(r.id));
    assert.ok(!(await snap(lyutik)).data.requests.some((x) => x.id === r.id));

    // Склад этим маршрутом не пишет: у него правка кабинета.
    assert.equal((await ask(boss, one("p-r", 1, "k-boss-0001"))).status, 403);

    // Частота: не больше 30 заявок в минуту на человека, дальше 429.
    const codes = [];
    for (let i = 0; i < 31; i++) {
      const key = `k-rate-${String(i).padStart(4, "0")}`;
      codes.push((await ask(lyutik, one("p-l", 1, key))).status);
    }
    assert.equal(codes.at(-1), 429);
  },
);
