// Вход в кабинет на настоящем Postgres: HTTP-сервер, куки, функции схемы
// `auth`. Нужен PG_ADMIN_URL (суперпользователь для подготовки базы); без
// него тест пропускается — так обычные «Тесты сервера» его не требуют.
//
//   PG_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node --test server/api/test/auth.pg.test.mjs
/* global process, fetch, Buffer, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, helpers, server, base, cookieName;
// Письма входа не уходят наружу, а копятся здесь.
const sent = [];

before(async () => {
  if (SKIP) return;
  helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const cabinet = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
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
/** Последний код из письма на эту почту (письмо уходит в фоне — ждём). */
async function codeFor(email, kind = "подтверждения") {
  for (let i = 0; i < 50; i++) {
    const m = sent.findLast((x) => x.to === email && x.subject.includes(kind));
    if (m) return /^(\d{6})/.exec(m.subject)[1];
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`нет письма с кодом на ${email}`);
}
const letterCount = (email) => sent.filter((x) => x.to === email).length;
const settle = () => new Promise((r) => setTimeout(r, 30));

/** Регистрация целиком: форма → код из письма → вход. */
async function signup(body, ip = "10.0.0.1") {
  const r = await call("/api/auth/register", { body, ip });
  assert.equal(r.status, 202);
  const code = await codeFor(body.email);
  return call("/api/auth/verify", { body: { email: body.email, code }, ip });
}

const login = (email, ip, password = PW) =>
  call("/api/auth/login", { body: { email, password }, ip });

/** Владелец, два склада его компании и кладовщик без учётной записи. */
async function warehouseWithWorker(email, ip) {
  const r = await signup(owner(email), ip);
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
  const r = await signup(owner("a@sklad.ru"));
  assert.equal(r.status, 200);
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

test("регистрация без названия компании: компания зовётся почтой", { skip: SKIP }, async () => {
  const body = owner("noname@sklad.ru");
  delete body.company;
  const r = await signup(body, "10.0.0.40");
  assert.equal(r.status, 200);
  const me = await call("/api/auth/me", { cookie: r.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.orgs[0].name, "noname@sklad.ru");
  assert.equal(me.json.orgs[0].warehouse, true);
});

test("без согласия, с чужого сайта и формой — отказ", { skip: SKIP }, async () => {
  const ip = "10.0.0.2";
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
});

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
    await signup(owner("c@sklad.ru"), "10.2.0.9");
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
  const r = await signup(owner("h@seller.ru", "seller"), "10.6.0.1");
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

test("отключённая учётная запись и смена пароля гасят сессии сразу", { skip: SKIP }, async () => {
  const r = await signup(owner("k@sklad.ru"), "10.9.0.1");
  const second = await login("k@sklad.ru", "10.9.0.1");
  await db.root.query(
    `UPDATE auth.accounts SET password_hash = password_hash || 'x' WHERE email = 'k@sklad.ru'`,
  );
  assert.equal((await call("/api/auth/me", { cookie: r.token })).status, 401);
  assert.equal((await call("/api/auth/me", { cookie: second.token })).status, 401);

  const r2 = await signup(owner("l@sklad.ru"), "10.9.0.2");
  await db.root.query(`UPDATE auth.accounts SET disabled_at = now() WHERE email = 'l@sklad.ru'`);
  assert.equal((await call("/api/auth/me", { cookie: r2.token })).status, 401);
  assert.equal((await login("l@sklad.ru", "10.9.0.2")).status, 401);
});

test(
  "потерянный бейдж гасится без перевыпуска, удалённый склад не пускает",
  { skip: SKIP },
  async () => {
    const w = await warehouseWithWorker("m@sklad.ru", "10.10.0.1");
    const code = (await issue(w)).json.code;
    const s = await shift(code);
    const off = await call("/api/staff/badge/revoke", {
      body: { memberId: w.memberId },
      cookie: w.token,
      org: w.orgId,
    });
    assert.equal(off.status, 200);
    assert.equal((await call("/api/auth/me", { cookie: s.token })).status, 401);
    assert.equal((await shift(code)).status, 401);

    const code2 = (await issue(w)).json.code;
    const s2 = await shift(code2);
    await helpers.asOrg(db.pool, w.orgId, (c) =>
      c.query(`UPDATE uklad.warehouses SET deleted_at = now() WHERE id = $1`, [w.wh1]),
    );
    assert.equal((await call("/api/auth/me", { cookie: s2.token })).json.current, null);
    assert.equal((await shift(code2)).status, 401);
  },
);

test("склад не найден — app.warehouse_id пуст, а не «все склады»", { skip: SKIP }, async () => {
  const w = await warehouseWithWorker("n@sklad.ru", "10.11.0.1");
  const bogus = "00000000-0000-7000-8000-000000000000";
  const me = await call(`/api/auth/me?org=${w.orgId}&warehouse=${bogus}`, { cookie: w.token });
  assert.equal(me.json.current.orgId, w.orgId);
  assert.equal(me.json.current.warehouseId, null);
  // В самой транзакции значение пустое: политика, сравнивающая склад с ним,
  // не совпадёт ни с одной строкой.
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      `SELECT current_setting('app.warehouse_id', true) AS wh,
              (SELECT count(*)::int FROM uklad.warehouses
               WHERE id = nullif(current_setting('app.warehouse_id', true), '')::uuid) AS n
       FROM auth.resolve($1, $2, $3, '7 days'::interval)`,
      [Buffer.from(createHash("sha256").update(w.token).digest()), w.orgId, bogus],
    );
    assert.deepEqual(rows[0], { wh: "", n: 0 });
  } finally {
    await c.query("ROLLBACK");
    c.release();
  }
});

