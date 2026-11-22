// Снимок кабинета на сервере (ADR 0010): своя компания пишет и читает,
// чужая не видит; устаревшая версия — 409, а не молчаливое затирание.
/* global process, fetch, setTimeout, URL */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";
import { readFileSync } from "node:fs";

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
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) || (await snapshot.handle(req, res, url)),
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

/** Сколько записей в списке по оглавлению (миграция 056); `null` — не строками. */
async function slot(org, place, domain) {
  const { rows } = await db.root.query(
    `SELECT n FROM uklad.cabinet_slots WHERE org_id = $1 AND place = $2 AND domain = $3`,
    [org, place, domain],
  );
  return rows[0]?.n ?? null;
}

/** Удалённые товары компании — «вчера»: журнал каталога пишется под её RLS. */
async function backdateDeleted(org) {
  assert.match(org, /^[0-9a-f-]{36}$/);
  await db.root.query(
    `BEGIN;
     SELECT set_config('app.org_id', '${org}', true);
     UPDATE uklad.products SET deleted_at = deleted_at - interval '2 days'
     WHERE org_id = '${org}' AND deleted_at IS NOT NULL;
     COMMIT;`,
  );
}

/** Товары компании заведены «позавчера»: свежие защита каталога не считает. */
async function backdateCreated(org) {
  assert.match(org, /^[0-9a-f-]{36}$/);
  await db.root.query(
    `BEGIN;
     SELECT set_config('app.org_id', '${org}', true);
     UPDATE uklad.products SET created_at = created_at - interval '3 days'
     WHERE org_id = '${org}';
     COMMIT;`,
  );
}

async function call(path, { body, raw, cookie, org, ip = "10.0.1.1" } = {}) {
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

const data = (mark) => ({ warehouse: { id: "wh_1", name: mark }, mark, products: [] });

test("снимок: первая запись, чтение, версия растёт, устаревшая — 409", { skip: SKIP }, async () => {
  const a = await owner("snap-a@sklad.ru", "10.0.1.2");
  const empty = await call("/api/cabinet/snapshot", a);
  assert.equal(empty.status, 200);
  assert.equal(empty.json.snapshot, null);

  const first = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: data("А1") },
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.version, 1);

  const twice = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: data("А?") },
  });
  assert.equal(twice.status, 409);
  assert.equal(twice.json.version, 1);

  const second = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 1, format: 8, data: data("А2") },
  });
  assert.equal(second.json.version, 2);

  // Второе устройство с устаревшей версией не затирает правку.
  const stale = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 1, format: 8, data: data("старое") },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.version, 2);

  const read = await call("/api/cabinet/snapshot", a);
  assert.equal(read.json.snapshot.version, 2);
  assert.equal(read.json.snapshot.format, 8);
  assert.equal(read.json.snapshot.data.warehouse.name, "А2");
  const { rows } = await db.root.query(
    `SELECT previous->>'mark' AS prev FROM uklad.cabinet_snapshots WHERE org_id = $1`,
    [a.org],
  );
  assert.equal(rows[0].prev, "А1");
});

test("чужая компания снимок не видит и не пишет", { skip: SKIP }, async () => {
  const a = await owner("snap-c@sklad.ru", "10.0.1.3");
  const b = await owner("snap-d@sklad.ru", "10.0.1.4");
  await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: data("секрет") },
  });
  // Б просит компанию А заголовком — база не пускает: членства нет.
  const peek = await call("/api/cabinet/snapshot", { cookie: b.cookie, org: a.org });
  assert.equal(peek.status, 401);
  const write = await call("/api/cabinet/snapshot", {
    cookie: b.cookie,
    org: a.org,
    body: { version: 1, format: 8, data: data("взлом") },
  });
  assert.equal(write.status, 401);
  // Своя компания Б пуста.
  assert.equal((await call("/api/cabinet/snapshot", b)).json.snapshot, null);
  const read = await call("/api/cabinet/snapshot", a);
  assert.equal(read.json.snapshot.data.warehouse.name, "секрет");
});

test("без сессии, без компании, не объект и слишком большой — отказ", { skip: SKIP }, async () => {
  const a = await owner("snap-e@sklad.ru", "10.0.1.5");
  assert.equal((await call("/api/cabinet/snapshot")).status, 401);
  assert.equal((await call("/api/cabinet/snapshot", { cookie: a.cookie })).status, 401);
  const arr = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data: [] },
  });
  assert.equal(arr.status, 400);
  const big = JSON.stringify({ version: 0, format: 8, data: { x: "я".repeat(5 * 1024 * 1024) } });
  assert.equal((await call("/api/cabinet/snapshot", { ...a, raw: big })).status, 413);
});

test(
  "снимок пишет только руководитель: бейдж — 403, роль без staff.manage — только просмотр",
  { skip: SKIP },
  async () => {
    const helpers = await import("../../db/test/helpers.js");
    const a = await owner("snap-f@sklad.ru", "10.0.1.6");
    await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 0, format: 8, data: data("ставки") },
    });
    const ids = await helpers.asOrg(db.pool, a.org, async (c) => {
      const one = async (sql, args) => (await c.query(sql, args)).rows[0].id;
      const role = await one(`SELECT id FROM uklad.roles WHERE name = 'Упаковщик'`);
      return {
        memberId: await one(
          `INSERT INTO uklad.members (org_id, role_id, display_name) VALUES ($1, $2, 'Иван') RETURNING id`,
          [a.org, role],
        ),
        warehouseId: await one(
          `INSERT INTO uklad.warehouses (org_id, name) VALUES ($1, 'Мезонин') RETURNING id`,
          [a.org],
        ),
      };
    });
    const issued = await call("/api/staff/badge", { ...a, body: ids });
    assert.equal(issued.status, 200);
    const shift = await fetch(base + "/api/auth/badge", {
      method: "POST",
      headers: {
        Origin: ORIGIN,
        "Content-Type": "application/json",
        "X-Forwarded-For": "10.0.1.7",
      },
      body: JSON.stringify({ code: issued.json.code }),
    });
    const badge = new RegExp(`${cookieName}=([^;]*)`).exec(shift.headers.get("set-cookie"))[1];
    assert.equal((await call("/api/cabinet/snapshot", { cookie: badge })).status, 403);
    // Сутки хранения — основа денег продавцу: столу их не отдаём.
    assert.equal(
      (
        await call("/api/cabinet/storage?from=2026-11-01&to=2026-11-15&warehouse=wh_1", {
          cookie: badge,
        })
      ).status,
      403,
    );
    const write = await call("/api/cabinet/snapshot", {
      cookie: badge,
      body: { version: 1, format: 8, data: data("упаковщик") },
    });
    assert.equal(write.status, 403);

    // Вход паролем, но в роли без права на персонал — только просмотр (без
    // ставок), запись — нет.
    await db.root.query(
      `UPDATE uklad.roles
       SET permissions = array_remove(array_remove(permissions, 'staff.manage'), 'seller.requests')
     WHERE org_id = $1 AND name = 'Владелец'`,
      [a.org],
    );
    const viewed = await call("/api/cabinet/snapshot", a);
    assert.equal(viewed.status, 200);
    assert.equal(viewed.json.snapshot.viewer, true);
    // Смотрящий (роль без «Персонала») ставок не видит — и суток хранения тоже.
    assert.equal(
      (await call("/api/cabinet/storage?from=2026-11-01&to=2026-11-15&warehouse=wh_1", a)).status,
      403,
    );
    const noWrite = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: viewed.json.snapshot.version, format: 8, data: data("чужое") },
    });
    assert.equal(noWrite.status, 403);
    await db.root.query(
      `UPDATE uklad.roles
       SET permissions = permissions || ARRAY['staff.manage', 'seller.requests']
     WHERE org_id = $1 AND name = 'Владелец'`,
      [a.org],
    );
    const read = await call("/api/cabinet/snapshot", a);
    assert.equal(read.json.snapshot.data.warehouse.name, "ставки");
  },
);

