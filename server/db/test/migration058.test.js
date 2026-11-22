// Миграция 058: роли у каждого склада свои. Первый склад забирает роли
// компании, второй получает копии; люди и сотрудники у стола переходят на
// роль своего склада; владелец и продавец — роли компании. Новый склад
// получает набор по умолчанию, перевод человека берёт роль того же имени.
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

test("058: роли у каждого склада свои", async () => {
  const name = `uklad_m058_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "058_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('Склад', true)`);
    const org = (await root.query(`SELECT id FROM uklad.orgs WHERE name = 'Склад'`)).rows[0].id;
    await root.query(
      `INSERT INTO uklad.warehouses (org_id, ref, name, card, position) VALUES
         ($1, 'wa', 'А', '{"id":"wa","staff":[{"id":"stf-a"}]}', 0),
         ($1, 'wb', 'Б', '{"id":"wb","staff":[{"id":"stf-b"}]}', 1)`,
      [org],
    );
    const old = async (role) =>
      (
        await root.query(
          `SELECT id FROM uklad.roles WHERE org_id = $1 AND name = $2 AND deleted_at IS NULL`,
          [org, role],
        )
      ).rows[0].id;
    const test1 = (
      await root.query(
        `INSERT INTO uklad.roles (org_id, name, permissions) VALUES ($1, 'Тест', '{stock.view}')
         RETURNING id`,
        [org],
      )
    ).rows[0].id;
    const chief = await old("Начальник склада");
    await root.query(
      `INSERT INTO uklad.members (org_id, role_id, display_name, status, warehouse_ref) VALUES
         ($1, $2, 'Анна', 'active', 'wb'), ($1, $2, 'Борис', 'active', 'wa')`,
      [org, chief],
    );
    await root.query(
      `INSERT INTO uklad.desk_staff_roles (org_id, staff_ref, role_id) VALUES
         ($1, 'stf-b', $2), ($1, 'stf-a', $3)`,
      [org, await old("Кладовщик / оператор"), test1],
    );
    await apply("058_roles_per_warehouse.sql");

    const roles = async (wh) =>
      (
        await root.query(
          `SELECT name FROM uklad.roles WHERE org_id = $1 AND deleted_at IS NULL
             AND warehouse_ref IS NOT DISTINCT FROM $2 ORDER BY name`,
          [org, wh],
        )
      ).rows.map((r) => r.name);
    const set = [
      "Кладовщик / оператор",
      "Начальник склада",
      "Старший смены",
      "Старший участка",
      "Тест",
    ];
    assert.deepEqual(await roles("wa"), set);
    assert.deepEqual(await roles("wb"), set);
    assert.deepEqual(await roles(null), ["Владелец", "Продавец"]);
    // У первого склада — те же id, у второго — копии; люди и столы — на своём складе.
    const whOf = async (sql, params) =>
      (await root.query(`SELECT r.warehouse_ref FROM uklad.roles r WHERE r.id = (${sql})`, params))
        .rows[0].warehouse_ref;
    assert.equal(await whOf(`SELECT $1::uuid`, [chief]), "wa");
    assert.equal(await whOf(`SELECT role_id FROM uklad.members WHERE display_name = 'Анна'`), "wb");
    assert.equal(
      await whOf(`SELECT role_id FROM uklad.members WHERE display_name = 'Борис'`),
      "wa",
    );
    assert.equal(
      await whOf(`SELECT role_id FROM uklad.desk_staff_roles WHERE staff_ref = 'stf-b'`),
      "wb",
    );
    assert.equal(
      await whOf(`SELECT role_id FROM uklad.desk_staff_roles WHERE staff_ref = 'stf-a'`),
      "wa",
    );
    // Роль у стола по умолчанию — по отметке на каждом складе.
    const desk = await root.query(
      `SELECT warehouse_ref FROM uklad.roles WHERE org_id = $1 AND desk_default ORDER BY 1`,
      [org],
    );
    assert.deepEqual(
      desk.rows.map((r) => r.warehouse_ref),
      ["wa", "wb"],
    );

    // Дальше — как в кабинете: компания вошедшего в сессии (RLS).
    await root.query(`SELECT set_config('app.org_id', $1, false)`, [org]);
    // Новый склад — свой набор по умолчанию.
    await root.query(
      `INSERT INTO uklad.warehouses (org_id, ref, name, position) VALUES ($1, 'wc', 'В', 2)`,
      [org],
    );
    assert.deepEqual(
      await roles("wc"),
      set.filter((n) => n !== "Тест"),
    );
    // Роль склада А человеку склада Б — отказ; перевод на склад В — роль того же имени там.
    await assert.rejects(
      root.query(`UPDATE uklad.members SET role_id = $1 WHERE display_name = 'Анна'`, [chief]),
      /team:role_warehouse/,
    );
    await root.query(`UPDATE uklad.members SET warehouse_ref = 'wc' WHERE display_name = 'Анна'`);
    assert.equal(await whOf(`SELECT role_id FROM uklad.members WHERE display_name = 'Анна'`), "wc");
    await assert.rejects(
      root.query(`UPDATE uklad.desk_staff_roles SET role_id = $1 WHERE staff_ref = 'stf-b'`, [
        chief,
      ]),
      /team:role_warehouse/,
    );
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
