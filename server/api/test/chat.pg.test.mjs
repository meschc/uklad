// Чат по HTTP на настоящем Postgres: склад и селлер по договору, групповой
// диалог, прочтение, правка, «звонок» участникам. Без PG_ADMIN_URL пропускается.
//
//   PG_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node --test server/api/test/chat.pg.test.mjs
/* global process, fetch, URL, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, helpers, server, base, cookieName, notifier;
// Что ушло бы в Centrifugo: кому и о чём.
const rings = [];
// Что ушло бы в Телеграм и на почту.
const tg = [];
const letters = [];
const SECRET = "s".repeat(40);

before(async () => {
  if (SKIP) return;
  helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createChat } = require("../src/cabinet/chat.js");
  const { createTelegram } = require("../src/cabinet/telegram.js");
  const { createNotifier } = require("../src/cabinet/notify.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  // Коды входа идут отдельно от писем о непрочитанном, которые проверяет тест.
  const authMail = { sendTo: async (m) => void codes.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail: authMail });
  const realtime = { notify: async (to, data) => rings.push({ to, data }) };
  const chat = createChat({ auth, realtime, send, log: quiet });
  const tgApi = {
    enabled: true,
    sendMessage: async (chatId, text) => {
      tg.push({ chatId: String(chatId), text });
      return { ok: true, blocked: false };
    },
  };
  const telegram = createTelegram({
    notifierPool: db.notifier,
    auth,
    api: tgApi,
    botName: "uklad_test_bot",
    webhookSecret: SECRET,
    send,
    readBody,
    log: quiet,
  });
  const mail = { sendTo: async (letter) => letters.push(letter) };
  notifier = createNotifier({
    pool: db.notifier,
    telegram: tgApi,
    mail,
    appUrl: `${ORIGIN}/app/`,
    log: quiet,
  });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await chat.handle(req, res, url)) ||
      (await telegram.handle(req, res, url)),
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

const codes = [];
async function codeFor(email) {
  for (let i = 0; i < 50; i++) {
    const m = codes.findLast((x) => x.to === email);
    if (m) return /^(\d{6})/.exec(m.subject)[1];
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`нет кода для ${email}`);
}

/** Владелец новой компании: токен, компания, его карточка сотрудника. */
async function signUp(email, kind) {
  const reg = await call("/api/auth/register", {
    body: { email, password: PW, company: email, kind, name: email, consent: true },
  });
  assert.equal(reg.status, 202);
  const r = await call("/api/auth/verify", { body: { email, code: await codeFor(email) } });
  assert.equal(r.status, 200);
  const who = { token: r.token, orgId: r.json.orgId };
  const me = await call(`/api/auth/me?org=${who.orgId}`, { who });
  return { ...who, memberId: me.json.current.memberId };
}

let wh, seller, stranger, contractId, convId;

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
    convId = id;

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

/**
 * Перевести часы чата назад: сообщения, прочтения и отметки рассылки
 * становятся старше на `interval`. Триггеры неизменяемости обходятся только
 * здесь, суперпользователем тестовой базы.
 */
async function travel(interval) {
  const r = db.root;
  await r.query("BEGIN");
  await r.query("SET LOCAL session_replication_role = replica");
  await r.query(`UPDATE uklad.messages SET created_at = created_at - $1::interval`, [interval]);
  await r.query(
    `UPDATE uklad.conversation_members
     SET joined_at = joined_at - $1::interval, last_read_at = last_read_at - $1::interval`,
    [interval],
  );
  await r.query(
    `UPDATE auth.chat_notified
     SET notified_upto = notified_upto - $1::interval, notified_at = notified_at - $1::interval`,
    [interval],
  );
  await r.query("COMMIT");
}