test(
  "товары живут в таблице: туда и обратно без потерь, корзина, журнал, чужие не видны",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-p@sklad.ru", "10.0.1.8");
    const b = await owner("snap-q@sklad.ru", "10.0.1.9");
    const cup = {
      id: "p-cup",
      sku: "CUP-1",
      barcode: "4600000000017",
      name: "Кружка",
      category: "Посуда",
      widthCm: 9,
      heightCm: 10.5,
      depthCm: 9,
      partnerId: "prt-1",
      warehouseId: "wh_1",
      // Поле, которого нет в колонках, и поле не того типа — не теряются.
      color: "синий",
      weightKg: "0,4",
    };
    const tee = { id: "p-tee", sku: "", name: "Футболка", category: "Одежда", widthCm: 30 };
    const snap = (products, version, mark = "склад") => ({
      ...a,
      body: { version, format: 8, data: { ...data(mark), products } },
    });

    assert.equal((await call("/api/cabinet/snapshot", snap([cup, tee], 0))).status, 200);
    // Список не того вида — отказ, а не тихая потеря товаров.
    const bad = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data: { ...data("x"), products: { cup } } },
    });
    assert.equal(bad.status, 400);

    const stored = await db.root.query(
      `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.equal(stored.rows[0].data.products, undefined);
    const read = await call("/api/cabinet/snapshot", a);
    assert.deepEqual(read.json.snapshot.data.products, [cup, tee]);

    // Правка одной карточки трогает одну строку; пропавшая — в корзину.
    const log = async () =>
      (
        await db.root.query(`SELECT count(*)::int AS n FROM uklad.stock_log WHERE org_id = $1`, [
          a.org,
        ])
      ).rows[0].n;
    const before = await log();
    const renamed = { ...cup, name: "Кружка большая" };
    assert.equal((await call("/api/cabinet/snapshot", snap([renamed, tee], 1))).status, 200);
    assert.equal(await log(), before + 1);
    assert.equal((await call("/api/cabinet/snapshot", snap([tee], 2))).status, 200);
    const gone = await db.root.query(
      `SELECT name, deleted_at FROM uklad.products WHERE org_id = $1 AND ref = 'p-cup'`,
      [a.org],
    );
    assert.equal(gone.rows[0].name, "Кружка большая");
    assert.ok(gone.rows[0].deleted_at);
    assert.deepEqual((await call("/api/cabinet/snapshot", a)).json.snapshot.data.products, [tee]);

    // Устаревшая версия не трогает и товары.
    assert.equal((await call("/api/cabinet/snapshot", snap([], 1))).status, 409);
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.products.length, 1);

    // Вернулся — из корзины та же строка, а не вторая.
    assert.equal((await call("/api/cabinet/snapshot", snap([renamed, tee], 3))).status, 200);
    const rows = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.products WHERE org_id = $1 AND ref = 'p-cup'`,
      [a.org],
    );
    assert.equal(rows.rows[0].n, 1);

    // Чужая компания своих товаров не видит, а тот же id у неё — своя строка.
    const other = await call("/api/cabinet/snapshot", {
      ...b,
      body: {
        version: 0,
        format: 8,
        data: { ...data("чужой"), products: [{ ...cup, name: "Их" }] },
      },
    });
    assert.equal(other.status, 200);
    const theirs = (await call("/api/cabinet/snapshot", b)).json.snapshot.data.products;
    assert.deepEqual(
      theirs.map((p) => p.name),
      ["Их"],
    );
    const mine = (await call("/api/cabinet/snapshot", a)).json.snapshot.data.products;
    assert.deepEqual(
      mine.map((p) => p.name),
      ["Кружка большая", "Футболка"],
    );
  },
);

test(
  "пустой список не уносит каталог в корзину: больше половины разом — 409",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-r@sklad.ru", "10.0.1.12");
    const cards = Array.from({ length: 20 }, (_, i) => ({
      id: `p${i}`,
      sku: `S${i}`,
      name: `Т${i}`,
    }));
    const save = (version, products) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: { version, format: 8, data: { ...data("склад"), products } },
      });
    assert.equal((await save(0, cards)).status, 200);
    await backdateCreated(a.org);
    // Сбой клиента: стор пустой — сервер не принимает и снимок не двигает.
    const wiped = await save(1, []);
    assert.equal(wiped.status, 409);
    assert.equal(wiped.json.error, "products_mass_delete");
    assert.equal(wiped.json.version, 1);
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.products.length, 20);
    // Половина — можно: человек удаляет частями.
    assert.equal((await save(1, cards.slice(10))).status, 200);
    // Ещё девять в тот же день — нет: за сутки ушла бы почти весь каталог
    // (так его стирали бы по девять за запись).
    const parts = await save(2, cards.slice(19));
    assert.equal(parts.status, 409);
    assert.equal(parts.json.error, "products_mass_delete");
    // Назавтра — можно, а последний — как обычно.
    const dayLater = () => backdateDeleted(a.org);
    await dayLater();
    assert.equal((await save(2, cards.slice(15))).status, 200);
    await dayLater();
    assert.equal((await save(3, cards.slice(19))).status, 200);
    await dayLater();
    assert.equal((await save(4, [])).status, 200);
    assert.deepEqual((await call("/api/cabinet/snapshot", a)).json.snapshot.data.products, []);
  },
);

test(
  "каталог не стирается целиком и маленьким: пять товаров разом или за сутки — 409",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-s@sklad.ru", "10.0.1.13");
    const cards = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      sku: `S${i}`,
      name: `Т${i}`,
    }));
    const save = (version, products) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: { version, format: 8, data: { ...data("склад"), products } },
      });
    assert.equal((await save(0, cards)).status, 200);
    await backdateCreated(a.org);
    const wiped = await save(1, []);
    assert.equal(wiped.status, 409);
    assert.equal(wiped.json.error, "products_mass_delete");
    assert.equal((await save(1, cards.slice(3))).status, 200);
    // Остаток в тот же день — нет, назавтра — да.
    assert.equal((await save(2, [])).status, 409);
    await backdateDeleted(a.org);
    assert.equal((await save(2, [])).status, 200);
  },
);

