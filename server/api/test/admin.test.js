/**
 * Админка целиком на базе в памяти. Проверяем то, что при поломке выглядит
 * как «всё работает»: вход без кода, повтор кода, форма без CSRF, правка
 * журнала. Обычные экраны тут вторичны.
 */
/* global require, fetch, Buffer, URLSearchParams, __dirname */
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

test("пять неудач с одного адреса закрывают вход с него на 15 минут", async (t) => {
  const app = await start();
  t.after(app.stop);
  for (let i = 0; i < 5; i++) await app.login({ password: "неверный-пароль-123" });
  const locked = await app.login();
  assert.equal(locked.res.status, 401);
  assert.match(await locked.res.text(), /временно закрыт/);
  app.tick(16 * 60_000);
  assert.equal((await app.login()).res.status, 303);
});

test("чужие неудачи не запирают аккаунт раньше двадцатой", async (t) => {
  const app = await start();
  t.after(app.stop);
  const owner = app.store.adminByEmail("owner@u-klad.ru");
  app.store.failAdmin(owner.id, 18, null);
  await app.login({ password: "неверный-пароль-123" });
  assert.equal(app.store.adminByEmail("owner@u-klad.ru").locked_until, null);
  await app.login({ password: "неверный-пароль-123" });
  assert.ok(app.store.adminByEmail("owner@u-klad.ru").locked_until, "двадцатая закрывает");
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
  assert.equal(app.store.allAccounts().length, 0);
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

test("цены тарифов совпадают с витриной", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const plans = require("../src/admin/plans");
  const src = fs.readFileSync(path.join(__dirname, "../../../src/site/data/plans.ts"), "utf8");
  for (const id of ["start", "warehouse", "operator"]) {
    const m = new RegExp(`id: "${id}"[\\s\\S]*?monthly: (\\d+)`).exec(src);
    assert.ok(m, `тариф ${id} есть на витрине`);
    assert.equal(plans.PLANS[id].price, Number(m[1]), id);
  }
});

test("продление идёт от «оплачено до», оплата и журнал записаны", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { cookie } = await app.login();
  const csrf = await app.csrf(cookie);
  const made = await app.post(
    "/accounts",
    {
      kind: "warehouse",
      name: "Склад",
      email: "w@example.ru",
      tariff: "warehouse",
      trial: "on",
      csrf,
    },
    cookie,
  );
  const id = Number(made.headers.get("location").split("/").pop());
  const a = app.store.account(id);
  assert.equal(a.price, 9900);
  assert.equal(a.trial_until.slice(0, 10), "2027-01-21", "3 месяца пробного");

  await app.post(
    `/accounts/${id}/tariff`,
    {
      tariff: "warehouse",
      period: "month",
      price: "",
      manager_id: "",
      trial_until: "2027-01-21",
      paid_until: "2026-11-30",
      csrf,
    },
    cookie,
  );
  await app.post(`/accounts/${id}/extend`, { months: "3", amount: "29700", csrf }, cookie);
  const after = app.store.account(id);
  assert.equal(after.paid_until.slice(0, 10), "2027-02-28", "от 30.11 плюс 3 месяца");
  assert.equal(app.store.paymentsOf(id)[0].amount, 29700);
  assert.ok(app.store.auditOf(`account:${id}`).some((r) => r.action === "account_extend"));
});

test("функции и лимиты сверх тарифа, архив только с подтверждением", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { cookie } = await app.login();
  const csrf = await app.csrf(cookie);
  const made = await app.post(
    "/accounts",
    { kind: "seller", name: "Селлер", email: "s@example.ru", csrf },
    cookie,
  );
  const id = Number(made.headers.get("location").split("/").pop());
  await app.post(
    `/accounts/${id}/features`,
    { f_heatmap: "on", f_roles: "plan", l_staff: "12", l_skus: "", csrf },
    cookie,
  );
  const plans = require("../src/admin/plans");
  const a = app.store.account(id);
  assert.equal(plans.effectiveFeatures(a).heatmap.on, true);
  assert.equal(plans.effectiveFeatures(a).roles.on, false, "у «Старта» ролей нет");
  assert.equal(plans.effectiveLimits(a).staff.value, 12);
  assert.equal(plans.effectiveLimits(a).skus.value, 5000);

  assert.equal(
    (await app.post(`/accounts/${id}/archive`, { confirm: "не то", csrf }, cookie)).status,
    400,
  );
  assert.equal(app.store.account(id).archived_at, null);
  await app.post(`/accounts/${id}/archive`, { confirm: "Селлер", csrf }, cookie);
  assert.ok(app.store.account(id).archived_at);
});

test("смена пароля требует код и закрывает остальные входы", async (t) => {
  const app = await start();
  t.after(app.stop);
  const first = await app.login();
  app.tick(31_000);
  const second = await app.login();
  const csrf = await app.csrf(second.cookie);
  const bad = await app.post(
    "/settings/password",
    {
      current: PASSWORD,
      next: "новый-пароль-длинный",
      next2: "новый-пароль-длинный",
      code: "000000",
      csrf,
    },
    second.cookie,
  );
  assert.equal(bad.status, 400);
  app.tick(31_000);
  const code = totp.codeAt(
    SECRET,
    Math.floor(new Date("2026-10-21T10:01:02Z").getTime() / totp.STEP_MS),
  );
  const ok = await app.post(
    "/settings/password",
    { current: PASSWORD, next: "новый-пароль-длинный", next2: "новый-пароль-длинный", code, csrf },
    second.cookie,
  );
  assert.equal(ok.status, 303);
  assert.equal((await app.get("/", first.cookie)).status, 303, "первый вход закрыт");
  assert.equal((await app.get("/", second.cookie)).status, 200, "текущий жив");
});

test("заявка становится аккаунтом с пробным периодом", async (t) => {
  const app = await start();
  t.after(app.stop);
  app.db.addLead(
    {
      kind: "demo",
      lang: "ru",
      subject: "Демо",
      message: "Имя: Ольга\nПочта: Olga@Test.ru",
      consent: { ads: false },
    },
    new Date("2026-10-21T09:00:00Z"),
  );
  app.store = require("../src/admin/store").adminStore(app.db.raw);
  const { cookie } = await app.login();
  const csrf = await app.csrf(cookie);
  const res = await app.post("/leads/1/convert", { csrf }, cookie);
  assert.equal(res.status, 303);
  const acc = app.store.accountByEmail("olga@test.ru");
  assert.ok(acc, "аккаунт создан");
  assert.equal(acc.contact_name, "Ольга");
  assert.ok(acc.trial_until);
  assert.equal(app.store.lead(1).status, "won");
});

test("все страницы открываются и экранируют ввод", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { cookie } = await app.login();
  for (const p of [
    "/",
    "/accounts",
    "/accounts/new",
    "/leads",
    "/demos",
    "/managers",
    "/audit",
    "/settings",
    "/accounts?q=%3Cscript%3E",
  ]) {
    const res = await app.get(p, cookie);
    assert.equal(res.status, 200, p);
    assert.ok(!(await res.text()).includes("<script>"), p);
  }
});
