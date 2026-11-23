// Миграция 064: удалённый сотрудник забывается сразу — без имени, телефона,
// почты и фото; сотрудники удалённого склада удаляются с ним; удаление — в
// журнал действий.
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

test("064: удалённый сотрудник обезличен сразу, удаление в журнале", async () => {
  const name = `uklad_m064_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "065_")) await c.query(readFileSync(DIR + f, "utf8"));
    const org = (
      await root.query(
        `INSERT INTO uklad.orgs (name, has_warehouse) VALUES ('Склад', true) RETURNING id`,
      )
    ).rows[0].id;
    const man = (id, name) => ({
      id,
      name,
      role: "Кладовщик",
      phone: "+70000000000",
      email: `${id}@example.test`,
      photoUrl: "https://example.test/p.jpg",
      hourlyRate: 300,
    });
    const save = async (cards) => {
      await root.query("BEGIN");
      await root.query(`SELECT set_config('app.org_id', $1, true)`, [org]);
      await root.query(`SELECT uklad.save_warehouses($1::jsonb)`, [JSON.stringify(cards)]);
      await root.query("COMMIT");
    };
    const rows = async (sql) => (await root.query(sql)).rows;
    await save([
      { id: "wa", name: "А", staff: [man("s1", "Иван"), man("s2", "Пётр")] },
      { id: "wb", name: "Б", staff: [man("s3", "Анна")] },
    ]);
    // s1 удалили со склада, склад wb удалили целиком.
    await save([{ id: "wa", name: "А", staff: [man("s2", "Пётр")] }]);
    const staff = await rows(
      `SELECT ref, name, card, deleted_at IS NOT NULL AS gone FROM uklad.staff ORDER BY ref`,
    );
    const forgotten = { role: "Кладовщик", hourlyRate: 300 };
    assert.deepEqual(staff, [
      { ref: "s1", name: null, card: { id: "s1", ...forgotten }, gone: true },
      { ref: "s2", name: "Пётр", card: man("s2", "Пётр"), gone: false },
      { ref: "s3", name: null, card: { id: "s3", ...forgotten }, gone: true },
    ]);
    assert.deepEqual(
      await rows(
        `SELECT warehouse_ref, action, target, source FROM uklad.audit_events ORDER BY target`,
      ),
      [
        { warehouse_ref: "wa", action: "staff.delete", target: "s1", source: "system" },
        { warehouse_ref: "wb", action: "staff.delete", target: "s3", source: "system" },
      ],
    );
    // Урезанный список после сбоя: убрать 3 из 4 живых разом нельзя — люди и
    // имена на месте.
    await save([
      {
        id: "wa",
        name: "А",
        staff: [man("s2", "Пётр"), man("s4", "Ольга"), man("s5", "Олег"), man("s6", "Юрий")],
      },
    ]);
    await assert.rejects(
      save([{ id: "wa", name: "А", staff: [man("s2", "Пётр")] }]),
      (err) => err.code === "UK001",
    );
    await root.query("ROLLBACK");
    assert.deepEqual(
      await rows(`SELECT ref, name FROM uklad.staff WHERE deleted_at IS NULL ORDER BY ref`),
      [
        { ref: "s2", name: "Пётр" },
        { ref: "s4", name: "Ольга" },
        { ref: "s5", name: "Олег" },
        { ref: "s6", name: "Юрий" },
      ],
    );
    // Двоих из четырёх — можно: это работа, а не сбой.
    await save([{ id: "wa", name: "А", staff: [man("s2", "Пётр"), man("s4", "Ольга")] }]);
    // Вернули — кабинет прислал карточку заново, строка поднялась целиком.
    await save([
      { id: "wa", name: "А", staff: [man("s1", "Иван"), man("s2", "Пётр"), man("s4", "Ольга")] },
    ]);
    const back = await rows(`SELECT name, card, deleted_at FROM uklad.staff WHERE ref = 's1'`);
    assert.deepEqual(back, [{ name: "Иван", card: man("s1", "Иван"), deleted_at: null }]);
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
