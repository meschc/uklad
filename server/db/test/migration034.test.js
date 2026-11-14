// Миграция 034 у тех, кто принял приглашение до неё: склад и карточку
// находим по почте входа среди карточек сотрудников. Неоднозначное не
// угадываем. Компания с одним складом — склад у всех, кому не назначен.
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

test("до 034: склад и карточка — по почте, иначе склад единственный", async () => {
  const name = `uklad_m034_${randomBytes(4).toString("hex")}`;
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
    for (const f of files.filter((f) => f < "034_")) await apply(f);
    const org = async (title, data) => {
      const o = (
        await root.query(
          `INSERT INTO uklad.orgs (name, has_warehouse) VALUES ($1, true) RETURNING id`,
          [title],
        )
      ).rows[0].id;
      await root.query(
        `INSERT INTO uklad.cabinet_snapshots (org_id, format, data) VALUES ($1, 8, $2)`,
        [o, data],
      );
      return o;
    };
    const member = async (o, email) => {
      const a = (
        await root.query(
          `INSERT INTO auth.accounts (email, password_hash, email_verified_at)
           VALUES ($1, 'x', now()) RETURNING id`,
          [email],
        )
      ).rows[0].id;
      return (
        await root.query(
          `INSERT INTO uklad.members (org_id, account_id, role_id, status)
           SELECT $1, $2, id, 'active' FROM uklad.roles WHERE org_id = $1 AND name = 'Кладовщик'
           RETURNING id`,
          [o, a],
        )
      ).rows[0].id;
    };
    const two = await org("Два склада", {
      warehouse: { id: "wh-b", name: "Логопарк", staff: [{ id: "s-e", email: "e@x.ru" }] },
      otherWarehouses: [
        {
          id: "wh-a",
          name: "Складская 5",
          staff: [
            { id: "s-k", email: "Kirill@X.ru" },
            { id: "s-d1", email: "dup@x.ru" },
            { id: "s-d2", email: "dup@x.ru" },
          ],
        },
      ],
    });
    const one = await org("Один склад", { warehouse: { id: "wh-1", name: "Склад", staff: [] } });
    const kirill = await member(two, "kirill@x.ru");
    const dup = await member(two, "dup@x.ru");
    const stranger = await member(two, "nobody@x.ru");
    const single = await member(one, "single@x.ru");
    await apply(files.find((f) => f.startsWith("034_")));
    const place = async (id) =>
      (await root.query(`SELECT warehouse_ref, staff_ref FROM uklad.members WHERE id = $1`, [id]))
        .rows[0];
    // Почта входа совпала с карточкой на «Складской 5» — туда, а не в открытый «Логопарк».
    assert.deepEqual(await place(kirill), { warehouse_ref: "wh-a", staff_ref: "s-k" });
    // Две карточки с одной почтой — не угадываем.
    assert.deepEqual(await place(dup), { warehouse_ref: null, staff_ref: null });
    assert.deepEqual(await place(stranger), { warehouse_ref: null, staff_ref: null });
    // Склад один — он и есть склад.
    assert.deepEqual(await place(single), { warehouse_ref: "wh-1", staff_ref: null });
    // RLS снова закрыта для владельца таблиц.
    const { rows } = await root.query(
      `SELECT relname, relforcerowsecurity FROM pg_class
       WHERE relname IN ('members', 'cabinet_snapshots') AND relnamespace = 'uklad'::regnamespace`,
    );
    assert.ok(rows.length === 2 && rows.every((r) => r.relforcerowsecurity));
  } finally {
    await c.end();
    await root.end();
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  }
});
