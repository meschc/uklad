// Миграция 032 в складе, заведённом до неё: появляется стандартная роль
// «Старший смены» — решает по товару, но списание не подтверждает. Роли
// закрыты FORCE RLS: без снятия защиты INSERT не прошёл бы. Новая компания
// получает ту же роль из `create_default_roles`.
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

test("склад заведён до 032 — появляется роль «Старший смены»", async () => {
  const name = `uklad_m032_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "032_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('До 032', true)`);
    await root.query(`INSERT INTO uklad.orgs (name, has_seller) VALUES ('Продавец', true)`);
    await apply(files.find((f) => f.startsWith("032_")));
    // Повтор не плодит вторую роль.
    await apply(files.find((f) => f.startsWith("032_")));
    const lead = async (org) =>
      (
        await root.query(
          `SELECT r.permissions FROM uklad.roles r JOIN uklad.orgs o ON o.id = r.org_id
           WHERE o.name = $1 AND r.name = 'Старший смены' AND r.is_default`,
          [org],
        )
      ).rows;
    const before = await lead("До 032");
    assert.equal(before.length, 1);
    assert.ok(before[0].permissions.includes("goods.decide"));
    assert.ok(!before[0].permissions.includes("goods.writeoff"));
    assert.ok(!before[0].permissions.includes("staff.manage"));
    assert.equal((await lead("Продавец")).length, 0);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('После 032', true)`);
    const after = await lead("После 032");
    assert.equal(after.length, 1);
    assert.deepEqual(after[0].permissions, before[0].permissions);
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
