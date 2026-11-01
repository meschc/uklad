/**
 * Сервер целиком, но без сети наружу: база в памяти, почта — заглушка,
 * которая записывает письма. Проверяем то, что ломается молча: заявка без
 * согласия не должна уйти, лимит должен срабатывать, демо-ссылка — открываться
 * один срок и не дольше.
 */
/* global require, fetch */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp, readEnv } = require("../src/server");
const { openDb } = require("../src/db");

const ORIGIN = "https://u-klad.ru";

function lead(over = {}) {
  return {
    kind: "demo",
    lang: "ru",
    subject: "Демо для склада",
    page: "https://u-klad.ru/warehouses/",
    consent: { data: true, ads: false },
    fields: { Имя: "Тест", Почта: "test@example.ru" },
    message: "Имя: Тест\nПочта: test@example.ru",
    elapsed: 20000,
    ...over,
  };
}

async function start(envOver = {}, mailOver = {}) {
  let clock = new Date("2026-10-21T10:00:00Z");
  const sent = [];
  const mail = {
    sendLetter: async (l) => void sent.push({ to: "owner", ...l }),
    sendTo: async (l) => void sent.push(l),
    replyTo: (fields) => fields.find((f) => f.value.includes("@"))?.value,
    ...mailOver,
  };
  const db = openDb(":memory:");
  const cfg = readEnv({ PUBLIC_URL: ORIGIN, ...envOver });
  const log = { error() {}, log() {} };
  const server = http.createServer(createApp({ cfg, db, mail, now: () => clock, log }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    sent,
    db,
    tick: (ms) => (clock = new Date(clock.getTime() + ms)),
    stop: () => new Promise((r) => (server.close(r), server.closeAllConnections())),
  };
}

const post = (base, body, origin = ORIGIN) =>
  fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("заявка уходит письмом, а демо — ссылкой на почту человека", async () => {
  const s = await start();
  const r = await post(s.base, lead());
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(s.sent.length, 2);
  assert.equal(s.sent[0].to, "owner");
  assert.equal(s.sent[1].to, "test@example.ru");
  const link = /https:\/\/u-klad\.ru\/d\/([A-Za-z0-9_-]{22})/.exec(s.sent[1].text);
  assert.ok(link, "в письме есть ссылка");

  const open = await fetch(`${s.base}/d/${link[1]}`, { redirect: "manual" });
  assert.equal(open.status, 302);
  assert.equal(open.headers.get("location"), "/app/");

  s.tick(15 * 86_400_000);
  const late = await fetch(`${s.base}/d/${link[1]}`, { redirect: "manual" });
  assert.equal(late.headers.get("location"), "/?demo=expired");
  await s.stop();
});

test("без согласия на обработку заявка не принимается и не сохраняется", async () => {
  const s = await start();
  const r = await post(s.base, lead({ consent: { data: false, ads: false } }));
  assert.equal(r.status, 400);
  assert.equal(s.sent.length, 0);
  await s.stop();
});

test("чужой источник получает 403", async () => {
  const s = await start();
  assert.equal((await post(s.base, lead(), "https://evil.example")).status, 403);
  assert.equal(s.sent.length, 0);
  await s.stop();
});

test("слишком быстрая отправка: «принято», но в базу и на почту не идёт", async () => {
  const s = await start();
  const r = await post(s.base, lead({ elapsed: 300 }));
  assert.equal(r.status, 200);
  assert.equal(s.sent.length, 0);
  assert.equal(s.db.purge(new Date("2027-12-01T00:00:00Z"), 180).leads, 0);
  await s.stop();
});

test("без времени на странице заявка не принимается", async () => {
  const s = await start();
  const noTime = lead();
  delete noTime.elapsed;
  assert.equal((await post(s.base, noTime)).status, 400);
  await s.stop();
});

test("ловушка для ботов: «принято», но письма нет", async () => {
  const s = await start();
  const r = await post(s.base, { ...lead(), website: "http://spam" });
  assert.equal(r.status, 200);
  assert.equal(s.sent.length, 0);
  await s.stop();
});

test("лимит частоты срабатывает после всплеска", async () => {
  const s = await start({ RATE_LIMIT_BURST: "2" });
  const kinds = { kind: "contact" };
  assert.equal((await post(s.base, lead(kinds))).status, 200);
  assert.equal((await post(s.base, lead(kinds))).status, 200);
  assert.equal((await post(s.base, lead(kinds))).status, 429);
  await s.stop();
});

test("слишком большое тело отвергается до разбора", async () => {
  const s = await start();
  const r = await post(s.base, "x".repeat(40 * 1024));
  assert.equal(r.status, 413);
  await s.stop();
});

test("упала почта — 502, но заявка осталась в базе", async () => {
  const s = await start(
    {},
    {
      sendLetter: async () => {
        throw new Error("smtp down");
      },
    },
  );
  assert.equal((await post(s.base, lead())).status, 502);
  assert.equal(s.db.purge(new Date("2027-12-01T00:00:00Z"), 180).leads, 1);
  await s.stop();
});

test("демо-писем на один адрес не больше лимита в сутки", async () => {
  const s = await start({ DEMO_PER_EMAIL_PER_DAY: "1" });
  await post(s.base, lead());
  await post(s.base, lead());
  assert.equal(s.sent.filter((m) => m.to === "test@example.ru").length, 1);
  await s.stop();
});

test("кривой токен не трогает базу и ведёт на главную", async () => {
  const s = await start();
  const r = await fetch(`${s.base}/d/'%20or%201=1`, { redirect: "manual" });
  assert.equal(r.headers.get("location"), "/?demo=expired");
  await s.stop();
});
