/**
 * «Сообщить о проблеме»: приём обращения сервером и раздел «Поддержка» в
 * админке. Проверяем то, что ломается молча: чужой источник и мусор не должны
 * лечь в базу, почта из текста — стереться и на сервере, скачивание копии —
 * попасть в журнал админки.
 */
/* global require, fetch, URLSearchParams, setImmediate */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp, readEnv } = require("../src/server");
const { openDb } = require("../src/db");
const { adminStore } = require("../src/admin/store");
const { hashPassword } = require("../src/admin/password");
const totp = require("../src/admin/totp");
const { createAdminApp } = require("../src/admin/app");
const { parseReport } = require("../src/support");

const SITE = "https://u-klad.ru";
const ADMIN = "https://admin.u-klad.ru";
const PASSWORD = "очень-длинный-пароль-1";
const SECRET = totp.newSecret();

function report(over = {}) {
  return {
    version: 1,
    createdAt: "2026-10-24T05:00:00.000Z",
    message: "Пропала строка приёмки, пишите ivan@example.ru",
    env: { userAgent: "test", language: "ru", screen: "1x1", timezone: "UTC", view: "receiving" },
    journal: [
      { at: 1, kind: "view", name: "receiving" },
      { at: 2, kind: "error", name: "command:data.failed", detail: "TypeError <script>" },
    ],
    snapshot: { data: { products: [] }, stats: { names: 3, dropped: 4, texts: 1 } },
    ...over,
  };
}

