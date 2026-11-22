// Миграция 061: общий каталог компании с несколькими складами — первому
// складу (по `position`), остальным складам копий нет; все склады получают
// свой каталог. Компания с одним складом уже разобрана миграцией 059.
/* global process, URL */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ADMIN_URL =
  process.env.PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const PW = "uklad-test-only";
const DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

test("061: товары без склада — первому складу, свой каталог", async () => {
  const name = `uklad_m061_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  for (const role of ["uklad_owner", "uklad_app", "uklad_notifier"]) {
    const { rowCount } = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [role]);
    if (!rowCount) await admin.query(`CREATE ROLE ${role}`);
    await admin.query(`ALTER ROLE ${role} LOGIN NOBYPASSRLS PASSWORD '${PW}'`);
  }
  await admin.query(`CREATE DATABASE ${name} OWNER uklad_owner`);
  const url = (user) => {
    const u = new URL(ADMIN_URL);
    if (user) [u.username, u.password] = [user, PW];
    u.pathname = `/${name}`;
    return u.toString();
  };
  const c = new pg.Client({ connectionString: url("uklad_owner") });
  const root = new pg.Client({ connectionString: url() });
  await c.connect();
  await root.connect();
  try {
    const files = readdirSync(DIR)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort();
    const apply = async (f) => c.query(readFileSync(DIR + f, "utf8"));
    for (const f of files.filter((f) => f < "061_")) await apply(f);
    const org = async (n) =>
      (
        await root.query(
          `INSERT INTO uklad.orgs (name, has_warehouse) VALUES ($1, true) RETURNING id`,
          [n],
        )
      ).rows[0].id;
    const one = await org("Один склад");
    const two = await org("Два склада");
    // Триггер 058 заводит роли складу — под компанией склада (RLS).
    const wh = async (o, list) => {
      await root.query("BEGIN");
      await root.query(`SELECT set_config('app.org_id', $1, true)`, [o]);
      for (const [ref, pos] of list) {
        await root.query(
          `INSERT INTO uklad.warehouses (org_id, ref, name, card, position)
           VALUES ($1, $2, $2, jsonb_build_object('id', $2::text), $3)`,
          [o, ref, pos],
        );
      }
      await root.query("COMMIT");
    };
    await wh(one, [["wa", 0]]);
    await wh(two, [
      ["wb", 1],
      ["wc", 0],
    ]);
    const goods = async (o, list) => {
      await root.query("BEGIN");
      await root.query(`SELECT set_config('app.org_id', $1, true)`, [o]);
      for (const [ref, w] of list) {
        await root.query(
          `INSERT INTO uklad.products (org_id, ref, sku, name, warehouse_ref)
           VALUES ($1, $2, $2, $2, $3)`,
          [o, ref, w],
        );
      }
      await root.query("COMMIT");
    };
    await goods(one, [["p1", "wa"]]);
    await goods(two, [
      ["p2", null],
      ["p3", "wb"],
    ]);
    await apply("061_shared_products_first_warehouse.sql");
    const rows = async (sql) => (await root.query(sql)).rows;
    assert.deepEqual(await rows(`SELECT ref, warehouse_ref FROM uklad.products ORDER BY ref`), [
      { ref: "p1", warehouse_ref: "wa" },
      { ref: "p2", warehouse_ref: "wc" },
      { ref: "p3", warehouse_ref: "wb" },
    ]);
    assert.deepEqual(
      await rows(`SELECT ref, card->'ownCatalog' AS flag FROM uklad.warehouses ORDER BY ref`),
      [
        { ref: "wa", flag: true },
        { ref: "wb", flag: true },
        { ref: "wc", flag: true },
      ],
    );
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