test(
  "свежие товары базу не раздувают: завёл 1000 пустышек — 100 старых всё равно не стереть",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-pad@sklad.ru", "10.0.1.31");
    const card = (p, i) => ({ id: `${p}${i}`, sku: `${p.toUpperCase()}${i}`, name: `${p}${i}` });
    const real = Array.from({ length: 100 }, (_, i) => card("p", i));
    const junk = Array.from({ length: 1000 }, (_, i) => card("j", i));
    const save = (version, products) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: { version, format: 8, data: { ...data("склад"), products } },
      });
    assert.equal((await save(0, real)).status, 200);
    await backdateCreated(a.org);
    assert.equal((await save(1, [...real, ...junk])).status, 200);
    const wipe = await save(2, junk);
    assert.equal(wipe.status, 409);
    assert.equal(wipe.json.error, "products_mass_delete");
    // Свежезаведённое (ошибка импорта) удаляется свободно.
    assert.equal((await save(2, real)).status, 200);
  },
);

test(
  "журнал движений: что где прибыло и убыло, кто записал, чужим не видно",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-m@sklad.ru", "10.0.1.10");
    const b = await owner("snap-n@sklad.ru", "10.0.1.11");
    const work = (lines, outbound) => ({
      ...data("склад"),
      boxes: [{ id: "t1", barcode: "UK-BOX-1", lines }],
      outboundBoxes: outbound,
    });
    const save = (who, version, d) =>
      call("/api/cabinet/snapshot", { ...who, body: { version, format: 8, data: d } });
    assert.equal((await save(a, 0, work([{ productId: "p1", qty: 3 }], []))).status, 200);
    const packed = work(
      [{ productId: "p1", qty: 1 }],
      [{ id: "o1", code: "UK-OUT-1", lines: [{ productId: "p1", qty: 2 }] }],
    );
    assert.equal((await save(a, 1, packed)).status, 200);
    // Та же запись ещё раз — движений нет.
    assert.equal((await save(a, 2, packed)).status, 200);
    // Устаревшая версия — ни снимка, ни движений.
    assert.equal((await save(a, 1, work([], []))).status, 409);
    assert.equal((await save(b, 0, work([{ productId: "p1", qty: 9 }], []))).status, 200);

    const { rows } = await db.root.query(
      `SELECT place_kind, place_ref, product_ref, delta, snapshot_version,
            member_id IS NOT NULL AS signed
     FROM uklad.stock_moves WHERE org_id = $1 ORDER BY snapshot_version, place_kind`,
      [a.org],
    );
    assert.deepEqual(rows, [
      {
        place_kind: "box",
        place_ref: "t1",
        product_ref: "p1",
        delta: 3,
        snapshot_version: 1,
        signed: true,
      },
      {
        place_kind: "box",
        place_ref: "t1",
        product_ref: "p1",
        delta: -2,
        snapshot_version: 2,
        signed: true,
      },
      {
        place_kind: "outbound",
        place_ref: "o1",
        product_ref: "p1",
        delta: 2,
        snapshot_version: 2,
        signed: true,
      },
    ]);
    // Приложение журнал только читает и дописывает, и только свой.
    const app = await db.pool.connect();
    try {
      await app.query("BEGIN");
      await app.query(`SELECT set_config('app.org_id', $1, true)`, [b.org]);
      const seen = await app.query(`SELECT delta FROM uklad.stock_moves`);
      assert.deepEqual(seen.rows, [{ delta: 9 }]);
      await assert.rejects(
        app.query(`UPDATE uklad.stock_moves SET delta = 1`),
        /permission denied/,
      );
      await app.query("ROLLBACK");
    } finally {
      app.release();
    }
  },
);

test(
  "работа склада живёт строками: туда и обратно без потерь, корзина, чужие не видны",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-w@sklad.ru", "10.0.1.20");
    const b = await owner("snap-x@sklad.ru", "10.0.1.21");
    const work = (requests, staffEvents, version) => ({
      ...a,
      body: {
        version,
        format: 8,
        data: {
          ...data("склад"),
          requests,
          staffEvents,
          boxes: [],
          warehouseData: { wh_2: { requests: [{ id: "r9", qty: 9 }] } },
        },
      },
    });
    const r1 = { id: "r1", qty: 1, to: "Коледино" };
    const r2 = { id: "r2", qty: 2, to: "Электросталь" };
    const s1 = { id: "s1", type: "shift_start", at: 1 };
    assert.equal((await call("/api/cabinet/snapshot", work([r2, r1], [s1], 0))).status, 200);

    // Записи — строками, оглавление — строками (миграция 056): в документе
    // ни списков, ни меток: у второго склада — пустая стопка.
    const stored = await db.root.query(
      `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.ok(!JSON.stringify(stored.rows[0].data).includes("$rows"));
    assert.ok(!("requests" in stored.rows[0].data));
    assert.deepEqual(stored.rows[0].data.warehouseData, { wh_2: {} });
    assert.equal(await slot(a.org, "", "requests"), 2);
    assert.equal(await slot(a.org, "wh_2", "requests"), 1);
    const rows = async () =>
      (
        await db.root.query(
          `SELECT warehouse_ref || '/' || domain || '/' || ref AS k, deleted_at IS NOT NULL AS gone
           FROM uklad.cabinet_records WHERE org_id = $1 ORDER BY 1`,
          [a.org],
        )
      ).rows;
    assert.deepEqual(
      (await rows()).map((r) => r.k),
      ["/staffEvents/s1", "wh_1/requests/r1", "wh_1/requests/r2", "wh_2/requests/r9"],
    );
    const read = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual(read.requests, [r2, r1]);
    assert.deepEqual(read.boxes, []);
    assert.deepEqual(read.staffEvents, [s1]);
    assert.deepEqual(read.warehouseData, { wh_2: { requests: [{ id: "r9", qty: 9 }] } });

    // Новая заявка сверху переписывает одну строку, а не все.
    const touched = async () =>
      (
        await db.root.query(
          `SELECT ref FROM uklad.cabinet_records WHERE org_id = $1 AND updated_at > $2 ORDER BY ref`,
          [a.org, since],
        )
      ).rows.map((r) => r.ref);
    const since = (await db.root.query(`SELECT now() AS t`)).rows[0].t;
    const r3 = { id: "r3", qty: 3 };
    assert.equal((await call("/api/cabinet/snapshot", work([r3, r2, r1], [s1], 1))).status, 200);
    assert.deepEqual(await touched(), ["r3"]);

    // Пропавшая — в корзину, вернувшаяся — из неё той же строкой.
    assert.equal((await call("/api/cabinet/snapshot", work([r3, r1], [s1], 2))).status, 200);
    assert.deepEqual(
      (await rows()).filter((r) => r.gone).map((r) => r.k),
      ["wh_1/requests/r2"],
    );
    assert.deepEqual((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests, [
      r3,
      r1,
    ]);
    assert.equal((await call("/api/cabinet/snapshot", work([r3, r2, r1], [s1], 3))).status, 200);
    assert.equal((await rows()).filter((r) => r.gone).length, 0);

    // Устаревшая версия строк не трогает.
    assert.equal((await call("/api/cabinet/snapshot", work([], [], 1))).status, 409);
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 3);

    // Метки снаружи — не кабинет: отказ.
    const marks = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 4, format: 8, data: { ...data("x"), requests: { $rows: 0 } } },
    });
    assert.equal(marks.status, 400);

    // Чужая компания с тем же id — своя строка, мои записи ей не видны.
    const other = await call("/api/cabinet/snapshot", {
      ...b,
      body: { version: 0, format: 8, data: { ...data("чужой"), requests: [{ id: "r1" }] } },
    });
    assert.equal(other.status, 200);
    assert.deepEqual((await call("/api/cabinet/snapshot", b)).json.snapshot.data.requests, [
      { id: "r1" },
    ]);
  },
);

test(
  "старый документ без меток читается как был и раскладывается при записи",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-y@sklad.ru", "10.0.1.22");
    assert.equal(
      (
        await call("/api/cabinet/snapshot", {
          ...a,
          body: { version: 0, format: 8, data: data("x") },
        })
      ).status,
      200,
    );
    // Документ, записанный до миграции 021: заявки прямо в нём.
    await db.root.query(
      `UPDATE uklad.cabinet_snapshots SET data = data || '{"requests":[{"id":"old"}]}'::jsonb
     WHERE org_id = $1`,
      [a.org],
    );
    const read = (await call("/api/cabinet/snapshot", a)).json.snapshot;
    assert.deepEqual(read.data.requests, [{ id: "old" }]);
    assert.equal(
      (
        await call("/api/cabinet/snapshot", {
          ...a,
          body: { version: read.version, format: 8, data: read.data },
        })
      ).status,
      200,
    );
    const stored = await db.root.query(
      `SELECT data->'requests' AS r FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.equal(stored.rows[0].r, null);
    assert.equal(await slot(a.org, "", "requests"), 1);
    assert.deepEqual((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests, [
      { id: "old" },
    ]);
  },
);

test(
  "пустой список не уносит работу склада в корзину: больше половины разом — 409",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-z@sklad.ru", "10.0.1.23");
    const reqs = ["r1", "r2", "r3", "r4"].map((id) => ({ id }));
    const write = (requests, version) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: { version, format: 8, data: { ...data("x"), requests } },
      });
    assert.equal((await write(reqs, 0)).status, 200);
    // Пустой стор после сбоя: отказ, строки целы.
    const wiped = await write([], 1);
    assert.equal(wiped.status, 409);
    assert.equal(wiped.json.error, "records_mass_delete");
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 4);
    // Одну-две за раз — обычная работа.
    assert.equal((await write(reqs.slice(1), 1)).status, 200);
    assert.equal((await write(reqs.slice(2), 2)).status, 200);
    // Две последние — меньше трёх, удаляются.
    assert.equal((await write([], 3)).status, 200);
    assert.deepEqual((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests, []);
  },
);

