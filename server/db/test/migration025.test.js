// Миграция 025 в компании, заведённой до неё: роли по умолчанию получают право
// пересчёта. Роли закрыты FORCE RLS, а `current_org` в миграции пуст — без
// снятия защиты UPDATE молча обновил бы ноль строк, и стол отклонял бы
// пересчёт у всех, кому назначена роль.
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

test("компания создана до 025 — после миграции владелец, начальник и кладовщик считают", async () => {
  const name = `uklad_m025_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "025_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('До 025', true)`);
    await apply(files.find((f) => f.startsWith("025_")));
    const { rows } = await root.query(
      `SELECT name, 'inventory.count' = ANY (permissions) AS can FROM uklad.roles ORDER BY name`,
    );
    const can = Object.fromEntries(rows.map((r) => [r.name, r.can]));
    assert.equal(can["Владелец"], true);
    assert.equal(can["Начальник склада"], true);
    assert.equal(can["Кладовщик"], true);
    assert.equal(can["Приёмщик"], false);
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
