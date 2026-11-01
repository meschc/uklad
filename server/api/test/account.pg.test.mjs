// Удаление аккаунта (миграция 009): только с паролем, все сессии гаснут,
// войти и отменить можно 30 дней, потом аккаунт обезличивается, а компания
// без людей гаснет вместе со снимком. Выход на других устройствах.
/* global process, fetch, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, server, base, cookieName, account;
const sent = [];

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  const { createAccount } = require("../src/cabinet/account.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  account = createAccount({ pool: db.pool, auth, send, cfg, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await account.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 50, ratePerMinute: 50 },
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

async function call(path, { body, raw, cookie, org, ip = "10.0.2.1" } = {}) {
  const res = await fetch(base + path, {
    method: body || raw ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body || raw ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Регистрация целиком → кука и компания. */
async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await call("/api/auth/register", { body, ip })).status, 202);
  let code;
  for (let i = 0; i < 50 && !code; i++) {
    const m = sent.findLast((x) => x.to === email);
    if (m) code = /^(\d{6})/.exec(m.subject)[1];
    else await new Promise((r) => setTimeout(r, 10));
  }
  const res = await fetch(base + "/api/auth/verify", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ email, code }),
  });
  const token = new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie"))[1];
  return { cookie: token, org: (await res.json()).orgId };
}

async function login(email, ip) {
  const res = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ email, password: PW }),
  });
  const m = new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie") ?? "");
  return { status: res.status, cookie: m?.[1] };
}

test(
  "удаление: только с паролем, сессии гаснут, вход и отмена в течение 30 дней",
  { skip: SKIP },
  async () => {
    const a = await owner("del-a@sklad.ru", "10.0.2.2");
    const second = await login("del-a@sklad.ru", "10.0.2.2");
    const info = await call("/api/auth/account", a);
    assert.equal(info.json.email, "del-a@sklad.ru");
    assert.equal(info.json.deleteAt, null);
    assert.equal(info.json.otherSessions, 1);

    const wrong = await call("/api/auth/account/delete", {
      ...a,
      body: { password: "не-тот-пароль-1" },
    });
    assert.equal(wrong.status, 403);

    const del = await call("/api/auth/account/delete", { ...a, body: { password: PW } });
    assert.equal(del.status, 200);
    const days = (Date.parse(del.json.deleteAt) - Date.now()) / 86_400_000;
    assert.ok(days > 29.9 && days <= 30, `через 30 дней, а не ${days}`);
    assert.ok(sent.some((m) => m.to === "del-a@sklad.ru" && /будет удалён/.test(m.subject)));
    // Гаснут все сессии: и эта, и второе устройство.
    assert.equal((await call("/api/auth/me", a)).status, 401);
    assert.equal((await call("/api/auth/me", { cookie: second.cookie })).status, 401);

    // Вернулся паролем — видит дату и отменяет.
    const back = await login("del-a@sklad.ru", "10.0.2.2");
    assert.equal(back.status, 200);
    const pending = await call("/api/auth/account", { cookie: back.cookie });
    assert.equal(pending.json.deleteAt, del.json.deleteAt);
    const restore = await call("/api/auth/account/restore", { cookie: back.cookie, body: {} });
    assert.equal(restore.status, 200);
    assert.equal((await call("/api/auth/account", { cookie: back.cookie })).json.deleteAt, null);
  },
);

test(
  "через 30 дней аккаунт обезличен, компания без людей гаснет со снимком",
  { skip: SKIP },
  async () => {
    const a = await owner("del-b@sklad.ru", "10.0.2.3");
    await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 0, format: 8, data: { warehouse: { id: "wh", name: "секрет" } } },
    });
    await call("/api/auth/account/delete", { ...a, body: { password: PW } });
    // Ещё не срок: уборка ничего не трогает.
    await account.purge();
    let acc = await db.root.query(`SELECT email FROM auth.accounts WHERE email = 'del-b@sklad.ru'`);
    assert.equal(acc.rows.length, 1);
    // Отматываем 31 день.
    await db.root.query(
      `UPDATE auth.accounts SET delete_requested_at = now() - interval '31 days' WHERE email = 'del-b@sklad.ru'`,
    );
    await account.purge();
    acc = await db.root.query(`SELECT email FROM auth.accounts WHERE email = 'del-b@sklad.ru'`);
    assert.equal(acc.rows.length, 0, "почты больше нет");
    const org = await db.root.query(`SELECT deleted_at FROM uklad.orgs WHERE id = $1`, [a.org]);
    assert.ok(org.rows[0].deleted_at, "компания погашена");
    const snap = await db.root.query(`SELECT 1 FROM uklad.cabinet_snapshots WHERE org_id = $1`, [
      a.org,
    ]);
    assert.equal(snap.rows.length, 0, "снимок стёрт");
    assert.equal((await login("del-b@sklad.ru", "10.0.2.3")).status, 401);
  },
);

test("выход на других устройствах оставляет это", { skip: SKIP }, async () => {
  const a = await owner("del-c@sklad.ru", "10.0.2.4");
  const other = await login("del-c@sklad.ru", "10.0.2.4");
  const r = await call("/api/auth/sessions/revoke-others", { ...a, body: {} });
  assert.equal(r.json.closed, 1);
  assert.equal((await call("/api/auth/me", a)).status, 200);
  assert.equal((await call("/api/auth/me", { cookie: other.cookie })).status, 401);
});