test(
  "только изменённое: строки поверх версии, расхождение — diverged, без записи",
  { skip: SKIP },
  async () => {
    const { splitRecords } = require("../src/cabinet/records.js");
    const a = await owner("snap-ch@sklad.ru", "10.0.1.24");
    const r1 = { id: "r1", qty: 1 };
    const r2 = { id: "r2", qty: 2 };
    const full = (requests, boxes = []) => ({ ...data("склад"), requests, boxes });
    assert.equal(
      (
        await call("/api/cabinet/snapshot", {
          ...a,
          body: { version: 0, format: 8, data: full([r2, r1]) },
        })
      ).status,
      200,
    );
    /** Правка от `before` к `after`, как её считает кабинет. */
    const changes = (version, before, after, extra = {}) => {
      const was = new Map(splitRecords(before).items.map((r) => [`${r.d}/${r.ref}`, r]));
      const now = splitRecords(after);
      const upsert = now.items.filter((r) => {
        const old = was.get(`${r.d}/${r.ref}`);
        return !old || JSON.stringify(old.data) !== JSON.stringify(r.data) || old.pos !== r.pos;
      });
      const left = new Set(now.items.map((r) => `${r.d}/${r.ref}`));
      const remove = [...was.values()]
        .filter((r) => !left.has(`${r.d}/${r.ref}`))
        .map(({ w, d, ref }) => ({ w, d, ref }));
      const doc = { ...now.doc };
      delete doc.products;
      return {
        ...a,
        body: { version, format: 8, doc, slots: now.slots, upsert, remove, ...extra },
      };
    };
    const at = "/api/cabinet/snapshot/changes";
    const since = (await db.root.query(`SELECT now() AS t`)).rows[0].t;
    const r3 = { id: "r3", qty: 3 };
    const box = { id: "b1", lines: [{ productId: "p1", qty: 2 }] };
    const ok = await call(at, changes(1, full([r2, r1]), full([r3, r2, r1], [box])));
    assert.equal(ok.status, 200);
    assert.equal(ok.json.version, 2);
    const read = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual(read.requests, [r3, r2, r1]);
    assert.deepEqual(read.boxes, [box]);
    // Метки правки — в оглавление, документ без них (миграция 056).
    const doc = await db.root.query(`SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`, [
      a.org,
    ]);
    assert.ok(!JSON.stringify(doc.rows[0].data).includes("$rows"));
    assert.equal(await slot(a.org, "", "requests"), 3);
    assert.equal(await slot(a.org, "", "boxes"), 1);
    const touched = await db.root.query(
      `SELECT ref FROM uklad.cabinet_records WHERE org_id = $1 AND updated_at > $2 ORDER BY ref`,
      [a.org, since],
    );
    assert.deepEqual(
      touched.rows.map((r) => r.ref),
      ["b1", "r3"],
    );
    // Тара — в журнал движений, как при записи целиком.
    const moves = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.stock_moves WHERE org_id = $1 AND place_ref = 'b1'`,
      [a.org],
    );
    assert.equal(moves.rows[0].n, 1);

    // Копия считала правку не от того: метка не сходится со строками.
    const wrong = changes(2, full([r3, r2, r1], [box]), full([r3, r1], [box]));
    wrong.body.remove = [];
    const div = await call(at, wrong);
    assert.equal(div.status, 409);
    assert.equal(div.json.error, "diverged");
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.version, 2);
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 3);

    // Устаревшая версия — конфликт; чужая форма — 400.
    assert.equal((await call(at, changes(1, full([r3, r2, r1]), full([r1])))).status, 409);
    const forged = changes(2, full([r3, r2, r1], [box]), full([r3, r2, r1], [box]));
    forged.body.slots = [{ w: "wh_1", d: "requests" }];
    forged.body.upsert = [{ w: "wh_1", d: "requests", ref: "r9", pos: 0, data: { id: "r1" } }];
    assert.equal((await call(at, forged)).status, 400);
    const noMark = changes(2, full([r3, r2, r1], [box]), full([r3, r2, r1], [box]));
    noMark.body.slots = [{ w: "wh_1", d: "pallets" }];
    assert.equal((await call(at, noMark)).status, 400);

    // Больше половины разом — отказ, как у записи целиком.
    const wipe = await call(at, changes(2, full([r3, r2, r1], [box]), full([], [box])));
    assert.equal(wipe.status, 409);
    assert.equal(wipe.json.error, "records_mass_delete");

    // Товары — только когда пришли.
    const withProducts = changes(2, full([r3, r2, r1], [box]), full([r3, r2, r1], [box]), {
      products: [{ id: "p1", sku: "A", name: "Кружка" }],
    });
    assert.equal((await call(at, withProducts)).status, 200);
    const last = (await call("/api/cabinet/snapshot", a)).json.snapshot;
    assert.deepEqual(
      last.data.products.map((p) => p.name),
      ["Кружка"],
    );
    assert.equal(last.data.requests.length, 3);
  },
);

test(
  "список, лежавший строками, не пропадает мимо защиты: пустой или без ключа — отказ",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-lost@sklad.ru", "10.0.1.25");
    const reqs = ["r1", "r2", "r3", "r4", "r5"].map((id) => ({ id }));
    const full = (extra) => ({ ...data("x"), ...extra });
    assert.equal(
      (
        await call("/api/cabinet/snapshot", {
          ...a,
          body: { version: 0, format: 8, data: full({ requests: reqs }) },
        })
      ).status,
      200,
    );
    const docOf = async () =>
      (await db.root.query(`SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`, [a.org]))
        .rows[0].data;
    const at = "/api/cabinet/snapshot/changes";
    const doc = await docOf();
    for (const requests of [[], undefined, "нет"]) {
      const d = { ...doc, requests };
      if (requests === undefined) delete d.requests;
      const res = await call(at, {
        ...a,
        body: { version: 1, format: 8, doc: d, slots: [], upsert: [], remove: [] },
      });
      assert.equal(res.status, 409);
      assert.equal(res.json.error, "diverged");
    }
    // Запись целиком без ключа — тоже отказ; пустой список ловит массовое удаление.
    const noKey = full({});
    for (const d of [noKey, full({ requests: [] })]) {
      const res = await call("/api/cabinet/snapshot", {
        ...a,
        body: { version: 1, format: 8, data: d },
      });
      assert.equal(res.status, 409);
      assert.equal(res.json.error, "records_mass_delete");
    }
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 5);
    // Повтор id без живых заявок — тот же способ стереть их: отказ.
    const twins = full({ requests: [{ id: "x" }, { id: "x" }] });
    const sly = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 1, format: 8, data: twins },
    });
    assert.equal(sly.status, 409);
    assert.equal(sly.json.error, "records_mass_delete");
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 5);
    // Список с повтором id, где все живые заявки на месте, остаётся документом.
    const dup = full({ requests: [...reqs, { id: "r1", qty: 2 }] });
    assert.equal(
      (await call("/api/cabinet/snapshot", { ...a, body: { version: 1, format: 8, data: dup } }))
        .status,
      200,
    );
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 6);
  },
);

test(
  "окно истории: законченное старше 7 дней — в архив, запись его не теряет, отчёт читает",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-arch@sklad.ru", "10.0.1.30");
    const shipped = { id: "r1", status: "shipped" };
    const open = { id: "r2", status: "new" };
    const fresh = { id: "r3", status: "shipped" };
    const closed = { id: "s1", status: "closed", lines: [{ id: "l1" }] };
    const receiving = { id: "s2", status: "receiving", lines: [{ id: "l2" }] };
    const evClosed = { id: "e1", expectedShipmentLineId: "l1" };
    const evOpen = { id: "e2", expectedShipmentLineId: "l2" };
    const box = { id: "b1", lines: [] };
    const cab = (extra = {}) => ({
      ...data("склад"),
      requests: [fresh, open, shipped],
      expectedShipments: [receiving, closed],
      receivingEvents: [evClosed, evOpen],
      boxes: [box],
      staffEvents: [{ id: "st1", kind: "shift_start" }],
      ...extra,
    });
    await call("/api/cabinet/snapshot", { ...a, body: { version: 0, format: 8, data: cab() } });
    // Состарить всё, кроме свежей заявки.
    await db.root.query(
      `UPDATE uklad.cabinet_records SET updated_at = now() - interval '60 days'
       WHERE org_id = $1 AND ref <> 'r3'`,
      [a.org],
    );

    const read = (await call("/api/cabinet/snapshot", a)).json.snapshot;
    assert.deepEqual(read.data.requests, [fresh, open]);
    assert.deepEqual(read.data.expectedShipments, [receiving]);
    // Приёмка открытой поставки остаётся: по ней собирается лист приёмки.
    assert.deepEqual(read.data.receivingEvents, [evOpen]);
    assert.deepEqual(read.data.boxes, [box]);
    assert.deepEqual(read.data.staffEvents, []);

    const hist = await call("/api/cabinet/history", a);
    assert.equal(hist.status, 200);
    assert.equal(hist.json.next, null);
    assert.deepEqual(hist.json.rows.map((r) => `${r.w}/${r.d}/${r.ref}`).sort(), [
      "/staffEvents/st1",
      "wh_1/expectedShipments/s1",
      "wh_1/receivingEvents/e1",
      "wh_1/requests/r1",
    ]);

    // Запись целиком без архива — архив цел, в корзину не ушёл.
    const window = read.data;
    const w1 = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: read.version, format: 8, data: { ...window, requests: [fresh, open] } },
    });
    assert.equal(w1.status, 200);
    const trashed = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.cabinet_records WHERE org_id = $1 AND deleted_at IS NOT NULL`,
      [a.org],
    );
    assert.equal(trashed.rows[0].n, 0);
    assert.equal((await call("/api/cabinet/history", a)).json.rows.length, 4);

    // Копия, открытая до архивации, прислала архивную заявку — та вернулась.
    const stale = await call("/api/cabinet/snapshot", {
      ...a,
      body: {
        version: w1.json.version,
        format: 8,
        data: { ...window, requests: [fresh, open, shipped] },
      },
    });
    assert.equal(stale.status, 200);
    const back = (await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests;
    assert.deepEqual(back, [fresh, open, shipped]);

    // Изменённая архивная строка историю не переписывает: отказ, архив цел.
    await db.root.query(
      `UPDATE uklad.cabinet_records SET archived_at = now() WHERE org_id = $1 AND ref = 'r1'`,
      [a.org],
    );
    const ver = (await call("/api/cabinet/snapshot", a)).json.snapshot.version;
    const edited = await call("/api/cabinet/snapshot", {
      ...a,
      body: {
        version: ver,
        format: 8,
        data: { ...window, requests: [fresh, open, { ...shipped, status: "new" }] },
      },
    });
    assert.equal(edited.status, 409);
    const r1 = await db.root.query(
      `SELECT data->>'status' AS s FROM uklad.cabinet_records WHERE org_id = $1 AND ref = 'r1'`,
      [a.org],
    );
    assert.equal(r1.rows[0].s, "shipped");
    await db.root.query(
      `UPDATE uklad.cabinet_records SET archived_at = NULL WHERE org_id = $1 AND ref = 'r1'`,
      [a.org],
    );

    // Архив — только раз в сутки: вернувшаяся заявка в архив сразу не уходит.
    await db.root.query(
      `UPDATE uklad.cabinet_records SET updated_at = now() - interval '60 days' WHERE org_id = $1`,
      [a.org],
    );
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.requests.length, 3);

    // Страницы и чужой ключ.
    assert.equal((await call("/api/cabinet/history?after=%%%", a)).status, 400);
    const { loadArchive } = require("../src/cabinet/records.js");
    const { asOrg } = await import("../../db/test/helpers.js");
    const pages = await asOrg(db.pool, a.org, async (c) => {
      const p1 = await loadArchive(c, null, 2);
      const p2 = await loadArchive(c, p1.next, 2);
      return [p1, p2];
    });
    assert.equal(pages[0].rows.length, 2);
    assert.ok(pages[0].next);
    assert.equal(pages[1].next, null);
    assert.equal(pages[0].rows.length + pages[1].rows.length, 3);
  },
);

