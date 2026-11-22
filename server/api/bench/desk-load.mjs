// Нагрузочный прогон стола: сколько операций в секунду выдерживает сервер.
//
//   PG_ADMIN_URL=postgres://postgres:postgres@localhost:5432/postgres \
//     node bench/desk-load.mjs [заявок на компанию через запятую] [компаний]
//
// Поднимает тот же сервер, что тесты стола (`test/desks.pg.test.mjs`), на
// чистой базе. Компания получает кабинет с N живыми заявками и тарами, затем
// столы шлют отметки смены (`shift_mark`) по одной на запрос — самая лёгкая
// операция, и всё равно каждая собирает кабинет целиком. Печатает время
// операции (медиана и p95) и пропускную способность. Цифры — для этой машины;
// боевой сервер (2 vCPU) медленнее, итог прогона — в docs/CODEMAPS/decisions.md.
/* global process, fetch, setTimeout, console, performance, Buffer */
import { createRequire } from "node:module";
import http from "node:http";

const require = createRequire(import.meta.url);
const ORIGIN = "https://u-klad.ru";
const PW = "очень-длинный-пароль";
const DESKS = 10; // столов на компанию
const OPS_PER_DESK = 18; // в пределах лимита стола (20 в минуту), чтобы не упереться в него

const sizes = (process.argv[2] ?? "500,2600,8000").split(",").map(Number);
const companies = Number(process.argv[3] ?? 1);

const helpers = await import("../../db/test/helpers.js");
const { createApp, send, readBody } = require("../src/server.js");
const { createAuth } = require("../src/cabinet/auth.js");
const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
const { createSnapshot } = require("../src/cabinet/snapshot.js");
const { createDesks } = require("../src/cabinet/desks.js");
const { createTeam } = require("../src/cabinet/team.js");

const db = await helpers.setupDb();
const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
const quiet = { error() {}, warn() {}, info() {} };
const sent = [];
const mail = { sendTo: async (m) => void sent.push(m) };
const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
const parts = [
  createDesks({ auth, cfg, send, log: quiet }),
  auth,
  createTeam({ auth, cfg, send, log: quiet }),
  createDeskBadges({ auth, send, log: quiet }),
  createSnapshot({ auth, send, log: quiet }),
];
const cookieName = auth.cookieName;
const deskCookieName = parts[0].cookieName;
const cabinet = {
  handle: async (req, res, url) => {
    for (const p of parts) if (await p.handle(req, res, url)) return true;
    return false;
  },
};
const server = http.createServer(
  createApp({
    cfg: { ...cfg, rateCapacity: 100000, ratePerMinute: 100000 },
    db: {},
    mail: {},
    cabinet,
    log: quiet,
  }),
);
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

