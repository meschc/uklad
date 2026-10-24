// Миграции схемы: файлы `migrations/NNN_*.sql` по порядку имени, каждый в
// своей транзакции, каждый ровно один раз.
//
//   DATABASE_URL=postgres://uklad_owner:…@localhost/uklad npm run migrate
//
// Запускается под владельцем таблиц (uklad_owner), а не под ролью приложения:
// приложение схему не меняет (5а, правило 3). Миграции только вперёд — файл,
// уже применённый в бою, не правят, а пишут следующий (раздел 5, п.4).
/* global process, console */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Применяет недостающие миграции. Возвращает имена применённых. */
export async function migrate(client) {
  // Учёт миграций — вне схемы `uklad`: это служебная таблица без компании.
  await client.query(`CREATE SCHEMA IF NOT EXISTS meta`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS meta.migrations (
       name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  const done = new Set(
    (await client.query(`SELECT name FROM meta.migrations`)).rows.map((r) => r.name),
  );
  const files = readdirSync(DIR)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();
  const applied = [];
  for (const name of files) {
    if (done.has(name)) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(DIR, name), "utf8"));
      await client.query(`INSERT INTO meta.migrations (name) VALUES ($1)`, [name]);
      await client.query("COMMIT");
      applied.push(name);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Миграция ${name} не применена: ${err.message}`, { cause: err });
    }
  }
  return applied;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const applied = await migrate(client);
    console.log(applied.length ? `Применено: ${applied.join(", ")}` : "Схема актуальна.");
  } finally {
    await client.end();
  }
}
