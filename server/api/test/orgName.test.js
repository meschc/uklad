/**
 * Название компании на сервере: что принимаем, кто может менять, без сессии —
 * 401, запрос идёт только в свою компанию.
 */
/* global require, URL */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { createOrgName, cleanName } = require("../src/cabinet/orgName");

test("cleanName: схлопывает пробелы, режет мусор и длину", () => {
  assert.equal(cleanName("  Склад   А "), "Склад А");
  assert.equal(cleanName(""), null);
  assert.equal(cleanName("   "), null);
  assert.equal(cleanName("a".repeat(201)), null);
  assert.equal(cleanName("a".repeat(200)), "a".repeat(200));
  assert.equal(cleanName("Склад\nА"), null);
  assert.equal(cleanName("Склад\u0000"), null);
  assert.equal(cleanName(42), null);
  assert.equal(cleanName(null), null);
});

/** Стенд: сессия с заданными правами и запись последнего запроса к базе. */
function setup({ session = true, perms = ["org.manage"], rows = 1 } = {}) {
  const queries = [];
  const sent = [];
  const auth = {
    readJson: async (req) => req.body,
    withSession: async (_req, act) => {
      if (!session) return null;
      const c = {
        query: async (sql, params) => {
          queries.push({ sql, params });
          return { rowCount: rows };
        },
      };
      return act(c, { accountId: "acc", can: (p) => perms.includes(p) });
    },
  };
  const send = (_res, status, body) => sent.push({ status, body });
  const api = createOrgName({ auth, send });
  const call = (body, method = "POST") =>
    api.handle({ method, body }, {}, new URL("http://x/api/company/name"));
  return { call, queries, sent };
}

test("владелец меняет название своей компании", async () => {
  const s = setup();
  assert.equal(await s.call({ name: " Склад А " }), true);
  assert.deepEqual(s.sent[0], { status: 200, body: { ok: true, name: "Склад А" } });
  assert.match(s.queries[0].sql, /id = uklad\.current_org\(\)/);
  assert.deepEqual(s.queries[0].params, ["Склад А"]);
});

test("без права org.manage — 403, база не трогается", async () => {
  const s = setup({ perms: ["staff.manage"] });
  await s.call({ name: "Склад А" });
  assert.equal(s.sent[0].status, 403);
  assert.equal(s.queries.length, 0);
});

test("без сессии — 401", async () => {
  const s = setup({ session: false });
  await s.call({ name: "Склад А" });
  assert.equal(s.sent[0].status, 401);
});

test("плохое название — 400 до базы", async () => {
  const s = setup();
  await s.call({ name: "\n" });
  assert.deepEqual(s.sent[0], { status: 400, body: { ok: false, error: "bad_name" } });
  assert.equal(s.queries.length, 0);
});

test("компании нет или она удалена — 404", async () => {
  const s = setup({ rows: 0 });
  await s.call({ name: "Склад А" });
  assert.equal(s.sent[0].status, 404);
});

test("чужой маршрут и чужой метод", async () => {
  const s = setup();
  const api = createOrgName({ auth: {}, send: () => {} });
  assert.equal(await api.handle({ method: "POST" }, {}, new URL("http://x/api/other")), false);
  await s.call({}, "GET");
  assert.equal(s.sent[0].status, 405);
});
