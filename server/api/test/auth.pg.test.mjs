// Вход в кабинет на настоящем Postgres: HTTP-сервер, куки, функции схемы
// `auth`. Нужен PG_ADMIN_URL (суперпользователь для подготовки базы); без
// него тест пропускается — так обычные «Тесты сервера» его не требуют.
//
//   PG_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node --test server/api/test/auth.pg.test.mjs
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

before(async () => {
  if (SKIP) return;
  helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const cabinet = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet });
  cookieName = cabinet.cookieName;
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
});

after(async () => {
  if (SKIP) return;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.teardown();
});

/** Запрос с нашего сайта; `ip` — адрес клиента за прокси. */
async function call(path, { body, cookie, ip = "10.0.0.1", org, warehouse, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
      ...(warehouse ? { "X-Uklad-Warehouse": warehouse } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie") ?? "";
  const token = new RegExp(`${cookieName}=([^;]*)`).exec(set)?.[1];
  return { status: res.status, json: await res.json().catch(() => null), token, set };
}

const owner = (email, kind = "warehouse") => ({
  email,
  password: PW,
  company: `Компания ${email}`,
  kind,
  name: "Кирилл",
  consent: true,
});
const login = (email, ip, password = PW) =>
  call("/api/auth/login", { body: { email, password }, ip });

/** Владелец, два склада его компании и кладовщик без учётной записи. */
async function warehouseWithWorker(email, ip) {
  const r = await call("/api/auth/register", { body: owner(email), ip });
  const ids = await helpers.asOrg(db.pool, r.json.orgId, async (c) => {
    const one = async (sql, args) => (await c.query(sql, args)).rows[0].id;
    const role = await one(`SELECT id FROM uklad.roles WHERE name = 'Кладовщик'`);
    return {
      memberId: await one(
        `INSERT INTO uklad.members (org_id, role_id, display_name) VALUES ($1, $2, 'Иван') RETURNING id`,
        [r.json.orgId, role],
      ),
      wh1: await one(
        `INSERT INTO uklad.warehouses (org_id, name) VALUES ($1, 'Мезонин') RETURNING id`,
        [r.json.orgId],
      ),
      wh2: await one(
        `INSERT INTO uklad.warehouses (org_id, name) VALUES ($1, 'Второй склад') RETURNING id`,
        [r.json.orgId],
      ),
    };
  });
  return { orgId: r.json.orgId, token: r.token, ...ids };
}

const issue = (w, memberId = w.memberId, warehouseId = w.wh1, org = w.orgId) =>
  call("/api/staff/badge", { body: { memberId, warehouseId }, cookie: w.token, org });
const shift = (code) => call("/api/auth/badge", { body: { code } });

test("регистрация создаёт компанию и владельца, кука закрытая", { skip: SKIP }, async () => {
  const r = await call("/api/auth/register", { body: owner("a@sklad.ru") });
  assert.equal(r.status, 201);
  assert.match(r.set, /HttpOnly/);
  assert.match(r.set, /Secure/);
  assert.match(r.set, /SameSite=Lax/);
  assert.ok(cookieName.startsWith("__Host-"));

  const me = await call(`/api/auth/me?org=${r.json.orgId}`, { cookie: r.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.kind, "password");
  assert.equal(me.json.orgs.length, 1);
  assert.equal(me.json.orgs[0].role, "Владелец");
  assert.equal(me.json.current.orgId, r.json.orgId);
  assert.ok(me.json.current.permissions.includes("staff.manage"));

  // В базе — только хэш токена.
  const { rows } = await db.root.query(
    `SELECT encode(token_hash, 'escape') AS h FROM auth.sessions`,
  );
  assert.ok(rows.every((s) => !s.h.includes(r.token)));
});

test(
  "повторная почта — 409; без согласия, с чужого сайта и формой — отказ",
  { skip: SKIP },
  async () => {
    const ip = "10.0.0.2";
    assert.equal((await call("/api/auth/register", { body: owner("a@sklad.ru"), ip })).status, 409);
    const noConsent = { ...owner("b@sklad.ru"), consent: false };
    assert.equal((await call("/api/auth/register", { body: noConsent, ip })).status, 400);
    const short = { ...owner("b@sklad.ru"), password: "123" };
    assert.equal((await call("/api/auth/register", { body: short, ip })).status, 400);
    const foreign = await call("/api/auth/register", {
      body: owner("b@sklad.ru"),
      headers: { Origin: "https://evil.example" },
    });
    assert.equal(foreign.status, 403);
    const form = await call("/api/auth/register", {
      body: owner("b@sklad.ru"),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    assert.equal(form.status, 415);
  },
);

test(
  "вход: неверный пароль и нет почты — один ответ; верный — сессия",
  { skip: SKIP },
  async () => {
    const bad = await login("a@sklad.ru", "10.1.0.1", "не-тот-пароль");
    const none = await login("nobody@sklad.ru", "10.1.0.1", "не-тот-пароль");
    assert.deepEqual([bad.status, bad.json], [401, { ok: false, error: "bad_credentials" }]);
    assert.deepEqual([none.status, none.json], [401, { ok: false, error: "bad_credentials" }]);
    const ok = await login("A@Sklad.ru ", "10.1.0.1");
    assert.equal(ok.status, 200);
    assert.ok(ok.token);
  },
);

test(
  "5 ошибок закрывают вход этой почте с этого адреса, но не всей смене",
  { skip: SKIP },
  async () => {
    await call("/api/auth/register", { body: owner("c@sklad.ru"), ip: "10.2.0.9" });
    const ip = "10.2.0.1";
    for (let i = 0; i < 5; i++) await login("c@sklad.ru", ip, "опечатка-опечатка");
    assert.equal((await login("c@sklad.ru", ip)).status, 429);
    // Коллега с того же адреса входит.
    assert.equal((await login("a@sklad.ru", ip)).status, 200);
    // И сам человек — с другого адреса.
    assert.equal((await login("c@sklad.ru", "10.2.0.2")).status, 200);
  },
);

test("бейдж: выпуск, вход на смену, перевыпуск гасит старый", { skip: SKIP }, async () => {
  const w = await warehouseWithWorker("d@sklad.ru", "10.3.0.1");
  const issued = await issue(w);
  assert.equal(issued.status, 200);
  assert.match(issued.json.code, /^UKB-[A-Za-z0-9_-]{22}$/);

  const s = await shift(issued.json.code);
  assert.equal(s.status, 200);
  assert.equal(s.json.warehouseId, w.wh1);
  assert.match(s.set, /Max-Age=43200/);
  const me = await call("/api/auth/me", { cookie: s.token });
  assert.equal(me.json.kind, "badge");
  assert.equal(me.json.current.memberId, w.memberId);
  assert.equal(me.json.current.warehouseId, w.wh1);
  assert.ok(!me.json.current.permissions.includes("staff.manage"));
  // Кладовщик не выпускает бейджи.
  const self = await call("/api/staff/badge", {
    body: { memberId: w.memberId, warehouseId: w.wh1 },
    cookie: s.token,
  });
  assert.equal(self.status, 403);

  const again = await issue(w);
  assert.equal((await shift(issued.json.code)).status, 401);
  assert.equal((await call("/api/auth/me", { cookie: s.token })).status, 401);
  assert.equal((await shift(again.json.code)).status, 200);
  // Подобранный код не подходит.
  assert.equal((await shift("UKB-AAAAAAAAAAAAAAAAAAAAAA")).status, 401);
});

test(
  "бейдж открывает только свой склад: ни другой склад компании, ни чужую компанию",
  { skip: SKIP },
  async () => {
    const w = await warehouseWithWorker("i@sklad.ru", "10.8.0.1");
    const other = await warehouseWithWorker("j@sklad.ru", "10.8.0.2");
    const s = await shift((await issue(w)).json.code);
    // Свой склад — да.
    const mine = await call(`/api/auth/me?warehouse=${w.wh1}`, { cookie: s.token });
    assert.equal(mine.json.current.warehouseId, w.wh1);
    // Второй склад той же компании — нет.
    const second = await call(`/api/auth/me?warehouse=${w.wh2}`, { cookie: s.token });
    assert.equal(second.json.current, null);
    // Чужая компания и её склад — нет.
    const foreignOrg = await call(`/api/auth/me?org=${other.orgId}&warehouse=${other.wh1}`, {
      cookie: s.token,
    });
    assert.equal(foreignOrg.json.current, null);
    // Рабочий запрос с заголовком другого склада не проходит.
    const sneaky = await call("/api/staff/badge", {
      body: { memberId: w.memberId, warehouseId: w.wh1 },
      cookie: s.token,
      warehouse: w.wh2,
    });
    assert.equal(sneaky.status, 401);
    // Бейдж на склад чужой компании не выпустить.
    assert.equal((await issue(w, w.memberId, other.wh1)).status, 404);
  },
);

test("отключённый сотрудник по бейджу не входит", { skip: SKIP }, async () => {
  const w = await warehouseWithWorker("e@sklad.ru", "10.4.0.1");
  const { json } = await issue(w);
  await helpers.asOrg(db.pool, w.orgId, (c) =>
    c.query(`UPDATE uklad.members SET status = 'disabled' WHERE id = $1`, [w.memberId]),
  );
  assert.equal((await shift(json.code)).status, 401);
});

test("чужая компания: ни бейдж её сотруднику, ни вход в неё", { skip: SKIP }, async () => {
  const a = await warehouseWithWorker("f@sklad.ru", "10.5.0.1");
  const b = await warehouseWithWorker("g@sklad.ru", "10.5.0.2");
  // Владелец A просит бейдж сотруднику B — для A его нет.
  assert.equal((await issue(a, b.memberId, a.wh1)).status, 404);
  // И подставить компанию B в заголовок не выйдет: членства нет.
  assert.equal((await issue(a, b.memberId, b.wh1, b.orgId)).status, 401);
  const me = await call(`/api/auth/me?org=${b.orgId}`, { cookie: a.token });
  assert.equal(me.json.current, null);
  assert.deepEqual(
    me.json.orgs.map((o) => o.id),
    [a.orgId],
  );
});

test("селлер получает свои роли, а не складские", { skip: SKIP }, async () => {
  const r = await call("/api/auth/register", {
    body: owner("h@seller.ru", "seller"),
    ip: "10.6.0.1",
  });
  const me = await call(`/api/auth/me?org=${r.json.orgId}`, { cookie: r.token });
  assert.equal(me.json.orgs[0].seller, true);
  assert.equal(me.json.orgs[0].warehouse, false);
  const { rows } = await db.root.query(
    `SELECT name FROM uklad.roles WHERE org_id = $1 ORDER BY name`,
    [r.json.orgId],
  );
  assert.deepEqual(
    rows.map((x) => x.name),
    ["Владелец", "Менеджер селлера"],
  );
});

test("выход гасит сессию на сервере, а не только куку", { skip: SKIP }, async () => {
  const r = await login("a@sklad.ru", "10.7.0.1");
  const out = await call("/api/auth/logout", { body: {}, cookie: r.token });
  assert.match(out.set, /Max-Age=0/);
  assert.equal((await call("/api/auth/me", { cookie: r.token })).status, 401);
});

test("без сессии и с мусорной кукой — 401", { skip: SKIP }, async () => {
  assert.equal((await call("/api/auth/me")).status, 401);
  assert.equal((await call("/api/auth/me", { cookie: "x".repeat(43) })).status, 401);
});