async function start(env = {}) {
  const clock = new Date("2026-10-24T05:00:00Z");
  const db = openDb(":memory:");
  const log = { error() {}, log() {} };
  const letters = [];
  const mail = {
    sendLetter: async (l) => void letters.push(l),
    sendTo: async () => {},
    replyTo: () => undefined,
  };
  const site = http.createServer(
    createApp({
      cfg: readEnv({ PUBLIC_URL: SITE, ADMIN_ORIGIN: ADMIN, ...env }),
      db,
      mail,
      now: () => clock,
      log,
    }),
  );
  const store = adminStore(db.raw);
  store.addAdmin(
    { email: "owner@u-klad.ru", passwordHash: hashPassword(PASSWORD), totpSecret: SECRET },
    clock,
  );
  const admin = http.createServer(
    createAdminApp({
      cfg: { adminOrigin: ADMIN, publicUrl: SITE, trustProxy: false },
      db: db.raw,
      now: () => clock,
      log,
    }),
  );
  await Promise.all([site, admin].map((s) => new Promise((r) => s.listen(0, r))));
  const url = (s) => `http://127.0.0.1:${s.address().port}`;
  return {
    db,
    store,
    letters,
    health: async () => (await fetch(`${url(site)}/api/health`)).json(),
    send: (body, origin = SITE) =>
      fetch(`${url(site)}/api/support/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    async adminLogin() {
      const res = await fetch(`${url(admin)}/login`, {
        method: "POST",
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ADMIN },
        body: new URLSearchParams({
          email: "owner@u-klad.ru",
          password: PASSWORD,
          code: totp.codeAt(SECRET, Math.floor(clock.getTime() / totp.STEP_MS)),
        }).toString(),
      });
      return (res.headers.get("set-cookie") ?? "").split(";")[0];
    },
    adminGet: (path, cookie) =>
      fetch(url(admin) + path, { redirect: "manual", headers: { Cookie: cookie } }),
    adminPost: (path, fields, cookie) =>
      fetch(url(admin) + path, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: ADMIN,
          Cookie: cookie,
        },
        body: new URLSearchParams(fields).toString(),
      }),
    stop: () =>
      Promise.all(
        [site, admin].map((s) => new Promise((r) => (s.close(r), s.closeAllConnections()))),
      ),
  };
}

test("обращение принимается, почта из текста стирается и на сервере", async (t) => {
  const app = await start();
  t.after(app.stop);
  const res = await app.send(report());
  assert.equal(res.status, 200);
  const { ok, id } = await res.json();
  assert.equal(ok, true);
  const row = app.store.report(id);
  assert.equal(row.message, "Пропала строка приёмки, пишите [почта]");
  assert.equal(row.errors, 1);
  assert.equal(row.has_snapshot, 1);
  assert.ok(!row.payload.includes("ivan@example.ru"));
});

test("чужой источник, мусор и пустое сообщение не ложатся в базу", async (t) => {
  const app = await start();
  t.after(app.stop);
  assert.equal((await app.send(report(), "https://evil.example")).status, 403);
  assert.equal((await app.send("{не json")).status, 400);
  assert.equal((await app.send(report({ message: "   " }))).status, 400);
  assert.equal((await app.send(report({ version: 2 }))).status, 400);
  assert.equal(
    (await app.send(report({ journal: [{ at: "вчера", kind: "view", name: "x" }] }))).status,
    400,
  );
  assert.equal(app.store.reports().length, 0);
});

test("слишком большое обращение отклоняется до разбора", async (t) => {
  const app = await start();
  t.after(app.stop);
  const huge = report({ snapshot: { data: { x: "a".repeat(600 * 1024) }, stats: {} } });
  assert.equal((await app.send(huge)).status, 413);
});

test("разбор: журнал не длиннее 500 записей", () => {
  const journal = Array.from({ length: 501 }, (_, i) => ({ at: i, kind: "view", name: "x" }));
  assert.equal(parseReport(report({ journal })).ok, false);
});

test("админка: список, карточка, статус и скачивание — с журналом", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { id } = await (await app.send(report())).json();
  const cookie = await app.adminLogin();

  const list = await (await app.adminGet("/support", cookie)).text();
  assert.ok(list.includes(`/support/${id}`));
  const card = await (await app.adminGet(`/support/${id}`, cookie)).text();
  assert.ok(card.includes("TypeError &lt;script&gt;"), "детали ошибки экранированы");
  assert.ok(!card.includes("<script>"));

  const file = await app.adminGet(`/support/${id}.json`, cookie);
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition"), /attachment/);
  assert.equal(JSON.parse(await file.text()).version, 1);

  const csrf = /name="csrf" value="([^"]+)"/.exec(card)[1];
  const saved = await app.adminPost(
    `/support/${id}`,
    { csrf, status: "done", note: "починили" },
    cookie,
  );
  assert.equal(saved.status, 303);
  assert.equal(app.store.report(id).status, "done");

  const actions = app.store.audit(50).map((a) => a.action);
  assert.ok(actions.includes("support_download"));
  assert.ok(actions.includes("support_update"));
});

test("старые обращения стираются через 90 дней", async (t) => {
  const app = await start();
  t.after(app.stop);
  await app.send(report());
  const gone = app.db.purge(new Date("2027-02-01T00:00:00Z"), 180, 90);
  assert.equal(gone.reports, 1);
});

test("сервер не верит обезличиванию в браузере: чистит всё тело", async (t) => {
  const app = await start();
  t.after(app.stop);
  const dirty = report({
    snapshot: {
      data: {
        staff: [{ id: "s1", name: "Мамедова Л. Р.", phone: "+7 999 123-45-67" }],
        account: { inn: "503600000123", mail: "boss@example.ru" },
        products: [{ id: "g1", barcode: "4600000000017" }],
      },
      stats: {},
    },
  });
  const { id } = await (await app.send(dirty)).json();
  const payload = app.store.report(id).payload;
  for (const leak of ["Мамедова", "999 123", "503600000123", "example.ru"]) {
    assert.ok(!payload.includes(leak), `утекло: ${leak}`);
  }
  assert.ok(payload.includes("4600000000017"), "штрихкод остаётся");
});

test("ловушка и слишком быстрая отправка: «принято», но в базу не ложится", async (t) => {
  const app = await start();
  t.after(app.stop);
  const bot = await app.send(report({ website: "http://spam" }));
  assert.equal(bot.status, 200);
  assert.equal((await app.send(report({ elapsedMs: 300 }))).status, 200);
  assert.equal(app.store.reports().length, 0);
  await app.send(report({ elapsedMs: 15000, website: "" }));
  const [row] = app.store.reports();
  assert.ok(!app.store.report(row.id).payload.includes("elapsedMs"));
});

test("общий суточный потолок: сверх него 429, и health говорит об этом", async (t) => {
  const app = await start({ REPORTS_PER_DAY: "2", RATE_LIMIT_BURST: "10" });
  t.after(app.stop);
  assert.equal((await app.health()).reportsCapped, false);
  assert.equal((await app.send(report())).status, 200);
  assert.equal((await app.send(report())).status, 200);
  assert.equal((await app.send(report())).status, 429);
  assert.equal((await app.health()).reportsCapped, true);
});

test("серверная чистка не трогает коды: штрихкод, артикул, номера заказов и тары", async (t) => {
  const app = await start();
  t.after(app.stop);
  const codes = {
    id: "1234567890",
    barcode: "4600000000017",
    sku: "MUG-300-1234567890",
    article: "123456789012",
    orderId: "9876543210",
    boxIds: ["000123456789", "000123456790"],
    labelCode: "UK-BOX-0001234567",
  };
  const { id } = await (
    await app.send(report({ snapshot: { data: { products: [codes] }, stats: {} } }))
  ).json();
  const saved = JSON.parse(app.store.report(id).payload).snapshot.data.products[0];
  assert.deepEqual(saved, codes);
  // А тот же номер в свободном поле — уже не код, а возможный телефон или ИНН.
  const { id: id2 } = await (
    await app.send(report({ snapshot: { data: { title: "ИНН 503600000123" }, stats: {} } }))
  ).json();
  assert.ok(!app.store.report(id2).payload.includes("503600000123"));
});

test("копия обращения уходит на почту: суть в тексте, тело файлом", async (t) => {
  const app = await start();
  t.after(app.stop);
  const { id } = await (await app.send(report())).json();
  await new Promise((r) => setImmediate(r));
  assert.equal(app.letters.length, 1);
  const [letter] = app.letters;
  assert.match(letter.subject, new RegExp(`№ ${id}`));
  assert.ok(letter.text.includes(`${ADMIN}/support/${id}`));
  assert.ok(!letter.text.includes("ivan@example.ru"));
  assert.equal(letter.attachments[0].content, app.store.report(id).payload);
});
