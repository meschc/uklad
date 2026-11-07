// Снимок кабинета на сервере (ADR 0010): своя компания пишет и читает,
// чужая не видит; устаревшая версия — 409, а не молчаливое затирание.
/* global process, fetch, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

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

const data = (mark) => ({ warehouse: { id: "wh_1", name: mark }, products: [] });

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
    `SELECT previous->'warehouse'->>'name' AS prev FROM uklad.cabinet_snapshots WHERE org_id = $1`,
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
  "снимок только руководителю: бейдж и роль без staff.manage — 403",
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
    const write = await call("/api/cabinet/snapshot", {
      cookie: badge,
      body: { version: 1, format: 8, data: data("упаковщик") },
    });
    assert.equal(write.status, 403);

    // Вход паролем, но в роли без права на персонал — тоже нет.
    await db.root.query(
      `UPDATE uklad.roles SET permissions = array_remove(permissions, 'staff.manage')
     WHERE org_id = $1 AND name = 'Владелец'`,
      [a.org],
    );
    assert.equal((await call("/api/cabinet/snapshot", a)).status, 403);
    await db.root.query(
      `UPDATE uklad.roles SET permissions = array_append(permissions, 'staff.manage')
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
    // Сбой клиента: стор пустой — сервер не принимает и снимок не двигает.
    const wiped = await save(1, []);
    assert.equal(wiped.status, 409);
    assert.equal(wiped.json.error, "products_mass_delete");
    assert.equal(wiped.json.version, 1);
    assert.equal((await call("/api/cabinet/snapshot", a)).json.snapshot.data.products.length, 20);
    // Половина — можно: человек удаляет частями.
    assert.equal((await save(1, cards.slice(10))).status, 200);
    // Девять из десяти разом — можно, а последний — как обычно.
    assert.equal((await save(2, cards.slice(19))).status, 200);
    assert.equal((await save(3, [])).status, 200);
    assert.deepEqual((await call("/api/cabinet/snapshot", a)).json.snapshot.data.products, []);
  },
);

test(
  "каталог не стирается целиком и маленьким: пять товаров разом — 409",
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
    const wiped = await save(1, []);
    assert.equal(wiped.status, 409);
    assert.equal(wiped.json.error, "products_mass_delete");
    assert.equal((await save(1, cards.slice(3))).status, 200);
    assert.equal((await save(2, [])).status, 200);
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

    // В документе — метки, записи — строками.
    const stored = await db.root.query(
      `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = $1`,
      [a.org],
    );
    assert.deepEqual(stored.rows[0].data.requests, { $rows: 2 });
    assert.deepEqual(stored.rows[0].data.warehouseData.wh_2.requests, { $rows: 1 });
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
    assert.deepEqual(stored.rows[0].r, { $rows: 1 });
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