test("архив чужой компании не виден, без входа — 401", { skip: SKIP }, async () => {
  const b = await owner("snap-arch-b@sklad.ru", "10.0.1.31");
  const hist = await call("/api/cabinet/history", b);
  assert.equal(hist.status, 200);
  assert.deepEqual(hist.json.rows, []);
  assert.equal((await call("/api/cabinet/history")).status, 401);
});

test(
  "списание в кабинете — только с правом начальника склада (goods.writeoff)",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-wo@sklad.ru", "10.0.1.9");
    const dispute = (extra) => ({
      id: "d1",
      kind: "shortage",
      qty: 1,
      raisedBy: "stf-1",
      raisedAt: 1,
      ...extra,
    });
    const withDispute = (d) => ({ ...data("списание"), disputes: [d] });
    const first = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 0, format: 8, data: withDispute(dispute()) },
    });
    assert.equal(first.status, 200);
    await db.root.query(
      `UPDATE uklad.roles SET permissions = array_remove(permissions, 'goods.writeoff')
       WHERE org_id = $1 AND name = 'Владелец'`,
      [a.org],
    );
    const off = dispute({
      resolution: "written_off",
      resolvedBy: "manager",
      resolvedAt: 2,
      note: "x",
    });
    const denied = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: first.json.version, format: 8, data: withDispute(off) },
    });
    assert.equal(denied.status, 403);
    // Вернуть на место можно и без права списания.
    const back = dispute({ resolution: "returned", resolvedBy: "manager", resolvedAt: 2 });
    const kept = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: first.json.version, format: 8, data: withDispute(back) },
    });
    assert.equal(kept.status, 200);
  },
);

