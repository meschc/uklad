// Миграция 039 в складе, заведённом до неё: появляется роль «Продавец» без
// прав (её ставит приглашение продавца). Компании под FORCE RLS владельцу
// миграций не видны: склад узнаётся по роли начальника склада, иначе роль
// молча не появилась бы ни у кого (так и было в первой версии миграции).
// Новая компания получает ту же роль из `create_default_roles`.
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

test("склад заведён до 039 — появляется роль «Продавец» без прав", async () => {
  const name = `uklad_m039_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "039_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('До 039', true)`);
    await root.query(`INSERT INTO uklad.orgs (name, has_seller) VALUES ('Селлер', true)`);
    await apply(files.find((f) => f.startsWith("039_")));
    const seller = async (org) =>
      (
        await root.query(
          `SELECT r.permissions FROM uklad.roles r JOIN uklad.orgs o ON o.id = r.org_id
           WHERE o.name = $1 AND r.name = 'Продавец' AND r.is_default`,
          [org],
        )
      ).rows;
    assert.deepEqual(await seller("До 039"), [{ permissions: [] }]);
    assert.equal((await seller("Селлер")).length, 0);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('После 039', true)`);
    assert.deepEqual(await seller("После 039"), [{ permissions: [] }]);
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
