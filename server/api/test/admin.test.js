/**
 * Админка целиком на базе в памяти. Проверяем то, что при поломке выглядит
 * как «всё работает»: вход без кода, повтор кода, форма без CSRF, правка
 * журнала. Обычные экраны тут вторичны.
 */
/* global require, fetch, Buffer, URLSearchParams */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { openDb } = require("../src/db");
const { adminStore } = require("../src/admin/store");
const { hashPassword } = require("../src/admin/password");
const totp = require("../src/admin/totp");
const { createAdminApp, COOKIE } = require("../src/admin/app");

const ORIGIN = "https://admin.u-klad.ru";
const PASSWORD = "очень-длинный-пароль-1";
const SECRET = totp.newSecret();

async function start() {
  let clock = new Date("2026-10-21T10:00:00Z");
  const db = openDb(":memory:");
  const store = adminStore(db.raw);
  store.addAdmin(
    { email: "owner@u-klad.ru", passwordHash: hashPassword(PASSWORD), totpSecret: SECRET },
    clock,
  );
  const cfg = { adminOrigin: ORIGIN, publicUrl: "https://u-klad.ru", trustProxy: false };
  const log = { error() {}, log() {} };
  const server = http.createServer(createAdminApp({ cfg, db: db.raw, now: () => clock, log }));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const code = () => totp.codeAt(SECRET, Math.floor(clock.getTime() / totp.STEP_MS));
  const post = (path, fields, cookie, origin = ORIGIN) =>
    fetch(base + path, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: new URLSearchParams(fields).toString(),
    });
  const get = (path, cookie) =>
    fetch(base + path, { redirect: "manual", headers: cookie ? { Cookie: cookie } : {} });
  async function login(over = {}) {
    const res = await post("/login", {
      email: "owner@u-klad.ru",
      password: PASSWORD,
      code: code(),
      ...over,
    });
    const set = res.headers.get("set-cookie") ?? "";
    return { res, cookie: set.split(";")[0] };
  }
  async function csrf(cookie) {
    const page = await (await get("/", cookie)).text();
    return /name="csrf" value="([^"]+)"/.exec(page)[1];
  }
  return {
    db,
    store,
    get,
    post,
    login,
    csrf,
    tick: (ms) => (clock = new Date(clock.getTime() + ms)),
    stop: () => new Promise((r) => (server.close(r), server.closeAllConnections())),
  };
}

test("TOTP совпадает с эталоном RFC 6238", () => {
  // Секрет «12345678901234567890» из приложения B RFC, T = 59 с → …287082.
  const secret = totp.base32Encode(Buffer.from("12345678901234567890"));
  assert.equal(totp.codeAt(secret, 1), "287082");
});

test("без сессии страницы закрыты", async (t) => {
  const app = await start();
  t.after(app.stop);
  const res = await app.get("/");
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/login");
  assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
});

test("вход: пароль без верного кода не пускает", async (t) => {
  const app = await start();
  t.after(app.stop);
  const bad = await app.login({ code: "000000" });
  assert.equal(bad.res.status, 401);
  assert.equal(bad.cookie, "");
  const good = await app.login();
  assert.equal(good.res.status, 303);
  assert.ok(good.cookie.startsWith(`${COOKIE}=`));
  assert.match(good.res.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Strict/);
});

test("тот же код второй раз не принимается", async (t) => {
  const app = await start();
  t.after(app.stop);
  assert.equal((await app.login()).res.status, 303);
  assert.equal((await app.login()).res.status, 401);
});

test("пять неудач закрывают вход даже с верными данными", async (t) => {
  const app = await start();
  t.after(app.stop);
  for (let i = 0; i < 5; i++) await app.login({ password: "неверный-пароль-123" });
  const locked = await app.login();
  assert.equal(locked.res.status, 401);
  assert.match(await locked.res.text(), /временно закрыт/);
  app.tick(16 * 60_000);
  assert.equal((await app.login()).res.status, 303);
});

test("форма без CSRF или с чужого адреса отбрасывается", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { cookie } = await app.login();
  const fields = { kind: "warehouse", name: "Склад", email: "a@b.ru" };
  assert.equal((await app.post("/accounts", fields, cookie)).status, 403);
  const csrf = await app.csrf(cookie);
  const foreign = await app.post("/accounts", { ...fields, csrf }, cookie, "https://evil.example");
  assert.equal(foreign.status, 403);
  assert.equal(app.store.listAccounts().length, 0);
});

test("аккаунт: добавить, заблокировать, сбросить доступ — всё в журнале", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { cookie } = await app.login();
  const csrf = await app.csrf(cookie);
  const made = await app.post(
    "/accounts",
    { kind: "warehouse", name: "Склад <b>Север</b>", email: "Sever@Example.ru", csrf },
    cookie,
  );
  assert.equal(made.status, 303);
  const id = made.headers.get("location").split("/").pop();

  const card = await (await app.get(`/accounts/${id}`, cookie)).text();
  assert.match(card, /Склад &lt;b&gt;Север&lt;\/b&gt;/, "название экранировано");

  await app.post(`/accounts/${id}/block`, { note: "не оплатил", csrf }, cookie);
  assert.equal(app.store.account(Number(id)).status, "blocked");

  const reset = await (await app.post(`/accounts/${id}/reset`, { csrf }, cookie)).text();
  const link = /https:\/\/u-klad\.ru\/app\/reset\/([A-Za-z0-9_-]{43})/.exec(reset);
  assert.ok(link, "ссылка показана");
  const stored = app.db.raw.prepare("SELECT token_hash FROM access_resets").all();
  assert.ok(!stored.some((r) => r.token_hash === link[1]), "в базе только хэш");

  const actions = app.store.audit().map((r) => r.action);
  for (const a of ["login", "account_create", "account_block", "access_reset"]) {
    assert.ok(actions.includes(a), a);
  }
});

test("журнал нельзя исправить или стереть", async (t) => {
  const app = await start();
  t.after(app.stop);
  await app.login();
  assert.throws(() => app.db.raw.exec("UPDATE admin_audit SET action = 'x'"), /дописывается/);
  assert.throws(() => app.db.raw.exec("DELETE FROM admin_audit"), /дописывается/);
});

test("сессия гаснет после часа без действий", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { cookie } = await app.login();
  assert.equal((await app.get("/", cookie)).status, 200);
  app.tick(61 * 60_000);
  assert.equal((await app.get("/", cookie)).status, 303);
});