test(
  "хранение: запись снимка — сутки занятости продавца, ушёл с полок — ноль, чужая компания не видит",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-store@sklad.ru", "10.0.1.20");
    const b = await owner("snap-store-b@sklad.ru", "10.0.1.21");
    const cell = (shelfIndex, cellIndex) => ({
      floorId: "f1",
      moduleId: "m1",
      shelfIndex,
      cellIndex,
    });
    const stocked = (boxes) => ({
      warehouse: {
        id: "wh_1",
        name: "Склад",
        floors: [
          {
            id: "f1",
            modules: [
              {
                id: "m1",
                shelves: [
                  { id: "s0", cells: 2, palletPlace: true },
                  { id: "s1", cells: 2 },
                ],
              },
            ],
          },
        ],
      },
      products: [{ id: "pr1", sku: "A-1", name: "Кружка", partnerId: "p1" }],
      boxes,
    });
    const first = await call("/api/cabinet/snapshot", {
      ...a,
      body: {
        version: 0,
        format: 8,
        data: stocked([
          {
            id: "bx1",
            barcode: "UK-BOX-1",
            createdAt: 1,
            address: cell(0, 0),
            lines: [{ productId: "pr1", qty: 3 }],
          },
          {
            id: "bx2",
            barcode: "UK-BOX-2",
            createdAt: 1,
            address: cell(1, 0),
            lines: [{ productId: "pr1", qty: 1 }],
          },
          { id: "bx3", barcode: "UK-BOX-3", createdAt: 1, lines: [{ productId: "pr1", qty: 1 }] },
        ]),
      },
    });
    assert.equal(first.status, 200);
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const q = `/api/cabinet/storage?from=${today}&to=${today}&warehouse=wh_1`;
    const read = await call(q, a);
    assert.equal(read.status, 200);
    assert.deepEqual(read.json.rows, [{ day: today, partner: "p1", pallets: 1, boxes: 1 }]);

    // Тару сняли с полок — на сегодня ноль, а не вчерашнее число.
    const gone = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: first.json.version, format: 8, data: stocked([]) },
    });
    assert.equal(gone.status, 200);
    assert.deepEqual((await call(q, a)).json.rows, [
      { day: today, partner: "p1", pallets: 0, boxes: 0 },
    ]);

    // Чужая компания: своих строк нет, к чужим заголовком не пускает.
    assert.deepEqual((await call(q, b)).json.rows, []);
    assert.equal((await call(q, { cookie: b.cookie, org: a.org })).status, 401);
    assert.equal(
      (await call(`/api/cabinet/storage?from=${today}&to=x&warehouse=wh_1`, a)).status,
      400,
    );
  },
);

test(
  "хранение: продавец ушёл с полок до первой записи дня — на сегодня ноль",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-store-c@sklad.ru", "10.0.1.22");
    await db.root.query(
      `INSERT INTO uklad.storage_days (org_id, warehouse_ref, day, partner_ref, pallets, boxes)
     VALUES ($1, 'wh_1', (now() AT TIME ZONE 'Europe/Moscow')::date - 3, 'p9', 4, 2)`,
      [a.org],
    );
    const saved = await call("/api/cabinet/snapshot", {
      ...a,
      body: { version: 0, format: 8, data: data("пусто") },
    });
    assert.equal(saved.status, 200);
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const rows = (await call(`/api/cabinet/storage?from=${today}&to=${today}&warehouse=wh_1`, a))
      .json.rows;
    // Строка трёхдневной давности — опора для начала периода, и сегодняшний ноль.
    assert.deepEqual(
      rows.map((r) => [r.day === today, r.partner, r.pallets, r.boxes]),
      [
        [false, "p9", 4, 2],
        [true, "p9", 0, 0],
      ],
    );
  },
);

