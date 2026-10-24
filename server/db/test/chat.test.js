// Чат (миграция 006): кто видит диалог, сообщения и имена собеседников.
// Ошибка здесь — чужая переписка у чужой компании, поэтому проверяем прямым
// SQL под ролью приложения, как и остальную изоляцию.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupDb, asOrg, seedWorld } from "./helpers.js";

let db, w, people;

/** Сотрудник компании с ролью по имени. Вернёт его id. */
async function member(orgId, roleName, name) {
  return asOrg(db.pool, orgId, async (c) => {
    const role = (
      await c.query(`SELECT id FROM uklad.roles WHERE org_id = $1 AND name = $2`, [orgId, roleName])
    ).rows[0].id;
    return (
      await c.query(
        `INSERT INTO uklad.members (org_id, role_id, display_name, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [orgId, role, name],
      )
    ).rows[0].id;
  });
}

/** Транзакция от имени сотрудника — так ставит `auth.resolve`. */
const as = (orgId, memberId, fn) => asOrg(db.pool, orgId, fn, memberId);

const rows = async (c, sql, args) => (await c.query(sql, args)).rows;

const join = (c, org, conv, who) =>
  c.query(
    `INSERT INTO uklad.conversation_members (org_id, conversation_id, member_id) VALUES ($1, $2, $3)`,
    [org, conv, who],
  );

const say = (c, org, conv, who, body) =>
  c.query(
    `INSERT INTO uklad.messages (org_id, conversation_id, author_member_id, body) VALUES ($1, $2, $3, $4)`,
    [org, conv, who, body],
  );

before(async () => {
  db = await setupDb();
  w = await seedWorld(db.pool);
  people = {
    boss: await member(w.A, "Начальник склада", "Начальник А"),
    shift: await member(w.A, "Начальник склада", "Старший смены А"),
    picker: await member(w.A, "Сборщик", "Сборщик А"),
    s1: await member(w.S1, "Менеджер селлера", "Менеджер С1"),
    s2: await member(w.S2, "Менеджер селлера", "Менеджер С2"),
    b: await member(w.B, "Начальник склада", "Начальник Б"),
  };
});
after(() => db.teardown());

/** Диалог склада А с селлером 1 по договору: начальник, старший смены, менеджер С1. */
async function contractChat() {
  const conv = await as(w.A, people.boss, async (c) => {
    const id = (
      await c.query(
        `INSERT INTO uklad.conversations (org_id, org_ids, contract_id, title)
         VALUES ($1, $2, $3, 'Поставки С1') RETURNING id`,
        [w.A, [w.A, w.S1], w.a.c1],
      )
    ).rows[0].id;
    await join(c, w.A, id, people.boss);
    await join(c, w.A, id, people.shift);
    return id;
  });
  // Своего человека селлер добавляет сам: склад чужих людей не приглашает.
  await as(w.S1, people.s1, (c) => join(c, w.S1, conv, people.s1));
  await as(w.A, people.boss, (c) => say(c, w.A, conv, people.boss, "Приняли 11 коробов из 12"));
  return conv;
}

test("групповой диалог по договору: обе стороны пишут и читают", async () => {
  const conv = await contractChat();
  await as(w.S1, people.s1, async (c) => {
    await say(c, w.S1, conv, people.s1, "Вижу акт, спасибо");
    const feed = await rows(
      c,
      `SELECT body FROM uklad.messages WHERE conversation_id = $1 ORDER BY created_at`,
      [conv],
    );
    assert.deepEqual(
      feed.map((r) => r.body),
      ["Приняли 11 коробов из 12", "Вижу акт, спасибо"],
    );
    // Имена собеседников склада видны — они участники моего диалога.
    const names = await rows(
      c,
      `SELECT m.display_name FROM uklad.conversation_members cm
       JOIN uklad.members m ON m.org_id = cm.org_id AND m.id = cm.member_id
       WHERE cm.conversation_id = $1 ORDER BY m.display_name`,
      [conv],
    );
    assert.deepEqual(
      names.map((r) => r.display_name),
      ["Менеджер С1", "Начальник А", "Старший смены А"],
    );
  });
});

test("сотрудник своей же компании, не добавленный в диалог, переписку не видит", async () => {
  const conv = await contractChat();
  await as(w.A, people.picker, async (c) => {
    const feed = await rows(c, `SELECT 1 FROM uklad.messages WHERE conversation_id = $1`, [conv]);
    assert.equal(feed.length, 0);
  });
});

test("чужая компания не видит ни диалога, ни сообщений, ни имён", async () => {
  const conv = await contractChat();
  for (const [org, who] of [
    [w.S2, people.s2],
    [w.B, people.b],
  ]) {
    await as(org, who, async (c) => {
      assert.equal(
        (await rows(c, `SELECT 1 FROM uklad.conversations WHERE id = $1`, [conv])).length,
        0,
      );
      assert.equal(
        (await rows(c, `SELECT 1 FROM uklad.messages WHERE conversation_id = $1`, [conv])).length,
        0,
      );
      assert.equal(
        (await rows(c, `SELECT 1 FROM uklad.members WHERE org_id = $1`, [w.A])).length,
        0,
      );
    });
  }
});

test("селлер не заведёт диалог с чужим складом и не подставит чужой договор", async () => {
  await assert.rejects(
    as(w.S2, people.s2, (c) =>
      c.query(
        `INSERT INTO uklad.conversations (org_id, org_ids, contract_id) VALUES ($1, $2, $3)`,
        [w.S2, [w.S2, w.A], w.a.c1],
      ),
    ),
    /row-level security/,
  );
  await assert.rejects(
    as(w.S2, people.s2, (c) =>
      c.query(`INSERT INTO uklad.conversations (org_id, org_ids) VALUES ($1, $2)`, [
        w.S2,
        [w.S2, w.B],
      ]),
    ),
  );
});

test("склад не может добавить в диалог человека чужой компании", async () => {
  const conv = await contractChat();
  await assert.rejects(
    as(w.A, people.boss, (c) => join(c, w.S1, conv, people.s1)),
    /row-level security/,
  );
});

test("без права chat.use писать нельзя, даже будучи участником", async () => {
  const conv = await contractChat();
  // Сборщика добавляет начальник; у роли «Сборщик» права на чат нет.
  await as(w.A, people.boss, (c) => join(c, w.A, conv, people.picker));
  await assert.rejects(
    as(w.A, people.picker, (c) => say(c, w.A, conv, people.picker, "тест")),
    /row-level security/,
  );
});

test("править и удалять можно только своё сообщение", async () => {
  const conv = await contractChat();
  await as(w.A, people.shift, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE uklad.messages SET body = 'подмена' WHERE conversation_id = $1`,
      [conv],
    );
    assert.equal(rowCount, 0);
  });
  await as(w.A, people.boss, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE uklad.messages SET body = '', deleted_at = now() WHERE conversation_id = $1`,
      [conv],
    );
    assert.equal(rowCount, 1);
  });
});

test("после закрытия договора история читается, новых сообщений нет", async () => {
  const conv = await contractChat();
  await asOrg(db.pool, w.A, (c) =>
    c.query(`UPDATE uklad.contracts SET status = 'closed', closed_at = now() WHERE id = $1`, [
      w.a.c1,
    ]),
  );
  try {
    await as(w.A, people.boss, async (c) => {
      const feed = await rows(c, `SELECT 1 FROM uklad.messages WHERE conversation_id = $1`, [conv]);
      assert.ok(feed.length >= 1);
    });
    await assert.rejects(
      as(w.A, people.boss, (c) => say(c, w.A, conv, people.boss, "ещё")),
      /row-level security/,
    );
  } finally {
    await asOrg(db.pool, w.A, (c) =>
      c.query(`UPDATE uklad.contracts SET status = 'active', closed_at = NULL WHERE id = $1`, [
        w.a.c1,
      ]),
    );
  }
});

test("вышедший участник новых сообщений не видит", async () => {
  const conv = await contractChat();
  await as(w.A, people.shift, (c) =>
    c.query(
      `UPDATE uklad.conversation_members SET left_at = now()
       WHERE conversation_id = $1 AND member_id = $2`,
      [conv, people.shift],
    ),
  );
  await as(w.A, people.shift, async (c) => {
    assert.equal(
      (await rows(c, `SELECT 1 FROM uklad.messages WHERE conversation_id = $1`, [conv])).length,
      0,
    );
  });
});

test("участника и сообщение нельзя перенести в другой диалог", async () => {
  const conv = await contractChat();
  // Внутренний чат склада А без старшего смены.
  const internal = await as(w.A, people.boss, async (c) => {
    const id = (
      await c.query(
        `INSERT INTO uklad.conversations (org_id, org_ids, title) VALUES ($1, $2, 'Только начальство') RETURNING id`,
        [w.A, [w.A]],
      )
    ).rows[0].id;
    await join(c, w.A, id, people.boss);
    return id;
  });
  await assert.rejects(
    as(w.A, people.shift, (c) =>
      c.query(
        `UPDATE uklad.conversation_members SET conversation_id = $1
         WHERE conversation_id = $2 AND member_id = $3`,
        [internal, conv, people.shift],
      ),
    ),
    /immutable/,
  );
  await assert.rejects(
    as(w.A, people.boss, (c) =>
      c.query(`UPDATE uklad.messages SET conversation_id = $1 WHERE conversation_id = $2`, [
        internal,
        conv,
      ]),
    ),
    /immutable/,
  );
});

test("флаг рассылки не открывает переписку приложению", async () => {
  const conv = await contractChat();
  // Даже если код приложения поставит флаг сам, правило рассылки — только
  // для владельца таблиц: чужая компания по-прежнему не видит ничего.
  await as(w.S2, people.s2, async (c) => {
    await c.query(`SELECT set_config('app.notifier', 'on', true)`);
    for (const table of ["messages", "conversation_members"]) {
      const found = await rows(c, `SELECT 1 FROM uklad.${table} WHERE conversation_id = $1`, [
        conv,
      ]);
      assert.equal(found.length, 0, table);
    }
    assert.equal((await rows(c, `SELECT 1 FROM uklad.members WHERE org_id = $1`, [w.A])).length, 0);
  });
});