async function call(path, { body, cookie, desk, org, ip = "10.9.0.1" } = {}) {
  const res = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(desk ? { Cookie: `${deskCookieName}=${desk}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: res.status,
    json: await res.json().catch(() => null),
    cookies: res.headers.getSetCookie(),
  };
}
const tokenOf = (cookies, name) =>
  new RegExp(`^${name}=([^;]*)`).exec(cookies.find((c) => c.startsWith(`${name}=`)) ?? "")?.[1];

async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  const r = await call("/api/auth/register", { body, ip });
  if (r.status !== 202) throw new Error(`регистрация ${r.status}`);
  let code;
  for (let i = 0; i < 100 && !code; i++) {
    const m = sent.findLast((x) => x.to === email);
    if (m) code = /^(\d{6})/.exec(m.subject)[1];
    else await new Promise((res) => setTimeout(res, 10));
  }
  const v = await call("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: tokenOf(v.cookies, cookieName), org: v.json.orgId };
}

/** Кабинет склада с `n` живыми заявками: заявка с позицией, тара на каждую вторую. */
function cabinetData(n) {
  const staff = Array.from({ length: DESKS }, (_, i) => ({
    id: `stf-${i}`,
    name: `Упаковщик ${i}`,
    role: "Упаковщик",
  }));
  const products = Array.from({ length: 300 }, (_, i) => ({
    id: `pr${i}`,
    sku: `SKU-${i}`,
    name: `Товар номер ${i}`,
    partnerId: "p1",
    barcode: `46000000${String(i).padStart(5, "0")}`,
  }));
  const now = Date.now();
  const requests = Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    number: `FBS-${100000 + i}`,
    partnerId: "p1",
    marketplace: "ozon",
    status: i % 4 === 0 ? "new" : "shipped",
    createdAt: now - (i % 5) * 86400000,
    shippedAt: i % 4 === 0 ? undefined : now - (i % 5) * 86400000,
    lines: [{ productId: `pr${i % 300}`, qty: 1 + (i % 3), pickedQty: 1, packedQty: 1 }],
    note: "Тула, ул. Ленина, 1",
    shipBy: now + 86400000,
  }));
  const boxes = Array.from({ length: Math.round(n / 2) }, (_, i) => ({
    id: `b${i}`,
    barcode: `UK-BOX-${i}`,
    lines: [{ productId: `pr${i % 300}`, qty: 1 }],
  }));
  return {
    warehouse: { id: "wh_1", name: "Склад", staff, partners: [{ id: "p1", name: "ООО Ромашка" }] },
    products,
    requests,
    boxes,
    staffEvents: [],
    subscription: { plan: "start" },
    devices: staff.map((_, i) => ({
      id: `dev-${i}`,
      name: `Стол ${i}`,
      station: "pack",
      createdAt: 1,
    })),
  };
}

/** Компания, кабинет на `n` заявок, столы с отмеченным сотрудником. */
async function company(k, n) {
  const email = `load-${n}-${k}@sklad.ru`;
  // Свой адрес на размер и компанию: лимиты входа считают по адресу.
  const ip = `10.${9 + sizes.indexOf(n)}.${k}.1`;
  const a = await owner(email, ip);
  const data = cabinetData(n);
  const bytes = Buffer.byteLength(JSON.stringify(data));
  const first = await call("/api/cabinet/snapshot", {
    ...a,
    body: { version: 0, format: 8, data },
  });
  if (first.status !== 200) throw new Error(`снимок ${first.status} ${JSON.stringify(first.json)}`);
  const desks = [];
  for (let i = 0; i < DESKS; i++) {
    const issued = await call("/api/cabinet/badges/issue", {
      ...a,
      body: { staffRef: `stf-${i}` },
    });
    const r = await call("/api/cabinet/desks", {
      ...a,
      body: { deviceRef: `dev-${i}`, name: "Стол" },
    });
    if (r.status !== 200) throw new Error(`стол ${r.status} ${JSON.stringify(r.json)}`);
    const desk = tokenOf(r.cookies, deskCookieName);
    await call("/api/cabinet/badges/check", { desk, body: { code: issued.json.code } });
    desks.push({ desk, staffId: `stf-${i}` });
    // Привязка стола гасит вход руководителя: входим снова.
    const again = await call("/api/auth/login", { body: { email, password: PW }, ip });
    a.cookie = tokenOf(again.cookies, cookieName);
  }
  return { desks, bytes };
}

const pct = (xs, p) =>
  xs.toSorted((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

async function shoot(desk, staffId, tag) {
  const times = [];
  let failed = 0;
  for (let i = 0; i < OPS_PER_DESK; i++) {
    const id = `ev-${tag}-${i}`;
    const type = i % 2 === 0 ? "break_start" : "break_end";
    const op = {
      key: `key-${id}`,
      kind: "shift_mark",
      body: { eventId: id, staffId, type, at: Date.now() },
    };
    const s = performance.now();
    const r = await call("/api/desk/ops", { desk, body: { ops: [op] } });
    times.push(performance.now() - s);
    if (r.status !== 200 || r.json?.results?.[0]?.status !== "applied") failed++;
  }
  return { times, failed };
}

async function run(n) {
  const list = [];
  for (let k = 0; k < companies; k++) list.push(await company(k, n));
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  const done = await Promise.all(
    list.flatMap((c, k) => c.desks.map((d, j) => shoot(d.desk, d.staffId, `${n}-${k}-${j}`))),
  );
  const wall = (performance.now() - t0) / 1000;
  const cpu = process.cpuUsage(cpu0);
  const times = done.flatMap((x) => x.times);
  console.log(
    JSON.stringify({
      requests: n,
      cabinetMB: +(list[0].bytes / 1048576).toFixed(2),
      companies,
      ops: times.length,
      failed: done.reduce((s, x) => s + x.failed, 0),
      opsPerSec: +(times.length / wall).toFixed(1),
      medianMs: Math.round(pct(times, 0.5)),
      p95Ms: Math.round(pct(times, 0.95)),
      nodeCpuSec: +((cpu.user + cpu.system) / 1e6).toFixed(1),
      wallSec: +wall.toFixed(1),
    }),
  );
}

try {
  for (const n of sizes) await run(n);
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await db.teardown();
}