test(
  "склады строками: в документе их нет, кабинет получает тот же JSON, удалённый — в корзине",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-wh@sklad.ru", "10.0.1.40");
    const main = { id: "wh_m", name: "Основной", kind: "fulfillment", floors: [{ id: "f1" }] };
    const second = { id: "wh_s", name: "Второй", address: "Тула", staff: [{ id: "st1" }] };
    const put = async (version, warehouse, otherWarehouses) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: { version, format: 8, data: { warehouse, otherWarehouses, products: [] } },
      });
    assert.equal((await put(0, main, [second])).status, 200);

    const raw = await db.root.query(
      `SELECT data ? 'warehouse' AS w, data ? 'otherWarehouses' AS o
       FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.deepEqual(raw.rows[0], { w: false, o: false });
    const rows = async () =>
      (
        await db.root.query(
          `SELECT ref, name, address, position, placeholder, deleted_at IS NOT NULL AS gone
           FROM uklad.warehouses WHERE org_id = $1 ORDER BY ref`,
          [a.org],
        )
      ).rows;
    assert.deepEqual(await rows(), [
      {
        ref: "wh_m",
        name: "Основной",
        address: null,
        position: 0,
        placeholder: false,
        gone: false,
      },
      {
        ref: "wh_s",
        name: "Второй",
        address: "Тула",
        position: 1,
        placeholder: false,
        gone: false,
      },
    ]);
    const read = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual(read.warehouse, main);
    assert.deepEqual(read.otherWarehouses, [second]);

    // Руководитель открыл второй склад и убрал первый — первый в корзине.
    assert.equal((await put(1, second, [])).status, 200);
    assert.deepEqual(
      (await rows()).map((r) => [r.ref, r.position, r.gone]),
      [
        ["wh_m", 0, true],
        ["wh_s", 0, false],
      ],
    );
    const again = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual([again.warehouse.id, again.otherWarehouses], ["wh_s", []]);

    // Заготовка в лимит не идёт.
    assert.equal((await put(2, { id: "ph", placeholder: true, floors: [] }, [second])).status, 200);
    const n = await db.root.query(
      `SELECT count(*)::int AS n FROM uklad.warehouses
       WHERE org_id = $1 AND deleted_at IS NULL AND card IS NOT NULL AND NOT placeholder`,
      [a.org],
    );
    assert.equal(n.rows[0].n, 1);

    // Список с повтором id остаётся в документе, таблица не трогается.
    assert.equal((await put(3, second, [second])).status, 200);
    const kept = await db.root.query(
      `SELECT data->'otherWarehouses'->0->>'id' AS id FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.equal(kept.rows[0].id, "wh_s");
    assert.equal(
      (await call("/api/cabinet/snapshot", a)).json.snapshot.data.otherWarehouses.length,
      1,
    );
  },
);

test(
  "сотрудники строками: в карточке склада их нет, кабинет получает тот же JSON",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-staff@sklad.ru", "10.0.1.42");
    const ivan = { id: "st1", name: "Иван", role: "Упаковщик", hourlyRate: 300, phone: "+7 900" };
    const olga = { id: "st2", name: "Ольга", role: "Кладовщик" };
    const put = async (version, staff, other = []) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: {
          version,
          format: 8,
          data: { warehouse: { id: "wh_p", name: "Склад", staff }, otherWarehouses: other },
        },
      });
    assert.equal((await put(0, [ivan, olga])).status, 200);
    const card = await db.root.query(
      `SELECT card ? 'staff' AS inline, staff_rows FROM uklad.warehouses
       WHERE org_id = $1 AND ref = 'wh_p'`,
      [a.org],
    );
    assert.deepEqual(card.rows[0], { inline: false, staff_rows: true });
    const rows = async () =>
      (
        await db.root.query(
          `SELECT ref, name, role, position, deleted_at IS NOT NULL AS gone
           FROM uklad.staff WHERE org_id = $1 ORDER BY ref`,
          [a.org],
        )
      ).rows;
    assert.deepEqual(await rows(), [
      { ref: "st1", name: "Иван", role: "Упаковщик", position: 0, gone: false },
      { ref: "st2", name: "Ольга", role: "Кладовщик", position: 1, gone: false },
    ]);
    const read = async () => (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual((await read()).warehouse.staff, [ivan, olga]);

    // Ольгу убрали, Ивана поставили вторым, пустой склад — с пустым списком.
    const empty = { id: "wh_e", name: "Пустой", staff: [] };
    assert.equal((await put(1, [{ ...ivan, hourlyRate: 350 }], [empty])).status, 200);
    assert.deepEqual(
      (await rows()).map((r) => [r.ref, r.gone]),
      [
        ["st1", false],
        ["st2", true],
      ],
    );
    const after = await read();
    assert.deepEqual(after.warehouse.staff, [{ ...ivan, hourlyRate: 350 }]);
    assert.deepEqual(after.otherWarehouses, [empty]);

    // Карточка без ключа staff — «не менялись»: люди склада на месте.
    assert.equal((await put(2, undefined)).status, 200);
    assert.deepEqual((await read()).warehouse.staff, [{ ...ivan, hourlyRate: 350 }]);
    // Новый склад без ключа так и читается — без него.
    assert.equal((await put(3, [], [{ id: "wh_n", name: "Новый" }])).status, 200);
    assert.equal("staff" in (await read()).otherWarehouses[0], false);

    // Повтор id — список остаётся в карточке склада как был.
    assert.equal((await put(4, [olga, olga])).status, 200);
    assert.deepEqual((await read()).warehouse.staff, [olga, olga]);
  },
);

test(
  "партнёры строками: в карточке склада их нет, без ключа — не менялись, убранный — в корзине",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-partners@sklad.ru", "10.0.1.44");
    const p1 = { id: "p1", name: "ИП Иванов", inn: "770000000000", phone: "+7 900" };
    const p2 = { id: "p2", name: "ООО Ромашка" };
    const put = async (version, partners) =>
      call("/api/cabinet/snapshot", {
        ...a,
        body: {
          version,
          format: 8,
          data: { warehouse: { id: "wh_r", name: "Склад", partners }, otherWarehouses: [] },
        },
      });
    assert.equal((await put(0, [p1, p2])).status, 200);
    const card = await db.root.query(
      `SELECT card ? 'partners' AS inline, partner_rows FROM uklad.warehouses
       WHERE org_id = $1 AND ref = 'wh_r'`,
      [a.org],
    );
    assert.deepEqual(card.rows[0], { inline: false, partner_rows: true });
    const rows = async () =>
      (
        await db.root.query(
          `SELECT ref, name, inn, deleted_at IS NOT NULL AS gone
           FROM uklad.partners WHERE org_id = $1 ORDER BY ref`,
          [a.org],
        )
      ).rows;
    assert.deepEqual(await rows(), [
      { ref: "p1", name: "ИП Иванов", inn: "770000000000", gone: false },
      { ref: "p2", name: "ООО Ромашка", inn: null, gone: false },
    ]);
    const read = async () => (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual((await read()).warehouse.partners, [p1, p2]);
    assert.equal((await put(1, undefined)).status, 200);
    assert.deepEqual((await read()).warehouse.partners, [p1, p2]);
    assert.equal((await put(2, [p2])).status, 200);
    assert.deepEqual(
      (await rows()).map((r) => [r.ref, r.gone]),
      [
        ["p1", true],
        ["p2", false],
      ],
    );
    assert.deepEqual((await read()).warehouse.partners, [p2]);
  },
);

