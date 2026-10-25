// Нет таблиц без владельца (5а, тест 3). Тест обходит схему `uklad` и падает,
// если новая таблица забыла `org_id NOT NULL`, RLS или FORCE, — а с ней и CI.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupDb } from "./helpers.js";

// Справочники без компании. Добавлять сюда — только с объяснением в ревью.
const REFERENCE = new Set(["permissions"]);

let db;
before(async () => {
  db = await setupDb();
});
after(() => db.teardown());

test("у каждой таблицы uklad есть org_id NOT NULL, RLS и FORCE", async () => {
  const { rows } = await db.root.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
           a.attnotnull AS org_not_null
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'uklad'
    LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
    WHERE c.relkind IN ('r', 'p')`);
  assert.ok(rows.length >= 9, "таблицы не найдены — схема не применилась?");
  for (const t of rows) {
    if (REFERENCE.has(t.name)) continue;
    assert.equal(t.org_not_null, true, `${t.name}: нет org_id NOT NULL`);
    assert.equal(t.rls, true, `${t.name}: RLS выключен`);
    assert.equal(t.force, true, `${t.name}: нет FORCE ROW LEVEL SECURITY`);
  }
});

test("роль приложения не владеет таблицами и не обходит RLS", async () => {
  const { rows } = await db.root.query(
    `SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'uklad_app'`,
  );
  assert.deepEqual(rows[0], { rolbypassrls: false, rolsuper: false });
  const owned = await db.root.query(`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('uklad', 'auth') AND pg_get_userbyid(c.relowner) = 'uklad_app'`);
  assert.equal(owned.rowCount, 0);
});

test("у роли приложения нет DELETE ни на одной таблице", async () => {
  const { rows } = await db.root.query(`
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'uklad_app' AND privilege_type IN ('DELETE', 'TRUNCATE')`);
  assert.deepEqual(rows, []);
});

test("SECURITY DEFINER функции с жёстким search_path", async () => {
  const { rows } = await db.root.query(`
    SELECT p.proname, p.proconfig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname IN ('uklad', 'auth')
    WHERE p.prosecdef`);
  for (const f of rows) {
    assert.ok(
      (f.proconfig ?? []).some((s) => s.startsWith("search_path=")),
      `${f.proname}: SECURITY DEFINER без search_path`,
    );
  }
});

test("UUIDv7: версия 7 и порядок по времени", async () => {
  const { rows } = await db.root.query(
    `SELECT uklad.uuid_v7()::text AS a, pg_sleep(0.002), uklad.uuid_v7()::text AS b`,
  );
  assert.equal(rows[0].a[14], "7");
  assert.ok(rows[0].a < rows[0].b);
});
