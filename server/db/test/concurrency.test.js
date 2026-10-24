// Конкуренция и повтор (5а, тест 5): последнюю коробку нельзя продать дважды,
// а повтор запроса с тем же ключом не создаёт вторую бронь.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupDb, asOrg, seedWorld } from "./helpers.js";

let db, w;
before(async () => {
  db = await setupDb();
  w = await seedWorld(db.pool);
});
after(() => db.teardown());

const reserve = (stock, qty, key) =>
  asOrg(db.pool, w.A, async (c) => {
    const { rows } = await c.query(`SELECT uklad.reserve($1, $2, $3) AS id`, [stock, qty, key]);
    return rows[0].id;
  });

test("20 параллельных броней последней штуки — ровно одна удачная", async () => {
  // st3: одна штука товара без владельца.
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) => reserve(w.a.st3, 1, `race-key-${i}`)),
  );
  const ok = results.filter((r) => r.status === "fulfilled");
  assert.equal(ok.length, 1);
  for (const r of results.filter((r) => r.status === "rejected")) {
    assert.match(r.reason.message, /not enough stock/);
  }
  const { rows } = await db.root.query(`SELECT qty, reserved FROM uklad.stock WHERE id = $1`, [
    w.a.st3,
  ]);
  assert.deepEqual(rows[0], { qty: 1, reserved: 1 });
});

test("повтор с тем же ключом возвращает ту же бронь, и параллельно тоже", async () => {
  const first = await reserve(w.a.st1, 2, "repeat-key-1");
  const again = await Promise.all(
    Array.from({ length: 10 }, () => reserve(w.a.st1, 2, "repeat-key-1")),
  );
  assert.ok(again.every((id) => id === first));
  const { rows } = await db.root.query(`SELECT reserved FROM uklad.stock WHERE id = $1`, [w.a.st1]);
  assert.equal(rows[0].reserved, 2);
});

test("чужой остаток забронировать нельзя", async () => {
  await assert.rejects(
    asOrg(db.pool, w.B, (c) => c.query(`SELECT uklad.reserve($1, 1, 'foreign-key-1')`, [w.a.st2])),
    /stock not found/,
  );
});

test("журнал остатков пишется сам и подписан сотрудником; руками в него не писать", async () => {
  const member = "0192f000-0000-7000-8000-000000000001";
  await asOrg(
    db.pool,
    w.A,
    (c) => c.query(`UPDATE uklad.stock SET qty = 4 WHERE id = $1`, [w.a.st2]),
    member,
  );
  await asOrg(db.pool, w.A, async (c) => {
    const { rows } = await c.query(
      `SELECT op, member_id, old_row->>'qty' AS was, new_row->>'qty' AS now
       FROM uklad.stock_log WHERE row_id = $1 ORDER BY at DESC LIMIT 1`,
      [w.a.st2],
    );
    assert.deepEqual(rows[0], { op: "UPDATE", member_id: member, was: "5", now: "4" });
    await assert.rejects(
      c.query(
        `INSERT INTO uklad.stock_log (org_id, table_name, row_id, op, new_row) VALUES ($1, 'stock', $2, 'UPDATE', '{}')`,
        [w.A, w.a.st2],
      ),
      /permission denied/,
    );
  });
  // Журнал склада А складу Б не виден.
  await asOrg(db.pool, w.B, async (c) => {
    const { rowCount } = await c.query(`SELECT 1 FROM uklad.stock_log WHERE org_id = $1`, [w.A]);
    assert.equal(rowCount, 0);
  });
});
