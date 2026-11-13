// Миграция 028 в компании, где бейджи выдали до неё: стол теперь пускает
// только с ролью, поэтому живому бейджу без роли миграция даёт «Кладовщика».
// Таблицы закрыты FORCE RLS, а `current_org` в миграции пуст — без снятия
// защиты INSERT молча не нашёл бы ни одного бейджа, и утром склад встал бы.
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

test("бейджи выданы до 028 — без роли получают «Кладовщика», остальное не трогаем", async () => {
  const name = `uklad_m028_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "028_")) await apply(f);
    const org = (
      await root.query(
        `INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('До 028', true) RETURNING id`,
      )
    ).rows[0].id;
    const role = async (n) =>
      (await root.query(`SELECT id FROM uklad.roles WHERE org_id = $1 AND name = $2`, [org, n]))
        .rows[0].id;
    const badge = (ref, revoked = false) =>
      root.query(
        `INSERT INTO uklad.desk_badges (org_id, staff_ref, secret_hash, revoked_at)
         VALUES ($1, $2, $3, $4)`,
        [org, ref, randomBytes(32), revoked ? new Date() : null],
      );
    await badge("stf-new");
    await badge("stf-recv");
    await badge("stf-gone", true);
    await badge("stf-cleared");
    await root.query(
      `INSERT INTO uklad.desk_staff_roles (org_id, staff_ref, role_id) VALUES
       ($1, 'stf-recv', $2), ($1, 'stf-cleared', NULL)`,
      [org, await role("Приёмщик")],
    );
    await apply(files.find((f) => f.startsWith("028_")));
    const { rows } = await root.query(
      `SELECT d.staff_ref, r.name FROM uklad.desk_staff_roles d
       LEFT JOIN uklad.roles r ON r.id = d.role_id ORDER BY d.staff_ref`,
    );
    assert.deepEqual(Object.fromEntries(rows.map((x) => [x.staff_ref, x.name])), {
      "stf-cleared": "Кладовщик",
      "stf-new": "Кладовщик",
      "stf-recv": "Приёмщик",
    });
    // Защита строк вернулась на место.
    const { rows: force } = await root.query(
      `SELECT relname FROM pg_class WHERE relname IN ('desk_staff_roles', 'desk_badges', 'roles')
       AND relforcerowsecurity ORDER BY relname`,
    );
    assert.deepEqual(
      force.map((x) => x.relname),
      ["desk_badges", "desk_staff_roles", "roles"],
    );
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
