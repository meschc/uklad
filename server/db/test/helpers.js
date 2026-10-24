// Стенд тестов: своя чистая база на прогон, миграции под владельцем, запросы
// — под ролью приложения, как в бою.
//
//   PG_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
//
// Суперпользователь нужен только для подготовки: создать роли и базу, а потом
// сверить, что данные целы. Сами проверки идут под `uklad_app` — без
// BYPASSRLS и не владельцем таблиц, иначе тест RLS ничего бы не доказывал.
/* global process, URL */
import pg from "pg";
import { randomBytes } from "node:crypto";
import { migrate } from "../src/migrate.js";

const ADMIN_URL =
  process.env.PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const TEST_PW = "uklad-test-only";

function urlFor(database, user, password) {
  const u = new URL(ADMIN_URL);
  if (user) {
    u.username = user;
    u.password = password;
  }
  u.pathname = `/${database}`;
  return u.toString();
}

/** Поднимает чистую базу со схемой. Вернёт пул приложения, суперпользователя и уборку. */
export async function setupDb() {
  const name = `uklad_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  for (const role of ["uklad_owner", "uklad_app"]) {
    const { rowCount } = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role]);
    if (!rowCount) await admin.query(`CREATE ROLE ${role}`);
    await admin.query(`ALTER ROLE ${role} LOGIN NOBYPASSRLS PASSWORD '${TEST_PW}'`);
  }
  await admin.query(`CREATE DATABASE ${name} OWNER uklad_owner`);
  await admin.query(`GRANT CONNECT ON DATABASE ${name} TO uklad_app`);

  const owner = new pg.Client({ connectionString: urlFor(name, "uklad_owner", TEST_PW) });
  await owner.connect();
  await migrate(owner);
  await owner.end();

  const pool = new pg.Pool({ connectionString: urlFor(name, "uklad_app", TEST_PW), max: 25 });
  // Видит всё мимо RLS — только чтобы сверить, что данные целы.
  const root = new pg.Client({ connectionString: urlFor(name) });
  await root.connect();

  async function teardown() {
    await pool.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
  return { pool, root, teardown };
}

/**
 * Транзакция от имени компании — так будет делать сервер: `set_config(…, true)`
 * живёт только до конца транзакции. Ошибка внутри откатывает всё.
 */
export async function asOrg(pool, orgId, fn, memberId = null) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    if (orgId) await c.query(`SELECT set_config('app.org_id', $1, true)`, [orgId]);
    if (memberId) await c.query(`SELECT set_config('app.member_id', $1, true)`, [memberId]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK");
    throw err;
  } finally {
    c.release();
  }
}

/** Новая компания: ID задаёт приложение, как при регистрации. */
export async function createOrg(pool, { name, warehouse = false, seller = false }) {
  const { rows } = await pool.query(`SELECT uklad.uuid_v7() AS id`);
  const id = rows[0].id;
  await asOrg(pool, id, (c) =>
    c.query(
      `INSERT INTO uklad.orgs (id, name, has_warehouse, has_seller) VALUES ($1, $2, $3, $4)`,
      [id, name, warehouse, seller],
    ),
  );
  return id;
}

const one = async (c, sql, args) => (await c.query(sql, args)).rows[0].id;

/**
 * Мир для проверок изоляции (5а, тест 1):
 *   склад A с селлерами S1 и S2 по договору; у A товары S1, S2 и без владельца;
 *   склад B со своим товаром; селлер X без договора ни с кем.
 */
export async function seedWorld(pool) {
  const A = await createOrg(pool, { name: "Склад А", warehouse: true });
  const B = await createOrg(pool, { name: "Склад Б", warehouse: true });
  const S1 = await createOrg(pool, { name: "Селлер 1", seller: true });
  const S2 = await createOrg(pool, { name: "Селлер 2", seller: true });
  const X = await createOrg(pool, { name: "Селлер без договора", seller: true });

  const a = await asOrg(pool, A, async (c) => {
    const wh = await one(
      c,
      `INSERT INTO uklad.warehouses (org_id, name) VALUES ($1, 'Мезонин') RETURNING id`,
      [A],
    );
    const contract = (seller) =>
      one(
        c,
        `INSERT INTO uklad.contracts (org_id, warehouse_id, seller_org_id) VALUES ($1, $2, $3) RETURNING id`,
        [A, wh, seller],
      );
    const c1 = await contract(S1);
    const c2 = await contract(S2);
    const product = (sku, seller) =>
      one(
        c,
        `INSERT INTO uklad.products (org_id, seller_org_id, sku, name) VALUES ($1, $2, $3, $3) RETURNING id`,
        [A, seller, sku],
      );
    const p1 = await product("S1-001", S1);
    const p2 = await product("S2-001", S2);
    const p3 = await product("NOBODY-001", null);
    const stock = (p, qty) =>
      one(
        c,
        `INSERT INTO uklad.stock (org_id, warehouse_id, product_id, cell, qty)
         VALUES ($1, $2, $3, 'A-01-01', $4) RETURNING id`,
        [A, wh, p, qty],
      );
    return {
      wh,
      c1,
      c2,
      p1,
      p2,
      p3,
      st1: await stock(p1, 5),
      st2: await stock(p2, 5),
      st3: await stock(p3, 1),
    };
  });
  const b = await asOrg(pool, B, async (c) => {
    const wh = await one(
      c,
      `INSERT INTO uklad.warehouses (org_id, name) VALUES ($1, 'Склад Б') RETURNING id`,
      [B],
    );
    const p = await one(
      c,
      `INSERT INTO uklad.products (org_id, sku, name) VALUES ($1, 'B-001', 'Товар Б') RETURNING id`,
      [B],
    );
    const st = await one(
      c,
      `INSERT INTO uklad.stock (org_id, warehouse_id, product_id, cell, qty)
       VALUES ($1, $2, $3, 'B-01-01', 3) RETURNING id`,
      [B, wh, p],
    );
    return { wh, p, st };
  });
  return { A, B, S1, S2, X, a, b };
}
