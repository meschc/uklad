// Чат по HTTP на настоящем Postgres: склад и селлер по договору, групповой
// диалог, прочтение, правка, «звонок» участникам. Без PG_ADMIN_URL пропускается.
//
//   PG_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node --test server/api/test/chat.pg.test.mjs
/* global process, fetch */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, helpers, server, base, cookieName;
// Что ушло бы в Centrifugo: кому и о чём.
const rings = [];

before(async () => {
  if (SKIP) return;
  helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createChat } = require("../src/cabinet/chat.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet });
  const realtime = { notify: async (to, data) => rings.push({ to, data }) };
  const chat = createChat({ auth, realtime, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) || (await chat.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 5, ratePerMinute: 2 },
      db: {},
      mail: {},
      cabinet,
      log: quiet,
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await seed();
});

after(async () => {
  if (SKIP) return;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.teardown();
});

async function call(path, { body, who } = {}) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": "10.0.0.9",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(who ? { Cookie: `${cookieName}=${who.token}`, "X-Uklad-Org": who.orgId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie") ?? "";
  const token = new RegExp(`${cookieName}=([^;]*)`).exec(set)?.[1];
  return { status: res.status, json: await res.json().catch(() => null), token };
}

/** Владелец новой компании: токен, компания, его карточка сотрудника. */
async function signUp(email, kind) {
  const r = await call("/api/auth/register", {
    body: { email, password: PW, company: email, kind, name: email, consent: true },
  });
  assert.equal(r.status, 201);
  const who = { token: r.token, orgId: r.json.orgId };
  const me = await call(`/api/auth/me?org=${who.orgId}`, { who });
  return { ...who, memberId: me.json.current.memberId };
}

let wh, seller, stranger, contractId;

async function seed() {
  wh = await signUp("wh@chat.ru", "warehouse");
  seller = await signUp("seller@chat.ru", "seller");
  stranger = await signUp("other@chat.ru", "seller");
  contractId = await helpers.asOrg(db.pool, wh.orgId, async (c) => {
    const one = async (sql, args) => (await c.query(sql, args)).rows[0].id;
    const w = await one(
      `INSERT INTO uklad.warehouses (org_id, name) VALUES ($1, 'Мезонин') RETURNING id`,
      [wh.orgId],
    );
    return one(
      `INSERT INTO uklad.contracts (org_id, warehouse_id, seller_org_id) VALUES ($1, $2, $3) RETURNING id`,
      [wh.orgId, w, seller.orgId],
    );
  });
}

const post = (path, body, who) => call(path, { body, who });

test(
  "склад заводит чат по договору, селлер входит сам и они переписываются",
  { skip: SKIP },
  async () => {
    const conv = await post("/api/chat/conversations", { contractId, title: "Поставки" }, wh);
    assert.equal(conv.status, 201);
    const id = conv.json.id;

    // Селлер видит диалог как «можно войти», а переписку — только после входа.
    const list = await call("/api/chat/conversations", { who: seller });
    assert.deepEqual(
      list.json.joinable.map((c) => c.id),
      [id],
    );
    assert.equal(
      (await call(`/api/chat/messages?conversation=${id}`, { who: seller })).status,
      404,
    );
    const join = await post(
      "/api/chat/members/add",
      { conversationId: id, memberId: seller.memberId },
      seller,
    );
    assert.equal(join.status, 201);

    rings.length = 0;
    const sent = await post(
      "/api/chat/messages",
      { conversationId: id, body: "Приняли 11 коробов из 12" },
      wh,
    );
    assert.equal(sent.status, 201);
    // Звонок ушёл селлеру, а не автору, и без текста сообщения.
    assert.deepEqual(rings[0].to, [seller.memberId]);
    assert.equal(JSON.stringify(rings[0].data).includes("коробов"), false);

    const mine = await call("/api/chat/conversations", { who: seller });
    assert.equal(mine.json.conversations[0].unread, 1);
    const feed = await call(`/api/chat/messages?conversation=${id}`, { who: seller });
    assert.equal(feed.json.messages[0].body, "Приняли 11 коробов из 12");
    assert.equal(feed.json.messages[0].authorName, "wh@chat.ru");

    await post("/api/chat/read", { conversationId: id }, seller);
    const read = await call("/api/chat/conversations", { who: seller });
    assert.equal(read.json.conversations[0].unread, 0);

    // Ответ селлера; правка чужого — 404; своё удаление оставляет пометку.
    const reply = await post(
      "/api/chat/messages",
      { conversationId: id, body: "Вижу акт", replyTo: sent.json.id },
      seller,
    );
    assert.equal(reply.status, 201);
    const forge = await post("/api/chat/messages/edit", { id: sent.json.id, body: "x" }, seller);
    assert.equal(forge.status, 404);
    const del = await post("/api/chat/messages/delete", { id: reply.json.id }, seller);
    assert.equal(del.status, 200);
    const after = await call(`/api/chat/messages?conversation=${id}`, { who: wh });
    assert.equal(after.json.messages[1].body, "");
    assert.ok(after.json.messages[1].deletedAt);

    // Чужой селлер не знает о диалоге ничего.
    const other = await call("/api/chat/conversations", { who: stranger });
    assert.deepEqual(other.json.joinable, []);
    assert.equal(
      (await call(`/api/chat/messages?conversation=${id}`, { who: stranger })).status,
      404,
    );
    const intrude = await post(
      "/api/chat/messages",
      { conversationId: id, body: "привет" },
      stranger,
    );
    assert.equal(intrude.status, 404);
  },
);

test("настройка «показывать текст» сохраняется у человека", { skip: SKIP }, async () => {
  const off = await post("/api/chat/settings", { notifyPreview: false }, wh);
  assert.equal(off.status, 200);
  assert.equal(off.json.notifyPreview, false);
  assert.equal((await post("/api/chat/settings", { notifyPreview: "нет" }, wh)).status, 400);
});

test("без входа и с чужого сайта чат закрыт", { skip: SKIP }, async () => {
  assert.equal((await call("/api/chat/conversations")).status, 401);
  const res = await fetch(`${base}/api/chat/messages`, {
    method: "POST",
    headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(res.status, 403);
});