test("регистрация не даёт входа до кода, а занятую почту не выдаёт", { skip: SKIP }, async () => {
  const ip = "10.12.0.1";
  const fresh = await call("/api/auth/register", { body: owner("p@sklad.ru"), ip });
  assert.deepEqual([fresh.status, fresh.json, fresh.token], [202, { ok: true }, undefined]);
  // Пароль верный, но почта не подтверждена.
  assert.deepEqual((await login("p@sklad.ru", ip)).json, { ok: false, error: "email_unverified" });

  // Подтверждённая почта: тот же ответ сайта, письмо «вы уже с нами», вторая
  // компания не создаётся.
  const before = letterCount("a@sklad.ru");
  const taken = await call("/api/auth/register", { body: owner("a@sklad.ru"), ip });
  assert.deepEqual([taken.status, taken.json, taken.token], [202, { ok: true }, undefined]);
  await settle();
  assert.equal(letterCount("a@sklad.ru"), before + 1);
  assert.match(sent.at(-1).subject, /уже зарегистрированы/);
  const { rows } = await db.root.query(
    `SELECT count(*)::int AS n FROM uklad.members m JOIN auth.accounts a ON a.id = m.account_id
     WHERE a.email = 'a@sklad.ru'`,
  );
  assert.equal(rows[0].n, 1);
});

test(
  "код: пять ошибок сжигают его, новый гасит старый, верный впускает",
  { skip: SKIP },
  async () => {
    const ip = "10.13.0.1";
    await call("/api/auth/register", { body: owner("q@sklad.ru"), ip });
    const first = await codeFor("q@sklad.ru");
    const wrong = first === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const r = await call("/api/auth/verify", { body: { email: "q@sklad.ru", code: wrong }, ip });
      assert.deepEqual(r.json, { ok: false, error: "bad_code" });
    }
    // Попытки кончились — верный код уже не подходит.
    const late = await call("/api/auth/verify", { body: { email: "q@sklad.ru", code: first }, ip });
    assert.equal(late.status, 400);

    await call("/api/auth/resend", { body: { email: "q@sklad.ru" }, ip });
    const second = await codeFor("q@sklad.ru");
    const ok = await call("/api/auth/verify", { body: { email: "q@sklad.ru", code: second }, ip });
    assert.equal(ok.status, 200);
    assert.ok(ok.token && ok.json.orgId);
    // Использованный код второй раз не работает, вход по паролю открыт.
    const again = await call("/api/auth/verify", {
      body: { email: "q@sklad.ru", code: second },
      ip,
    });
    assert.equal(again.status, 400);
    assert.equal((await login("q@sklad.ru", ip)).status, 200);
    // В базе нет кода открытым текстом.
    const { rows } = await db.root.query(
      `SELECT encode(code_hash, 'hex') AS h FROM auth.email_codes`,
    );
    assert.ok(rows.every((r) => !r.h.includes(second)));
  },
);

