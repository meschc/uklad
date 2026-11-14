// Миграция 033: у каждого раздела «смотреть» и «делать». Роли, заведённые до
// неё, получают чтение к каждому «делать»; своя роль с прежним общим
// просмотром (`stock.view`) ничего не теряет; стандартные роли рабочих
// сужаются до своей работы. Новая компания получает те же наборы.
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

test("033: права чтения по разделам", async () => {
  const name = `uklad_m033_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "033_")) await apply(f);
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('До 033', true)`);
    await root.query(`INSERT INTO uklad.orgs (name, has_seller) VALUES ('Продавец', true)`);
    const org = (await root.query(`SELECT id FROM uklad.orgs WHERE name = 'До 033'`)).rows[0].id;
    // Своя роль: просмотр склада и упаковка, и роль «только делать».
    await root.query(
      `INSERT INTO uklad.roles (org_id, name, permissions) VALUES
         ($1, 'Своя', ARRAY['stock.view','packing.do']), ($1, 'Только делать', ARRAY['picking.do'])`,
      [org],
    );
    const roles = async (name) => {
      const { rows } = await root.query(
        `SELECT r.name, r.permissions FROM uklad.roles r JOIN uklad.orgs o ON o.id = r.org_id
         WHERE o.name = $1 AND r.deleted_at IS NULL ORDER BY r.name`,
        [name],
      );
      return Object.fromEntries(rows.map((r) => [r.name, [...r.permissions].sort()]));
    };
    const m033 = files.find((f) => f.startsWith("033_"));
    await apply(m033);
    // Повтор ничего не меняет.
    const once = await roles("До 033");
    await apply(m033);
    assert.deepEqual(await roles("До 033"), once);
    const r = once;
    assert.deepEqual(r["Сборщик"], [
      "picking.do",
      "picking.view",
      "plan.view",
      "products.view",
      "stock.view",
    ]);
    assert.deepEqual(r["Упаковщик"], ["packing.do", "packing.view", "products.view", "stock.view"]);
    assert.deepEqual(r["Приёмщик"], [
      "plan.view",
      "products.view",
      "receiving.do",
      "receiving.view",
      "stock.view",
    ]);
    assert.deepEqual(r["Только делать"], ["picking.do", "picking.view"]);
    // Прежний общий просмотр сохранён по разделам.
    for (const p of ["goods.view", "receiving.view", "shipping.view", "packing.view"])
      assert.ok(r["Своя"].includes(p), p);
    assert.ok(r["Старший смены"].includes("staff.view"));
    assert.ok(!r["Старший смены"].includes("staff.manage"));
    assert.ok(!r["Кладовщик"].includes("staff.view"));
    assert.ok(r["Начальник склада"].includes("staff.view"));
    const all = (await root.query(`SELECT code FROM uklad.permissions ORDER BY code`)).rows;
    assert.deepEqual(r["Владелец"], all.map((x) => x.code).sort());
    // У продавца склад на просмотр не появляется.
    const seller = (await roles("Продавец"))["Менеджер селлера"];
    assert.ok(seller.includes("products.view"));
    assert.ok(!seller.includes("receiving.view"));
    // Новая компания: те же наборы, что у заведённой до 033.
    await root.query(`INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('После 033', true)`);
    const fresh = await roles("После 033");
    for (const name of [
      "Сборщик",
      "Упаковщик",
      "Приёмщик",
      "Кладовщик",
      "Старший смены",
      "Начальник склада",
      "Владелец",
    ])
      assert.deepEqual(fresh[name], r[name], name);
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
