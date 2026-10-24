// Изоляция компаний в самой базе (5а, тесты 2 и 4): прямой SQL под ролью
// приложения. Если здесь что-то видно лишнее, никакая проверка в коде экрана
// уже не спасёт.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupDb, asOrg, seedWorld } from "./helpers.js";

const TABLES = [
  "orgs",
  "roles",
  "members",
  "warehouses",
  "contracts",
  "products",
  "stock",
  "reservations",
  "stock_log",
];

let db, w;
before(async () => {
  db = await setupDb();
  w = await seedWorld(db.pool);
});
after(() => db.teardown());

const ids = async (c, table) =>
  (await c.query(`SELECT id FROM uklad.${table} ORDER BY id`)).rows.map((r) => r.id);

test("без app.org_id ни одна таблица не отдаёт ни строки", async () => {
  await asOrg(db.pool, null, async (c) => {
    for (const t of TABLES) {
      const { rows } = await c.query(`SELECT count(*)::int AS n FROM uklad.${t}`);
      assert.equal(rows[0].n, 0, t);
    }
  });
});

test("app.org_id живёт только до конца транзакции", async () => {
  await asOrg(db.pool, w.A, async () => {});
  // Следующая транзакция на том же пуле: компании уже нет.
  const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM uklad.products`);
  assert.equal(rows[0].n, 0);
});

test("склад Б не видит ни одной строки склада А", async () => {
  await asOrg(db.pool, w.B, async (c) => {
    assert.deepEqual(await ids(c, "orgs"), [w.B]);
    assert.deepEqual(await ids(c, "warehouses"), [w.b.wh]);
    assert.deepEqual(await ids(c, "products"), [w.b.p]);
    assert.deepEqual(await ids(c, "stock"), [w.b.st]);
    assert.deepEqual(await ids(c, "contracts"), []);
    // Поиск по чужому ID — пусто, а не ошибка: снаружи это 404.
    const { rowCount } = await c.query(`SELECT 1 FROM uklad.products WHERE id = $1`, [w.a.p1]);
    assert.equal(rowCount, 0);
  });
});

test("чужую строку нельзя изменить, а данные остаются целы", async () => {
  await asOrg(db.pool, w.B, async (c) => {
    const r1 = await c.query(`UPDATE uklad.products SET name = 'взлом' WHERE id = $1`, [w.a.p1]);
    const r2 = await c.query(`UPDATE uklad.stock SET qty = 0 WHERE id = $1`, [w.a.st1]);
    const r3 = await c.query(`UPDATE uklad.orgs SET name = 'взлом' WHERE id = $1`, [w.A]);
    assert.deepEqual([r1.rowCount, r2.rowCount, r3.rowCount], [0, 0, 0]);
  });
  const { rows } = await db.root.query(
    `SELECT p.name, s.qty FROM uklad.products p JOIN uklad.stock s ON s.product_id = p.id WHERE p.id = $1`,
    [w.a.p1],
  );
  assert.deepEqual(rows[0], { name: "S1-001", qty: 5 });
});

test("запись с чужим org_id не вставится", async () => {
  await assert.rejects(
    asOrg(db.pool, w.B, (c) =>
      c.query(`INSERT INTO uklad.products (org_id, sku, name) VALUES ($1, 'X', 'X')`, [w.A]),
    ),
    /row-level security/,
  );
});

test("составной ключ: своя строка не сошлётся на чужую", async () => {
  // Б кладёт остаток со своим org_id, но на товар склада А.
  await assert.rejects(
    asOrg(db.pool, w.B, (c) =>
      c.query(
        `INSERT INTO uklad.stock (org_id, warehouse_id, product_id, cell, qty) VALUES ($1, $2, $3, 'B-1', 1)`,
        [w.B, w.b.wh, w.a.p1],
      ),
    ),
    /row-level security|foreign key/,
  );
});

test("удаления у приложения нет: только deleted_at", async () => {
  await assert.rejects(
    asOrg(db.pool, w.A, (c) => c.query(`DELETE FROM uklad.products WHERE id = $1`, [w.a.p3])),
    /permission denied/,
  );
});

test("учётные записи входа приложению недоступны", async () => {
  await assert.rejects(db.pool.query(`SELECT * FROM auth.accounts`), /permission denied/);
});

test("селлер видит только свой товар и свой остаток", async () => {
  for (const [seller, product, stock] of [
    [w.S1, w.a.p1, w.a.st1],
    [w.S2, w.a.p2, w.a.st2],
  ]) {
    await asOrg(db.pool, seller, async (c) => {
      assert.deepEqual(await ids(c, "products"), [product]);
      assert.deepEqual(await ids(c, "stock"), [stock]);
      // Склад, с которым договор, виден; чужой склад — нет.
      assert.deepEqual(await ids(c, "warehouses"), [w.a.wh]);
    });
  }
});

test("товар без владельца не видит ни один селлер", async () => {
  for (const seller of [w.S1, w.S2, w.X]) {
    await asOrg(db.pool, seller, async (c) => {
      const { rowCount } = await c.query(`SELECT 1 FROM uklad.products WHERE id = $1`, [w.a.p3]);
      assert.equal(rowCount, 0);
    });
  }
});

test("селлер без договора не видит ничего у склада", async () => {
  await asOrg(db.pool, w.X, async (c) => {
    assert.deepEqual(await ids(c, "products"), []);
    assert.deepEqual(await ids(c, "stock"), []);
    assert.deepEqual(await ids(c, "warehouses"), []);
    assert.deepEqual(await ids(c, "orgs"), [w.X]);
  });
});

test("селлер не правит товар и остаток склада", async () => {
  await asOrg(db.pool, w.S1, async (c) => {
    const r1 = await c.query(`UPDATE uklad.products SET name = 'x' WHERE id = $1`, [w.a.p1]);
    const r2 = await c.query(`UPDATE uklad.stock SET qty = 99 WHERE id = $1`, [w.a.st1]);
    assert.deepEqual([r1.rowCount, r2.rowCount], [0, 0]);
  });
});

test("склад не назначит товар селлеру без договора", async () => {
  await assert.rejects(
    asOrg(db.pool, w.A, (c) =>
      c.query(`UPDATE uklad.products SET seller_org_id = $1 WHERE id = $2`, [w.X, w.a.p3]),
    ),
    /row-level security/,
  );
});

test("договор закрыт — товар скрыт от обеих сторон, история цела", async () => {
  await asOrg(db.pool, w.A, (c) =>
    c.query(`UPDATE uklad.contracts SET status = 'closed', closed_at = now() WHERE id = $1`, [
      w.a.c1,
    ]),
  );
  await asOrg(db.pool, w.S1, async (c) => {
    assert.deepEqual(await ids(c, "products"), []);
    assert.deepEqual(await ids(c, "stock"), []);
    // Сам договор стороне виден и закрытым — это история.
    assert.equal((await ids(c, "contracts")).length, 1);
  });
  await asOrg(db.pool, w.A, async (c) => {
    const visible = await ids(c, "products");
    assert.ok(!visible.includes(w.a.p1));
    assert.ok(visible.includes(w.a.p2));
  });
  const { rows } = await db.root.query(`SELECT qty FROM uklad.stock WHERE id = $1`, [w.a.st1]);
  assert.equal(rows[0].qty, 5);
  // Вернули договор — всё снова на месте.
  await asOrg(db.pool, w.A, (c) =>
    c.query(
      `INSERT INTO uklad.contracts (org_id, warehouse_id, seller_org_id) VALUES ($1, $2, $3)`,
      [w.A, w.a.wh, w.S1],
    ),
  );
  await asOrg(db.pool, w.S1, async (c) => {
    assert.deepEqual(await ids(c, "products"), [w.a.p1]);
  });
});

test("роль чужой компании сотруднику не назначить", async () => {
  const { rows } = await db.root.query(
    `SELECT id FROM uklad.roles WHERE org_id = $1 AND name = 'Кладовщик'`,
    [w.B],
  );
  await assert.rejects(
    asOrg(db.pool, w.A, (c) =>
      c.query(`INSERT INTO uklad.members (org_id, role_id, display_name) VALUES ($1, $2, 'Иван')`, [
        w.A,
        rows[0].id,
      ]),
    ),
    /foreign key/,
  );
});

test("новая компания получает роли по умолчанию, права сверяются", async () => {
  await asOrg(db.pool, w.A, async (c) => {
    const { rows } = await c.query(`SELECT name FROM uklad.roles ORDER BY name`);
    assert.ok(rows.some((r) => r.name === "Начальник склада"));
    assert.ok(!rows.some((r) => r.name === "Менеджер селлера"));
    await assert.rejects(
      c.query(
        `INSERT INTO uklad.roles (org_id, name, permissions) VALUES ($1, 'Старший смены', '{plan.edti}')`,
        [w.A],
      ),
      /unknown permission/,
    );
  });
});

test("остаток не перевесить на товар, который складу не виден", async () => {
  // p1 скрыт от склада после закрытия договора с S1 — закрываем второй раз
  // на время теста и возвращаем.
  const { rows } = await db.root.query(
    `SELECT id FROM uklad.contracts WHERE seller_org_id = $1 AND status = 'active'`,
    [w.S1],
  );
  const close = (id) =>
    asOrg(db.pool, w.A, (c) =>
      c.query(`UPDATE uklad.contracts SET status = 'closed', closed_at = now() WHERE id = $1`, [
        id,
      ]),
    );
  await close(rows[0].id);
  await assert.rejects(
    asOrg(db.pool, w.A, (c) =>
      c.query(`UPDATE uklad.stock SET product_id = $1 WHERE id = $2`, [w.a.p1, w.a.st3]),
    ),
    /row-level security/,
  );
  await asOrg(db.pool, w.A, (c) =>
    c.query(
      `INSERT INTO uklad.contracts (org_id, warehouse_id, seller_org_id) VALUES ($1, $2, $3)`,
      [w.A, w.a.wh, w.S1],
    ),
  );
});

test("удалённый товар селлеру не виден, склад видит его в корзине", async () => {
  await asOrg(db.pool, w.A, (c) =>
    c.query(`UPDATE uklad.products SET deleted_at = now() WHERE id = $1`, [w.a.p2]),
  );
  await asOrg(db.pool, w.S2, async (c) => {
    assert.deepEqual(await ids(c, "products"), []);
    assert.deepEqual(await ids(c, "stock"), []);
  });
  await asOrg(db.pool, w.A, async (c) => {
    assert.ok((await ids(c, "products")).includes(w.a.p2));
    await c.query(`UPDATE uklad.products SET deleted_at = NULL WHERE id = $1`, [w.a.p2]);
  });
});

test("функции в политиках только читают: STABLE, без SECURITY DEFINER", async () => {
  // Политика или функция, которая могла бы сама поменять app.org_id, сломала
  // бы изоляцию изнутри. STABLE-функция менять настройки не может.
  const { rows } = await db.root.query(`
    SELECT proname, provolatile, prosecdef FROM pg_proc
    WHERE pronamespace = 'uklad'::regnamespace
      AND proname IN ('current_org', 'current_member', 'has_active_contract')`);
  assert.equal(rows.length, 3);
  for (const f of rows) assert.deepEqual([f.provolatile, f.prosecdef], ["s", false], f.proname);
});
