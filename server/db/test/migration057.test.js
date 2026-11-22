// Миграция 057: набор ролей к запуску. Приёмщик, сборщик и упаковщик гаснут,
// если никому не даны, и остаются у того, кому даны; «Менеджер селлера» —
// «Продавец»; у каждого склада есть «Старший участка». Роль владельца из
// кабинета не дать никому — ни человеку, ни сотруднику у стола.
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

test("057: роли к запуску и замок на роли владельца", async () => {
  const name = `uklad_m057_${randomBytes(4).toString("hex")}`;
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
  // Миграции — под владельцем таблиц, как в бою: суперпользователь обошёл бы RLS.
  const c = new pg.Client({ connectionString: url("uklad_owner") });
  const root = new pg.Client({ connectionString: url() });
  await c.connect();
  await root.connect();
  try {
    const files = readdirSync(DIR)
      .filter((f) => /^\d{3}_.+\.sql$/.test(f))
      .sort();
    const apply = async (f) => c.query(readFileSync(DIR + f, "utf8"));
    for (const f of files.filter((f) => f < "057_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('Склад', true)`);
    await root.query(`INSERT INTO uklad.orgs (name, has_seller) VALUES ('Селлер', true)`);
    const org = (await root.query(`SELECT id FROM uklad.orgs WHERE name = 'Склад'`)).rows[0].id;
    const roleId = async (orgId, role) =>
      (
        await root.query(
          `SELECT id FROM uklad.roles WHERE org_id = $1 AND name = $2 AND deleted_at IS NULL`,
          [orgId, role],
        )
      ).rows[0]?.id;
    // Приёмщик дан человеку, сборщик — сотруднику у стола, упаковщик — никому.
    await root.query(
      `INSERT INTO uklad.members (org_id, role_id, display_name, status)
       VALUES ($1, $2, 'Анна', 'active')`,
      [org, await roleId(org, "Приёмщик")],
    );
    await root.query(
      `INSERT INTO uklad.desk_staff_roles (org_id, staff_ref, role_id) VALUES ($1, 'stf-1', $2)`,
      [org, await roleId(org, "Сборщик")],
    );
    // Ждущее приглашение на роль владельца, заведённое до 057.
    await root.query(
      `INSERT INTO uklad.members (org_id, role_id, display_name, status)
       VALUES ($1, $2, 'Второй владелец', 'invited')`,
      [org, await roleId(org, "Владелец")],
    );
    for (const f of files.filter((f) => f >= "057_")) await apply(f);
    const second = await root.query(
      `SELECT status, deleted_at FROM uklad.members WHERE display_name = 'Второй владелец'`,
    );
    assert.equal(second.rows[0].status, "expired");
    assert.ok(second.rows[0].deleted_at);

    const names = async (orgName) =>
      (
        await root.query(
          `SELECT r.name FROM uklad.roles r JOIN uklad.orgs o ON o.id = r.org_id
           WHERE o.name = $1 AND r.deleted_at IS NULL ORDER BY r.name`,
          [orgName],
        )
      ).rows.map((r) => r.name);
    assert.deepEqual(await names("Склад"), [
      "Владелец",
      "Кладовщик / оператор",
      "Начальник склада",
      "Приёмщик",
      "Продавец",
      "Сборщик",
      "Старший смены",
      "Старший участка",
    ]);
    assert.deepEqual(await names("Селлер"), ["Владелец", "Продавец"]);
    // Старший участка — как старший смены, но без персонала.
    const perms = async (role) =>
      (
        await root.query(`SELECT permissions FROM uklad.roles WHERE org_id = $1 AND name = $2`, [
          org,
          role,
        ])
      ).rows[0].permissions.sort();
    const area = await perms("Старший участка");
    const shift = await perms("Старший смены");
    assert.ok(area.includes("goods.decide"));
    assert.ok(!area.some((p) => p.startsWith("staff.")));
    assert.deepEqual(
      area,
      shift.filter((p) => p !== "staff.view"),
    );

    // Новая компания получает тот же набор, что и заведённая до 057.
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('Новый', true)`);
    assert.deepEqual(await names("Новый"), [
      "Владелец",
      "Кладовщик / оператор",
      "Начальник склада",
      "Продавец",
      "Старший смены",
      "Старший участка",
    ]);

    // Роль владельца: с вошедшим — отказ, без него (регистрация, поддержка) — можно.
    const owner = await roleId(org, "Владелец");
    const anna = (await root.query(`SELECT id FROM uklad.members WHERE display_name = 'Анна'`))
      .rows[0].id;
    await root.query(`BEGIN`);
    await root.query(
      `SELECT set_config('app.member_id', $1, true), set_config('app.org_id', $2, true)`,
      [anna, org],
    );
    await assert.rejects(
      root.query(`UPDATE uklad.members SET role_id = $1 WHERE id = $2`, [owner, anna]),
      /team:owner_role/,
    );
    await root.query(`ROLLBACK`);
    await root.query(`BEGIN`);
    await root.query(
      `SELECT set_config('app.member_id', $1, true), set_config('app.org_id', $2, true)`,
      [anna, org],
    );
    await assert.rejects(
      root.query(`UPDATE uklad.desk_staff_roles SET role_id = $1 WHERE staff_ref = 'stf-1'`, [
        owner,
      ]),
      /team:owner_role/,
    );
    await root.query(`ROLLBACK`);
    await root.query(`UPDATE uklad.members SET role_id = $1 WHERE id = $2`, [owner, anna]);
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
