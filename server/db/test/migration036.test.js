// Миграция 036: роль приложения заводит временные таблицы на базе с правами
// как в бою (`init.sql` отнимает у PUBLIC всё). Без неё `save_products` (013)
// падала «permission denied to create temporary tables», и кабинет с
// товарами на сервере не сохранялся.
import test from "node:test";
import assert from "node:assert/strict";
import { setupDb, asOrg, createOrg } from "./helpers.js";

test("036: товары сохраняются ролью приложения, лишнего права ни у кого", async () => {
  const db = await setupDb();
  try {
    const may = async (role, what) =>
      (
        await db.root.query(`SELECT has_database_privilege($1, current_database(), $2) AS ok`, [
          role,
          what,
        ])
      ).rows[0].ok;
    // Стенд повторяет бой: PUBLIC без прав, у рассылки только вход.
    assert.equal(await may("public", "TEMPORARY"), false);
    assert.equal(await may("uklad_notifier", "TEMPORARY"), false);
    assert.equal(await may("uklad_app", "TEMPORARY"), true);
    assert.equal(await may("uklad_app", "CREATE"), false);

    const org = await createOrg(db.pool, { name: "Склад", warehouse: true });
    const cards = [{ id: "pr1", sku: "A-1", name: "Кружка" }];
    await asOrg(db.pool, org, (c) =>
      c.query(`SELECT uklad.save_products($1::jsonb)`, [JSON.stringify(cards)]),
    );
    const saved = await asOrg(db.pool, org, (c) => c.query(`SELECT uklad.load_products() AS list`));
    assert.deepEqual(
      saved.rows[0].list.map((p) => p.id),
      ["pr1"],
    );
  } finally {
    await db.teardown();
  }
});
