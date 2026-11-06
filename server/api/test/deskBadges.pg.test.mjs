// Бейджи рабочего места (миграция 010): в QR случайный секрет, в базе только
// его хэш; новый бейдж гасит старый, чужая компания бейдж не найдёт.
/* global process, fetch, setTimeout */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const SKIP = !process.env.PG_ADMIN_URL && "нет PG_ADMIN_URL";

const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
let db, server, base, cookieName;
const sent = [];

before(async () => {
  if (SKIP) return;
  const helpers = await import("../../db/test/helpers.js");
  const { createApp, send, readBody } = require("../src/server.js");
  const { createAuth } = require("../src/cabinet/auth.js");
  const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const badges = createDeskBadges({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) || (await badges.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 50, ratePerMinute: 50 },
      db: {},
      mail: {},
      cabinet,
      log: quiet,
    }),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (SKIP) return;
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.teardown();
});

async function call(path, { body, raw, cookie, org, ip = "10.0.1.1" } = {}) {
  const res = await fetch(base + path, {
    method: body || raw ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body || raw ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** Регистрация целиком → кука и компания. */
async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await call("/api/auth/register", { body, ip })).status, 202);
  let code;
  for (let i = 0; i < 50 && !code; i++) {
    const m = sent.findLast((x) => x.to === email);
    if (m) code = /^(\d{6})/.exec(m.subject)[1];
    else await new Promise((r) => setTimeout(r, 10));
  }
  const res = await fetch(base + "/api/auth/verify", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ email, code }),
  });
  const token = new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie"))[1];
  return { cookie: token, org: (await res.json()).orgId };
}

const issue = (who, staffRef) => call("/api/cabinet/badges/issue", { ...who, body: { staffRef } });
const check = (who, code) => call("/api/cabinet/badges/check", { ...who, body: { code } });

test("выпуск, вход по бейджу, перевыпуск гасит старый, отзыв", { skip: SKIP }, async () => {
  const a = await owner("badge-a@sklad.ru", "10.0.2.1");
  const first = await issue(a, "stf-ivan");
  assert.equal(first.status, 200);
  assert.match(first.json.code, /^UK-STF-[A-Za-z0-9_-]{22}$/);
  // Код — не id сотрудника: по напечатанному чужому id не войти.
  assert.ok(!first.json.code.includes("stf-ivan"));
  assert.equal((await check(a, "UK-STF-stf-ivan")).status, 404);

  const ok = await check(a, first.json.code);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.staffRef, "stf-ivan");
  // Сканер сменил регистр префикса — вход тот же.
  const lower = "uk-stf-" + first.json.code.slice("UK-STF-".length);
  assert.equal((await check(a, lower)).json.staffRef, "stf-ivan");

  // В базе только хэш: открытого кода нет ни в одной строке.
  const { rows } = await db.root.query(
    `SELECT encode(secret_hash, 'hex') AS h FROM uklad.desk_badges WHERE org_id = $1`,
    [a.org],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].h.length, 64);

  const second = await issue(a, "stf-ivan");
  assert.notEqual(second.json.code, first.json.code);
  assert.equal((await check(a, first.json.code)).status, 404);
  assert.equal((await check(a, second.json.code)).json.staffRef, "stf-ivan");

  const revoked = await call("/api/cabinet/badges/revoke", {
    ...a,
    body: { staffRef: "stf-ivan" },
  });
  assert.equal(revoked.json.revoked, 1);
  assert.equal((await check(a, second.json.code)).status, 404);
  const { rows: live } = await db.root.query(
    `SELECT count(*)::int AS n FROM uklad.desk_badges WHERE org_id = $1 AND revoked_at IS NULL`,
    [a.org],
  );
  assert.equal(live[0].n, 0);
});

test("бейдж другой компании не пускает даже с верным кодом", { skip: SKIP }, async () => {
  const a = await owner("badge-b@sklad.ru", "10.0.2.2");
  const b = await owner("badge-c@sklad.ru", "10.0.2.3");
  const code = (await issue(a, "stf-anna")).json.code;
  assert.equal((await check(b, code)).status, 404);
  // Заголовком чужую компанию не попросить: членства нет.
  assert.equal((await check({ cookie: b.cookie, org: a.org }, code)).status, 401);
  assert.equal((await check(a, code)).json.staffRef, "stf-anna");
});

test("без сессии — 401, кривые данные — 400 и 404", { skip: SKIP }, async () => {
  const a = await owner("badge-d@sklad.ru", "10.0.2.4");
  assert.equal(
    (await call("/api/cabinet/badges/check", { body: { code: "UK-STF-x" } })).status,
    401,
  );
  assert.equal((await issue({ cookie: a.cookie }, "stf-1")).status, 401);
  assert.equal((await issue(a, "")).status, 400);
  assert.equal((await issue(a, "stf 1; drop")).status, 400);
  assert.equal((await check(a, "")).status, 404);
  assert.equal((await check(a, "UK-BOX-000001")).status, 404);
  assert.equal((await check(a, "UK-STF-" + "x".repeat(200))).status, 404);
});
