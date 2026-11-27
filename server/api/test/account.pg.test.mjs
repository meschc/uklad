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
      body: {
        version: 0,
        format: 8,
        data: { warehouse: { id: "wh", name: "секрет" }, requests: [{ id: "r1", to: "адрес" }] },
      },
    });
    const had = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.cabinet_records WHERE org_id = $1`,
      [a.org],
    );
    assert.equal(had.rows[0].n, 1, "заявка легла строкой");
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
    const recs = await db.root.query(`SELECT 1 FROM uklad.cabinet_records WHERE org_id = $1`, [
      a.org,
    ]);
    assert.equal(recs.rows.length, 0, "работа склада стёрта вместе со снимком");
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

test(
  "пароль при удалении: 5 неудач на аккаунт — и пауза, как на входе",
  { skip: SKIP },
  async () => {
    const a = await owner("del-g@sklad.ru", "10.0.2.5");
    for (let i = 0; i < 5; i++) {
      const r = await call("/api/auth/account/delete", {
        ...a,
        body: { password: `мимо-${i}-пароль` },
      });
      assert.equal(r.status, 403);
    }
    const locked = await call("/api/auth/account/delete", { ...a, body: { password: PW } });
    assert.equal(locked.status, 429, "даже верный пароль ждёт окончания паузы");
    assert.equal((await call("/api/auth/account", a)).json.deleteAt, null);
  },
);

const role = async (org, name) =>
  (await db.root.query(`SELECT id FROM uklad.roles WHERE org_id = $1 AND name = $2`, [org, name]))
    .rows[0].id;

const expire = (email) =>
  db.root.query(
    `UPDATE auth.accounts SET delete_requested_at = now() - interval '31 days' WHERE email = $1`,
    [email],
  );

test(
  "руководитель ушёл: бейдж-сотрудники обезличены, компания погашена",
  { skip: SKIP },
  async () => {
    const a = await owner("del-d@sklad.ru", "10.0.2.6");
    const { rows } = await db.root.query(
      `INSERT INTO uklad.members (org_id, role_id, display_name, status)
     VALUES ($1, $2, 'Иван', 'active') RETURNING id`,
      [a.org, await role(a.org, "Кладовщик / оператор")],
    );
    await call("/api/auth/account/delete", { ...a, body: { password: PW } });
    await expire("del-d@sklad.ru");
    await account.purge();
    const m = await db.root.query(
      `SELECT display_name, deleted_at FROM uklad.members WHERE id = $1`,
      [rows[0].id],
    );
    assert.equal(m.rows[0].display_name, null);
    assert.ok(m.rows[0].deleted_at);
    const org = await db.root.query(`SELECT deleted_at FROM uklad.orgs WHERE id = $1`, [a.org]);
    assert.ok(org.rows[0].deleted_at);
  },
);

test("есть другой руководитель с паролем — компания живёт", { skip: SKIP }, async () => {
  const a = await owner("del-e@sklad.ru", "10.0.2.7");
  await owner("del-f@sklad.ru", "10.0.2.7");
  const other = await db.root.query(`SELECT id FROM auth.accounts WHERE email = 'del-f@sklad.ru'`);
  await db.root.query(
    `INSERT INTO uklad.members (org_id, account_id, role_id, display_name, status)
     VALUES ($1, $2, $3, 'Пётр', 'active')`,
    [a.org, other.rows[0].id, await role(a.org, "Начальник склада")],
  );
  await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: { warehouse: { id: "wh", name: "живой" } } },
  });
  await call("/api/auth/account/delete", { ...a, body: { password: PW } });
  await expire("del-e@sklad.ru");
  await account.purge();
  const org = await db.root.query(`SELECT deleted_at FROM uklad.orgs WHERE id = $1`, [a.org]);
  assert.equal(org.rows[0].deleted_at, null);
  const snap = await db.root.query(`SELECT 1 FROM uklad.cabinet_snapshots WHERE org_id = $1`, [
    a.org,
  ]);
  assert.equal(snap.rows.length, 1);
});

test(
  "оба руководителя удаляются: компания ждёт второго, он успевает передумать",
  { skip: SKIP },
  async () => {
    const a = await owner("del-h@sklad.ru", "10.0.2.8");
    const b = await owner("del-i@sklad.ru", "10.0.2.8");
    const bAcc = await db.root.query(`SELECT id FROM auth.accounts WHERE email = 'del-i@sklad.ru'`);
    await db.root.query(
      `INSERT INTO uklad.members (org_id, account_id, role_id, display_name, status)
     VALUES ($1, $2, $3, 'Пётр', 'active')`,
      [a.org, bAcc.rows[0].id, await role(a.org, "Начальник склада")],
    );
    await call("/api/auth/account/delete", { ...a, body: { password: PW } });
    await call("/api/auth/account/delete", { ...b, body: { password: PW } });
    await expire("del-h@sklad.ru");
    await account.purge();
    const org = await db.root.query(`SELECT deleted_at FROM uklad.orgs WHERE id = $1`, [a.org]);
    assert.equal(org.rows[0].deleted_at, null, "второй ещё может отменить");
    const back = await login("del-i@sklad.ru", "10.0.2.8");
    assert.equal(
      (await call("/api/auth/account/restore", { cookie: back.cookie, body: {} })).status,
      200,
    );
  },
);

/** Смена пароля из настроек: новая кука и тело ответа. */
async function changePassword(who, body, ip = "10.0.2.9") {
  const res = await fetch(base + "/api/auth/password", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      Cookie: `${cookieName}=${who.cookie}`,
    },
    body: JSON.stringify(body),
  });
  const m = new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie") ?? "");
  return { status: res.status, json: await res.json().catch(() => null), cookie: m?.[1] };
}

test(
  "смена пароля: старый обязателен, другие сессии гаснут, эта остаётся, письмо уходит",
  { skip: SKIP },
  async () => {
    const email = "pw-a@sklad.ru";
    const a = await owner(email, "10.0.2.9");
    const other = await login(email, "10.0.2.9");
    const NEXT = "другой-длинный-пароль";
    // Слабый и тот же — отказ без траты попытки.
    assert.equal(
      (await changePassword(a, { password: PW, next: "123" })).json.error,
      "weak_password",
    );
    assert.equal((await changePassword(a, { password: PW, next: PW })).json.error, "same_password");
    assert.equal((await changePassword(a, { password: "мимо-пароль-1", next: NEXT })).status, 403);
    // Без входа — 401.
    assert.equal((await changePassword({ cookie: "x" }, { password: PW, next: NEXT })).status, 401);

    const ok = await changePassword(a, { password: PW, next: NEXT });
    assert.equal(ok.status, 200, JSON.stringify(ok.json));
    assert.ok(ok.cookie, "новая кука этой сессии");
    assert.equal((await call("/api/auth/me", { cookie: ok.cookie })).status, 200);
    assert.equal((await call("/api/auth/me", { cookie: other.cookie })).status, 401);
    assert.equal(
      (await call("/api/auth/me", a)).status,
      401,
      "старая кука этой вкладки тоже погасла",
    );
    assert.ok(sent.some((m) => m.to === email && /Пароль в Укладе изменён/.test(m.subject)));
    // Старым паролем больше не войти, новым — да.
    assert.equal((await login(email, "10.0.2.9")).status, 401);
    const fresh = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-Forwarded-For": "10.0.2.9",
      },
      body: JSON.stringify({ email, password: NEXT }),
    });
    assert.equal(fresh.status, 200);
  },
);

test("смена пароля: 5 неудач — пауза, как на входе", { skip: SKIP }, async () => {
  const a = await owner("pw-b@sklad.ru", "10.0.2.10");
  const NEXT = "другой-длинный-пароль";
  for (let i = 0; i < 5; i++) {
    const r = await changePassword(a, { password: `мимо-${i}-пароль`, next: NEXT }, "10.0.2.10");
    assert.equal(r.status, 403);
  }
  const locked = await changePassword(a, { password: PW, next: NEXT }, "10.0.2.10");
  assert.equal(locked.status, 429, "даже верный пароль ждёт окончания паузы");
  assert.equal((await call("/api/auth/me", a)).status, 200, "пароль не сменился");
});

/** Код последнего письма на адрес (письма уходят в фоне). */
async function lastCode(to) {
  for (let i = 0; i < 50; i++) {
    const m = sent.findLast((x) => x.to === to && /^\d{6}/.test(x.subject));
    if (m) return /^(\d{6})/.exec(m.subject)[1];
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`нет письма на ${to}`);
}

test(
  "смена почты: пароль, код на новый адрес, другие устройства выходят, старый адрес извещён",
  { skip: SKIP },
  async () => {
    const a = await owner("mail-a@sklad.ru", "10.0.2.20");
    const other = await login("mail-a@sklad.ru", "10.0.2.20");
    const ask = (body) => call("/api/auth/email/change", { ...a, body, ip: "10.0.2.20" });

    assert.equal((await ask({ email: "не почта", password: PW })).status, 400);
    assert.equal((await ask({ email: "new-a@sklad.ru", password: "не-тот-пароль-1" })).status, 403);
    assert.equal((await ask({ email: "MAIL-A@sklad.ru", password: PW })).json.error, "same_email");
    // Без сессии — никак.
    const anon = await call("/api/auth/email/change", {
      body: { email: "new-a@sklad.ru", password: PW },
      ip: "10.0.2.25",
    });
    assert.equal(anon.status, 401);

    assert.equal((await ask({ email: "New-A@sklad.ru", password: PW })).status, 202);
    const code = await lastCode("new-a@sklad.ru");
    // Пока код не введён — вход по старой почте.
    assert.equal((await login("mail-a@sklad.ru", "10.0.2.20")).status, 200);
    assert.equal((await login("new-a@sklad.ru", "10.0.2.20")).status, 401);

    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
    const bad = await call("/api/auth/email/confirm", {
      ...a,
      body: { code: wrong },
      ip: "10.0.2.26",
    });
    assert.equal(bad.status, 400);
    // Чужая сессия кодом этого аккаунта не воспользуется.
    const b = await owner("mail-b@sklad.ru", "10.0.2.21");
    const foreign = await call("/api/auth/email/confirm", {
      ...b,
      body: { code },
      ip: "10.0.2.27",
    });
    assert.equal(foreign.status, 400);

    const ok = await call("/api/auth/email/confirm", { ...a, body: { code }, ip: "10.0.2.26" });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.email, "new-a@sklad.ru");
    assert.equal((await call("/api/auth/me", a)).status, 200, "эта сессия осталась");
    assert.equal((await call("/api/auth/me", { cookie: other.cookie })).status, 401);
    assert.equal((await login("new-a@sklad.ru", "10.0.2.20")).status, 200);
    assert.equal((await login("mail-a@sklad.ru", "10.0.2.20")).status, 401);
    for (
      let i = 0;
      i < 50 && !sent.some((m) => m.to === "mail-a@sklad.ru" && /изменена/.test(m.subject));
      i++
    ) {
      await new Promise((r) => setTimeout(r, 10));
    }
    const notice = sent.find((m) => m.to === "mail-a@sklad.ru" && /изменена/.test(m.subject));
    assert.ok(notice && notice.text.includes("new-a@sklad.ru"), "старый адрес извещён");
    // Код одноразовый.
    assert.equal(
      (await call("/api/auth/email/confirm", { ...a, body: { code }, ip: "10.0.2.26" })).status,
      400,
    );

    // Занятый адрес: сразу при запросе — 409, без письма.
    const taken = await call("/api/auth/email/change", {
      ...b,
      body: { email: "new-a@sklad.ru", password: PW },
      ip: "10.0.2.21",
    });
    assert.equal(taken.status, 409);
  },
);

test(
  "смена почты: адрес заняли, пока шло письмо, — 409, почта прежняя",
  { skip: SKIP },
  async () => {
    const a = await owner("mail-c@sklad.ru", "10.0.2.22");
    const r = await call("/api/auth/email/change", {
      ...a,
      body: { email: "race@sklad.ru", password: PW },
      ip: "10.0.2.22",
    });
    assert.equal(r.status, 202);
    const code = await lastCode("race@sklad.ru");
    await owner("race@sklad.ru", "10.0.2.23");
    const res = await call("/api/auth/email/confirm", { ...a, body: { code }, ip: "10.0.2.26" });
    assert.equal(res.status, 409);
    assert.equal((await call("/api/auth/account", a)).json.email, "mail-c@sklad.ru");
  },
);

test("смена почты: не больше пяти писем в час", { skip: SKIP }, async () => {
  const a = await owner("mail-d@sklad.ru", "10.0.2.24");
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const r = await call("/api/auth/email/change", {
      ...a,
      body: { email: `spam${i}@sklad.ru`, password: PW },
      ip: "10.0.2.24",
    });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
});