test(
  "размещения строками: по строке на товар, журнал движений и счёт штук до и после сходятся",
  { skip: SKIP },
  async () => {
    const { splitRecords } = require("../src/cabinet/records.js");
    const a = await owner("snap-plc@sklad.ru", "10.0.1.45");
    const cell = (i) => ({ floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: i });
    const full = (placements) => ({ ...data("склад"), placements });
    const before = { p1: cell(0), p2: cell(1), p3: cell(2) };
    assert.equal(
      (
        await call("/api/cabinet/snapshot", {
          ...a,
          body: { version: 0, format: 8, data: full(before) },
        })
      ).status,
      200,
    );
    const raw = await db.root.query(
      `SELECT data->'placements' AS p FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.equal(raw.rows[0].p, null);
    assert.equal(await slot(a.org, "", "placements"), 3);
    const read = async () => (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual((await read()).placements, before);

    // p2 переехал в другую ячейку, p3 сняли с полки — только изменённое.
    const after = { p1: cell(0), p2: cell(5) };
    const was = new Map(splitRecords(full(before)).items.map((r) => [`${r.d}/${r.ref}`, r]));
    const now = splitRecords(full(after));
    const upsert = now.items.filter(
      (r) => JSON.stringify(was.get(`${r.d}/${r.ref}`)?.data) !== JSON.stringify(r.data),
    );
    const left = new Set(now.items.map((r) => `${r.d}/${r.ref}`));
    const remove = [...was.values()]
      .filter((r) => !left.has(`${r.d}/${r.ref}`))
      .map(({ w, d, ref }) => ({ w, d, ref }));
    assert.deepEqual(
      upsert.map((r) => r.ref),
      ["p2"],
    );
    const doc = { ...now.doc };
    delete doc.products;
    const ok = await call("/api/cabinet/snapshot/changes", {
      ...a,
      body: { version: 1, format: 8, doc, slots: now.slots, upsert, remove },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual((await read()).placements, after);

    // Журнал: p2 ушёл из ячейки 1 и пришёл в 5, p3 ушёл из 2, p1 не двигался.
    const { rows } = await db.root.query(
      `SELECT product_ref, delta FROM uklad.stock_moves
       WHERE org_id = $1 AND snapshot_version = 2 AND place_kind = 'cell'
       ORDER BY product_ref, delta`,
      [a.org],
    );
    assert.deepEqual(
      rows.map((r) => [r.product_ref, r.delta]),
      [
        ["p2", -1],
        ["p2", 1],
        ["p3", -1],
      ],
    );
    // Сверка: штук по журналу = размещений после.
    const total = await db.root.query(
      `SELECT coalesce(sum(delta), 0)::int AS n FROM uklad.stock_moves
       WHERE org_id = $1 AND place_kind = 'cell'`,
      [a.org],
    );
    assert.equal(total.rows[0].n, Object.keys(after).length);
  },
);

test(
  "миграция 054: сотрудники из карточек складов переезжают в строки",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-staff-mig@sklad.ru", "10.0.1.43");
    const data = { warehouse: { id: "wh_q", name: "Склад" }, otherWarehouses: [] };
    assert.equal(
      (await call("/api/cabinet/snapshot", { ...a, body: { version: 0, format: 8, data } })).status,
      200,
    );
    // Карточка до 054: сотрудники в ней самой.
    await db.root.query(
      `UPDATE uklad.warehouses SET card = card || '{"staff": [{"id": "s9", "name": "Пётр"}]}',
       staff_rows = false
     WHERE org_id = $1 AND ref = 'wh_q'`,
      [a.org],
    );
    const sql = readFileSync(
      new URL("../../db/migrations/054_staff_rows.sql", import.meta.url),
      "utf8",
    );
    await db.root.query(sql.slice(sql.indexOf("ALTER TABLE uklad.warehouses NO FORCE")));
    const card = await db.root.query(
      `SELECT card ? 'staff' AS inline FROM uklad.warehouses WHERE org_id = $1 AND ref = 'wh_q'`,
      [a.org],
    );
    assert.equal(card.rows[0].inline, false);
    const read = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual(read.warehouse.staff, [{ id: "s9", name: "Пётр" }]);
  },
);

test("миграция 051: склады старого снимка переезжают в строки", { skip: SKIP }, async () => {
  const a = await owner("snap-wh-mig@sklad.ru", "10.0.1.41");
  assert.equal(
    (
      await call("/api/cabinet/snapshot", {
        ...a,
        body: { version: 0, format: 8, data: { mark: "x", products: [] } },
      })
    ).status,
    200,
  );
  // Снимок до 051: склады в документе.
  await db.root.query(
    `UPDATE uklad.cabinet_snapshots
     SET data = data || '{"warehouse": {"id": "old_1", "name": "Старый"},
                          "otherWarehouses": [{"id": "old_2", "name": "Ещё"}]}'::jsonb
     WHERE org_id = $1`,
    [a.org],
  );
  const sql = readFileSync(
    new URL("../../db/migrations/051_warehouses_cards.sql", import.meta.url),
    "utf8",
  );
  const from = sql.indexOf("ALTER TABLE uklad.cabinet_snapshots NO FORCE");
  await db.root.query(sql.slice(from));
  const doc = await db.root.query(
    `SELECT data ? 'warehouse' AS w FROM uklad.cabinet_snapshots WHERE org_id = $1`,
    [a.org],
  );
  assert.equal(doc.rows[0].w, false);
  const read = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
  assert.deepEqual(read.warehouse, { id: "old_1", name: "Старый" });
  assert.deepEqual(read.otherWarehouses, [{ id: "old_2", name: "Ещё" }]);
  assert.equal(read.mark, "x");
});

test(
  "оглавление — строками: метки старого документа уходят в таблицу, чтение то же",
  { skip: SKIP },
  async () => {
    const a = await owner("snap-slots@sklad.ru", "10.0.1.29");
    const r1 = { id: "r1", qty: 1 };
    const body = { version: 0, format: 8, data: { ...data("x"), requests: [r1] } };
    assert.equal((await call("/api/cabinet/snapshot", { ...a, body })).status, 200);
    const before = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    // Документ как до миграции 056: метки на месте, оглавления нет. Запись
    // документа (миграция делает ту же `SET data = data`) разбирает его снова.
    await db.root.query(`DELETE FROM uklad.cabinet_slots WHERE org_id = $1`, [a.org]);
    await db.root.query(
      `UPDATE uklad.cabinet_snapshots
       SET data = data || '{"requests": {"$rows": 1}, "warehouseData": {"wh_9": {"tasks": {"$rows": 0}, "x": 1}}}'
       WHERE org_id = $1`,
      [a.org],
    );
    const raw = await db.root.query(`SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`, [
      a.org,
    ]);
    assert.ok(!JSON.stringify(raw.rows[0].data).includes("$rows"));
    assert.deepEqual(raw.rows[0].data.warehouseData.wh_9, { x: 1 });
    assert.equal(await slot(a.org, "", "requests"), 1);
    assert.equal(await slot(a.org, "wh_9", "tasks"), 0);
    const after = (await call("/api/cabinet/snapshot", a)).json.snapshot.data;
    assert.deepEqual(after.requests, before.requests);
    assert.deepEqual(after.warehouseData.wh_9, { tasks: [], x: 1 });
    // Похожее на метку, но не метка, остаётся в документе как было.
    await db.root.query(
      `UPDATE uklad.cabinet_snapshots SET data = data || '{"odd": {"$rows": 1.5}}'
       WHERE org_id = $1`,
      [a.org],
    );
    const odd = await db.root.query(
      `SELECT data->'odd' AS o FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.deepEqual(odd.rows[0].o, { $rows: 1.5 });
  },
);
