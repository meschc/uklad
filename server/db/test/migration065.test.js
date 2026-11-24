// Миграция 065: человек компании — всегда на складе. Старые записи без склада
// переходят на склад своей роли, иначе на первый живой склад; люди
// удалённого склада отключаются; владелец остаётся без склада.
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

test("065: без склада — только владелец, люди удалённого склада отключены", async () => {
  const name = `uklad_m065_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "065_")) await apply(f);

    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('Склад', true)`);
    const org = (await root.query(`SELECT id FROM uklad.orgs WHERE name = 'Склад'`)).rows[0].id;
    // Новый склад заводит свои роли (058) под компанией сессии.
    await root.query(`SELECT set_config('app.org_id', $1, false)`, [org]);
    await root.query(
      `INSERT INTO uklad.warehouses (org_id, ref, name, card, position) VALUES
         ($1, 'wa', 'А', '{"id":"wa"}', 0),
         ($1, 'wb', 'Б', '{"id":"wb"}', 1)`,
      [org],
    );
    const roleId = async (sql) => (await root.query(sql, [org])).rows[0].id;
    const owner = await roleId(
      `SELECT id FROM uklad.roles WHERE org_id = $1 AND 'org.manage' = ANY (permissions)`,
    );
    const chiefB = await roleId(
      `SELECT id FROM uklad.roles WHERE org_id = $1 AND name = 'Начальник склада'
         AND warehouse_ref = 'wb'`,
    );
    const member = (display, role, wh, status = "active") =>
      root.query(
        `INSERT INTO uklad.members (org_id, role_id, display_name, status, warehouse_ref)
         VALUES ($1, $2, $3, $4, $5)`,
        [org, role, display, status, wh],
      );
    await member("Владелец", owner, null);
    await member("Начальник Б", chiefB, null);
    await root.query(
      `INSERT INTO uklad.warehouses (org_id, ref, name, card, position, deleted_at)
       VALUES ($1, 'wx', 'Удалённый', '{"id":"wx"}', 2, now())`,
      [org],
    );
    // Роль без склада — как роли компании до 058 у человека без места.
    const loose = await roleId(
      `INSERT INTO uklad.roles (org_id, name, permissions) VALUES ($1, 'Старая', '{staff.view}')
       RETURNING id`,
    );
    await member("Без роли склада", loose, null);
    await member("С удалённого", loose, "wx");

    await apply(files.find((f) => f.startsWith("065_")));

    const place = async (display) =>
      (
        await root.query(
          `SELECT warehouse_ref, status FROM uklad.members WHERE org_id = $1 AND display_name = $2`,
          [org, display],
        )
      ).rows[0];
    assert.deepEqual(await place("Владелец"), { warehouse_ref: null, status: "active" });
    assert.deepEqual(await place("Начальник Б"), { warehouse_ref: "wb", status: "active" });
    assert.deepEqual(await place("Без роли склада"), { warehouse_ref: "wa", status: "active" });
    assert.equal((await place("С удалённого")).status, "disabled");

    // Дальше — как в кабинете: удалили склад Б, его люди отключены, А не задет.
    await root.query(`UPDATE uklad.warehouses SET deleted_at = now() WHERE ref = 'wb'`);
    assert.equal((await place("Начальник Б")).status, "disabled");
    assert.equal((await place("Без роли склада")).status, "active");
    assert.equal((await place("Владелец")).status, "active");
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