test(
  "ответ на «пришлите код» один, есть почта или нет; писем не больше пяти в час",
  { skip: SKIP },
  async () => {
    const ip = "10.14.0.1";
    const none = await call("/api/auth/reset/request", { body: { email: "nobody@x.ru" }, ip });
    const real = await call("/api/auth/reset/request", {
      body: { email: "a@sklad.ru" },
      ip: "10.14.0.2",
    });
    assert.deepEqual([none.status, none.json], [real.status, real.json]);
    await settle();
    assert.equal(letterCount("nobody@x.ru"), 0);
    const before = letterCount("a@sklad.ru");
    for (let i = 0; i < 6; i++) {
      await call("/api/auth/reset/request", { body: { email: "a@sklad.ru" }, ip: `10.14.1.${i}` });
    }
    await settle();
    // Один код уже ушёл выше, ещё четыре — и лимит.
    assert.equal(letterCount("a@sklad.ru") - before, 4);
  },
);

test(
  "сброс пароля: слабый пароль код не тратит, новый гасит старые сессии",
  { skip: SKIP },
  async () => {
    const ip = "10.15.0.1";
    const r = await signup(owner("s@sklad.ru"), ip);
    await call("/api/auth/reset/request", { body: { email: "s@sklad.ru" }, ip });
    const code = await codeFor("s@sklad.ru", "нового пароля");
    const weak = await call("/api/auth/reset", {
      body: { email: "s@sklad.ru", code, password: "123" },
      ip,
    });
    assert.deepEqual(weak.json, { ok: false, error: "weak_password" });
    const NEW = "новый-длинный-пароль";
    const ok = await call("/api/auth/reset", {
      body: { email: "s@sklad.ru", code, password: NEW },
      ip,
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.token);
    assert.equal((await call("/api/auth/me", { cookie: r.token })).status, 401);
    assert.equal((await login("s@sklad.ru", ip)).status, 401);
    assert.equal((await login("s@sklad.ru", ip, NEW)).status, 200);
  },
);

test(
  "чужая неподтверждённая регистрация не достаётся владельцу почты",
  { skip: SKIP },
  async () => {
    const ip = "10.16.0.1";
    // Злоумышленник записал чужую почту со своим паролем и своей компанией.
    await call("/api/auth/register", { body: owner("victim@sklad.ru"), ip });
    // Владелец почты сбрасывает пароль кодом.
    await call("/api/auth/reset/request", { body: { email: "victim@sklad.ru" }, ip });
    const code = await codeFor("victim@sklad.ru", "нового пароля");
    const NEW = "мой-собственный-пароль";
    const r = await call("/api/auth/reset", {
      body: { email: "victim@sklad.ru", code, password: NEW },
      ip,
    });
    assert.equal(r.status, 200);
    const me = await call("/api/auth/me", { cookie: r.token });
    assert.deepEqual(me.json.orgs, []);
  },
);

test("регистрация без подтверждения за 7 дней освобождает почту", { skip: SKIP }, async () => {
  const ip = "10.17.0.1";
  await call("/api/auth/register", { body: owner("late@sklad.ru"), ip });
  await db.root.query(
    `UPDATE auth.accounts SET created_at = now() - interval '8 days' WHERE email = 'late@sklad.ru'`,
  );
  await db.root.query(`SELECT auth.purge()`);
  const { rows } = await db.root.query(
    `SELECT count(*)::int AS n FROM auth.accounts WHERE email = 'late@sklad.ru'`,
  );
  assert.equal(rows[0].n, 0);
  // Почта свободна: регистрация с кодом проходит заново.
  assert.equal((await signup(owner("late@sklad.ru"), ip)).status, 200);
});

test("20 неудачных кодов за сутки закрывают и верный код", { skip: SKIP }, async () => {
  const ip = "10.18.0.1";
  await call("/api/auth/register", { body: owner("brute@sklad.ru"), ip });
  await db.root.query(
    `UPDATE auth.email_codes SET attempts = 4 WHERE account_id =
       (SELECT id FROM auth.accounts WHERE email = 'brute@sklad.ru')`,
  );
  // Ещё четыре старых кода с попытками за сутки — всего 20.
  await db.root.query(
    `INSERT INTO auth.email_codes (account_id, purpose, code_hash, attempts, expires_at, used_at)
     SELECT id, 'verify', '\\x00', 4, now(), now()
     FROM auth.accounts, generate_series(1, 4) WHERE email = 'brute@sklad.ru'`,
  );
  await call("/api/auth/resend", { body: { email: "brute@sklad.ru" }, ip });
  const code = await codeFor("brute@sklad.ru");
  const r = await call("/api/auth/verify", { body: { email: "brute@sklad.ru", code }, ip });
  assert.equal(r.status, 400);
});