const update = (text, chatId = 777, secret = SECRET) =>
  fetch(`${base}/api/telegram/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Telegram-Bot-Api-Secret-Token": secret },
    body: JSON.stringify({ message: { chat: { id: chatId, type: "private" }, text } }),
  });

test(
  "Телеграм: привязка по одноразовой ссылке и уведомление о непрочитанном",
  { skip: SKIP },
  async () => {
    const before = await call("/api/chat/telegram", { who: seller });
    assert.deepEqual([before.json.available, before.json.linked], [true, false]);

    const link = await post("/api/chat/telegram/link", {}, seller);
    assert.equal(link.status, 200);
    const code = new URL(link.json.url).searchParams.get("start");
    assert.match(link.json.url, /^https:\/\/t\.me\/uklad_test_bot\?start=/);

    // Без секрета вебхук закрыт: чужой «/start» не привяжет ничего.
    assert.equal((await update(`/start ${code}`, 777, "x".repeat(40))).status, 403);
    assert.equal((await update(`/start ${code}`)).status, 200);
    assert.match(tg.at(-1).text, /^Готово/);
    assert.equal((await call("/api/chat/telegram", { who: seller })).json.linked, true);
    // Второй раз та же ссылка не работает — даже из другого Телеграма.
    await update(`/start ${code}`, 888);
    assert.match(tg.at(-1).text, /устарела/);

    tg.length = 0;
    await post("/api/chat/messages", { conversationId: convId, body: "Машина в 14:00" }, wh);
    // Минуты ещё не прошло — человек, может быть, читает в кабинете.
    assert.equal(await notifier.tickTelegram(), 0);
    await travel("2 minutes");
    assert.equal(await notifier.tickTelegram(), 1);
    assert.equal(tg[0].chatId, "777");
    assert.match(tg[0].text, /wh@chat\.ru — Поставки/);
    assert.match(tg[0].text, /Машина в 14:00/);
    // Повторно о том же не говорим.
    assert.equal(await notifier.tickTelegram(), 0);

    // Показ текста выключен — в Телеграм уходит только «кто».
    await post("/api/chat/settings", { notifyPreview: false }, seller);
    await post("/api/chat/messages", { conversationId: convId, body: "Код ворот 4512" }, wh);
    await travel("2 minutes");
    assert.equal(await notifier.tickTelegram(), 1);
    assert.match(tg[1].text, /Новое сообщение/);
    assert.equal(tg[1].text.includes("4512"), false);

    // Прочитал в кабинете — уведомлять не о чем.
    await post("/api/chat/messages", { conversationId: convId, body: "Ещё одно" }, wh);
    await post("/api/chat/read", { conversationId: convId }, seller);
    await travel("2 minutes");
    assert.equal(await notifier.tickTelegram(), 0);

    // /stop — и бот замолкает.
    await update("/stop");
    await post("/api/chat/messages", { conversationId: convId, body: "Вы тут?" }, wh);
    await travel("2 minutes");
    assert.equal(await notifier.tickTelegram(), 0);
    assert.equal((await call("/api/chat/telegram", { who: seller })).json.linked, false);
  },
);

test(
  "письмо о непрочитанном — только на подтверждённую почту и не чаще раза в 6 часов",
  { skip: SKIP },
  async () => {
    letters.length = 0;
    // Регистрация подтвердила почту кодом; здесь проверяем запись, где она
    // ещё не подтверждена.
    await db.root.query(
      `UPDATE auth.accounts SET email_verified_at = NULL WHERE email = 'seller@chat.ru'`,
    );
    await post("/api/chat/messages", { conversationId: convId, body: "Акт подписали?" }, wh);
    await travel("2 hours");
    // Почта не подтверждена — не пишем: адрес мог вписать кто угодно.
    assert.equal(await notifier.tickEmail(), 0);

    await db.root.query(
      `UPDATE auth.accounts SET email_verified_at = now() WHERE email = 'seller@chat.ru'`,
    );
    assert.equal(await notifier.tickEmail(), 1);
    assert.equal(letters[0].to, "seller@chat.ru");
    assert.match(letters[0].text, /wh@chat\.ru — Поставки/);

    await post("/api/chat/messages", { conversationId: convId, body: "Ау" }, wh);
    await travel("2 hours");
    assert.equal(await notifier.tickEmail(), 0);
    await travel("5 hours");
    assert.equal(await notifier.tickEmail(), 1);
  },
);
