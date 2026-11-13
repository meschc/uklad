// Миграция 030 в компании, заведённой до неё: право подтверждать списание
// (`goods.writeoff`) получают владелец и начальник склада, но не кладовщик.
// Роли закрыты FORCE RLS — без снятия защиты UPDATE обновил бы ноль строк, и
// списывать на складе не смог бы никто. Новая компания получает то же из
// `create_default_roles`.
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

test("компания создана до 030 — подтверждать списание могут владелец и начальник склада", async () => {
  const name = `uklad_m030_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  // Миграции идут под владельцем таблиц, как в бою: суперпользователь обошёл
  // бы RLS, и тест ничего бы не доказал.
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
    for (const f of files.filter((f) => f < "030_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('До 030', true)`);
    await apply(files.find((f) => f.startsWith("030_")));
    const { rows } = await root.query(
      `SELECT name, 'goods.writeoff' = ANY (permissions) AS can FROM uklad.roles ORDER BY name`,
    );
    const can = Object.fromEntries(rows.map((r) => [r.name, r.can]));
    assert.equal(can["Владелец"], true);
    assert.equal(can["Начальник склада"], true);
    assert.equal(can["Кладовщик"], false);
    assert.equal(can["Приёмщик"], false);
    // Компания после миграции — права из `create_default_roles`.
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('После 030', true)`);
    const after = await root.query(
      `SELECT r.name FROM uklad.roles r JOIN uklad.orgs o ON o.id = r.org_id
       WHERE o.name = 'После 030' AND 'goods.writeoff' = ANY (r.permissions) ORDER BY r.name`,
    );
    assert.deepEqual(
      after.rows.map((r) => r.name),
      ["Владелец", "Начальник склада"],
    );
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
