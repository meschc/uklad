// Команда компании на настоящем Postgres (миграция 023): приглашение по
// ссылке, роли, отключение и главное — что делающий не может дать и отнять
// больше, чем имеет сам. Без PG_ADMIN_URL тест пропускается.
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
  const { createTeam } = require("../src/cabinet/team.js");
  const { createDeskBadges } = require("../src/cabinet/deskBadges.js");
  const { createSnapshot } = require("../src/cabinet/snapshot.js");
  db = await helpers.setupDb();
  const cfg = { publicUrl: ORIGIN, allowedOrigins: [ORIGIN], trustProxy: true };
  const quiet = { error() {} };
  const mail = { sendTo: async (m) => void sent.push(m) };
  const auth = createAuth({ pool: db.pool, cfg, send, readBody, log: quiet, mail });
  const team = createTeam({ auth, cfg, send, log: quiet });
  const badges = createDeskBadges({ auth, send, log: quiet });
  const snapshot = createSnapshot({ auth, send, log: quiet });
  cookieName = auth.cookieName;
  const cabinet = {
    handle: async (req, res, url) =>
      (await auth.handle(req, res, url)) ||
      (await team.handle(req, res, url)) ||
      (await badges.handle(req, res, url)) ||
      (await snapshot.handle(req, res, url)),
  };
  server = http.createServer(
    createApp({
      cfg: { ...cfg, rateCapacity: 500, ratePerMinute: 500 },
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

async function call(method, path, { body, cookie, org, ip = "10.0.2.1" } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      Origin: ORIGIN,
      "X-Forwarded-For": ip,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: `${cookieName}=${cookie}` } : {}),
      ...(org ? { "X-Uklad-Org": org } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null), res };
}
const post = (path, o) => call("POST", path, o);
const cookieOf = (res) =>
  new RegExp(`${cookieName}=([^;]*)`).exec(res.headers.get("set-cookie"))[1];

async function lastMail(to) {
  for (let i = 0; i < 50; i++) {
    const m = sent.findLast((x) => x.to === to);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`письма для ${to} нет`);
}

/** Регистрация склада целиком → кука и компания. */
async function owner(email, ip) {
  const body = { email, password: PW, kind: "warehouse", consent: true };
  assert.equal((await post("/api/auth/register", { body, ip })).status, 202);
  const code = /^(\d{6})/.exec((await lastMail(email)).subject)[1];
  const r = await post("/api/auth/verify", { body: { email, code }, ip });
  return { cookie: cookieOf(r.res), org: r.json.orgId, ip };
}

const tokenIn = (mail) => /#invite=([A-Za-z0-9_-]{43})/.exec(mail.text)[1];

async function roles(who) {
  await ensureCabinet(who);
  const r = await call("GET", "/api/team", who);
  return Object.fromEntries(r.json.roles.map((x) => [x.name, x.id]));
}

/**
 * Роль выше начальника склада: своя, с правом, которого у начальника нет.
 * Роль владельца для этого не годится — её не дать никому (057).
 */
async function topRole(who) {
  const r = await post("/api/team/roles/save", {
    ...who,
    body: { name: "Выше начальника", permissions: ["stock.view", "billing.view"] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.roleId;
}

/** Склад, на который зовут в этих тестах (миграция 034: без склада смотрящего не зовут). */
const WH = "w1";

/** Текущая версия кабинета компании. */
async function version(who) {
  return (await call("GET", "/api/cabinet/snapshot", who)).json.snapshot?.version ?? 0;
}

/** У компании ещё нет кабинета — завести с одним складом `WH`. */
async function ensureCabinet(who) {
  const cur = await call("GET", "/api/cabinet/snapshot", who);
  if (cur.json?.snapshot) return;
  const data = { warehouse: { id: WH, name: "Склад", staff: [] } };
  const r = await post("/api/cabinet/snapshot", { ...who, body: { version: 0, format: 8, data } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}

/** Тело приглашения со складом `WH`. */
async function inviteBody(who, body) {
  await ensureCabinet(who);
  return { warehouseRef: WH, ...body };
}

/** Пригласить и принять новым человеком → его кука. */
async function join(who, email, roleId, place = {}) {
  const body = await inviteBody(who, { email, roleId, ...place });
  const inv = await post("/api/team/invite", { ...who, body });
  assert.equal(inv.status, 200, JSON.stringify(inv.json));
  const token = tokenIn(await lastMail(email));
  const acc = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
    ip: who.ip,
  });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  return { cookie: cookieOf(acc.res), org: acc.json.orgId, ip: who.ip, token };
}

test("пригласить начальника: ссылка из письма, вход, права по роли", { skip: SKIP }, async () => {
  const boss = await owner("boss1@example.com", "10.1.0.1");
  const r = await roles(boss);
  const inv = await post("/api/team/invite", {
    ...boss,
    body: {
      warehouseRef: WH,
      email: "Chief@Example.com",
      roleId: r["Начальник склада"],
      name: "Пётр",
    },
  });
  assert.equal(inv.status, 200);
  const mail = await lastMail("chief@example.com");
  assert.match(mail.subject, /приглашают/);
  const token = tokenIn(mail);
  // В списке — приглашённый без входа.
  const list = (await call("GET", "/api/team", boss)).json;
  const pending = list.members.find((m) => m.email === "chief@example.com");
  assert.equal(pending.status, "invited");
  assert.equal(pending.hasLogin, false);
  // Ссылка показывает компанию, роль и почту.
  const info = await post("/api/auth/invite/info", { body: { token } });
  assert.equal(info.json.role, "Начальник склада");
  assert.equal(info.json.hasAccount, false);
  // Слабый пароль и отсутствие согласия не принимаются, ссылка остаётся живой.
  const weak = await post("/api/auth/invite/accept", {
    body: { token, password: "1", consent: true },
  });
  assert.equal(weak.status, 400);
  const noConsent = await post("/api/auth/invite/accept", { body: { token, password: PW } });
  assert.equal(noConsent.status, 400);
  const ok = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
  });
  assert.equal(ok.status, 200);
  const chief = { cookie: cookieOf(ok.res), org: ok.json.orgId };
  assert.equal(chief.org, boss.org);
  const me = await call("GET", `/api/auth/me?org=${chief.org}`, chief);
  assert.ok(me.json.current.permissions.includes("staff.manage"));
  assert.ok(!me.json.current.permissions.includes("org.manage"));
  assert.equal((await call("GET", "/api/team", chief)).status, 200);
  // Ссылка одноразовая.
  const again = await post("/api/auth/invite/accept", {
    body: { token, password: PW, consent: true },
  });
  assert.equal(again.status, 404);
  assert.equal((await post("/api/auth/invite/info", { body: { token } })).status, 404);
});

test("начальник не может выше себя и не может себя", { skip: SKIP }, async () => {
  const boss = await owner("boss2@example.com", "10.1.0.2");
  const r = await roles(boss);
  const chief = await join(boss, "chief2@example.com", r["Начальник склада"]);
  const team = (await call("GET", "/api/team", chief)).json;
  const bossId = team.members.find((m) => m.roleName === "Владелец").id;
  const chiefId = team.me;
  // Дать роль владельца нельзя ни приглашением, ни сменой роли.
  const up = await post("/api/team/invite", {
    ...chief,
    body: { warehouseRef: WH, email: "x@example.com", roleId: r["Владелец"] },
  });
  assert.equal(up.status, 403);
  // Владельца не переназначить и не отключить.
  const demote = await post("/api/team/role", {
    ...chief,
    body: { memberId: bossId, roleId: r["Кладовщик / оператор"] },
  });
  assert.equal(demote.status, 403);
  const off = await post("/api/team/disable", { ...chief, body: { memberId: bossId } });
  assert.equal(off.status, 403);
  // Себя тоже.
  const self = await post("/api/team/role", {
    ...chief,
    body: { memberId: chiefId, roleId: r["Кладовщик / оператор"] },
  });
  assert.equal(self.status, 403);
  assert.equal(
    (await post("/api/team/disable", { ...chief, body: { memberId: chiefId } })).status,
    403,
  );
  // Своя роль без прав, которых нет у делающего (billing.view), и с владельцем — нет.
  for (const permissions of [["billing.view"], ["org.manage"], ["stock.view", "billing.view"]]) {
    const r2 = await post("/api/team/roles/save", {
      ...chief,
      body: { name: "Хитрая", permissions },
    });
    assert.equal(r2.status, 403, permissions.join());
  }
  // А в пределах своих — можно.
  const okRole = await post("/api/team/roles/save", {
    ...chief,
    body: { name: "Мастер смены", permissions: ["stock.view", "picking.do"] },
  });
  assert.equal(okRole.status, 200);
  // «Делать» без «смотреть» не бывает: чтение раздела база добавляет сама (033).
  const saved = (await call("GET", "/api/team", chief)).json.roles.find(
    (x) => x.name === "Мастер смены",
  );
  assert.deepEqual([...saved.permissions].sort(), ["picking.do", "picking.view", "stock.view"]);
  // Опечатка в праве — отказ, а не роль без права.
  const typo = await post("/api/team/roles/save", {
    ...chief,
    body: { name: "Опечатка", permissions: ["stock.vieww"] },
  });
  assert.ok(typo.status >= 400);
  // Стандартные роли склада правятся (Кирилл 22.11), роль владельца — нет.
  const builtIn = await post("/api/team/roles/save", {
    ...chief,
    body: {
      roleId: r["Кладовщик / оператор"],
      name: "Кладовщик",
      permissions: ["stock.view"],
    },
  });
  assert.equal(builtIn.status, 200, JSON.stringify(builtIn.json));
  const ownerRole = await post("/api/team/roles/save", {
    ...chief,
    body: { roleId: r["Владелец"], name: "Владелец", permissions: ["stock.view"] },
  });
  assert.equal(ownerRole.status, 404);
});

test("отключение гасит вход, возврат восстанавливает", { skip: SKIP }, async () => {
  const boss = await owner("boss3@example.com", "10.1.0.3");
  const r = await roles(boss);
  const chief = await join(boss, "chief3@example.com", r["Начальник склада"]);
  const chiefId = (await call("GET", "/api/team", chief)).json.me;
  assert.equal(
    (await post("/api/team/disable", { ...boss, body: { memberId: chiefId } })).status,
    200,
  );
  assert.equal((await call("GET", "/api/team", chief)).status, 401);
  const shown = (await call("GET", "/api/team", boss)).json.members.find((m) => m.id === chiefId);
  assert.equal(shown.status, "disabled");
  assert.equal(
    (await post("/api/team/disable", { ...boss, body: { memberId: chiefId, disabled: false } }))
      .status,
    200,
  );
  assert.equal((await call("GET", "/api/team", chief)).status, 200);
  // Смена роли действует сразу: кладовщику список команды уже закрыт.
  assert.equal(
    (
      await post("/api/team/role", {
        ...boss,
        body: { memberId: chiefId, roleId: r["Кладовщик / оператор"] },
      })
    ).status,
    200,
  );
  assert.equal((await call("GET", "/api/team", chief)).status, 403);
});

test(
  "кладовщик с входом не управляет командой; чужая компания недоступна",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss4@example.com", "10.1.0.4");
    const other = await owner("other4@example.com", "10.1.0.5");
    const r = await roles(boss);
    const clerk = await join(boss, "clerk4@example.com", r["Кладовщик / оператор"]);
    assert.equal((await call("GET", "/api/team", clerk)).status, 403);
    assert.equal(
      (
        await post("/api/team/invite", {
          ...clerk,
          body: { warehouseRef: WH, email: "z@example.com", roleId: r["Кладовщик / оператор"] },
        })
      ).status,
      403,
    );
    // Другой владелец не находит чужого человека: 404, а не 403.
    const clerkId = (await call("GET", "/api/team", boss)).json.members.find(
      (m) => m.email === "clerk4@example.com",
    ).id;
    const foreign = await post("/api/team/role", {
      ...other,
      body: { memberId: clerkId, roleId: (await roles(other))["Приёмщик"] },
    });
    assert.equal(foreign.status, 404);
    // И роль чужой компании не назначить своему.
    const foreignRole = await post("/api/team/invite", {
      ...other,
      body: { warehouseRef: WH, email: "n@example.com", roleId: r["Кладовщик / оператор"] },
    });
    assert.equal(foreignRole.status, 404);
  },
);

test(
  "отозванное и повторное приглашение, приглашение существующего аккаунта",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss5@example.com", "10.1.0.6");
    const r = await roles(boss);
    const first = await post("/api/team/invite", {
      ...boss,
      body: { warehouseRef: WH, email: "p5@example.com", roleId: r["Кладовщик / оператор"] },
    });
    assert.equal(first.status, 200);
    const old = tokenIn(await lastMail("p5@example.com"));
    // Повторное приглашение гасит старую ссылку и не плодит карточки.
    sent.length = 0;
    await post("/api/team/invite", {
      ...boss,
      body: { warehouseRef: WH, email: "p5@example.com", roleId: r["Кладовщик / оператор"] },
    });
    const fresh = tokenIn(await lastMail("p5@example.com"));
    assert.notEqual(fresh, old);
    assert.equal((await post("/api/auth/invite/info", { body: { token: old } })).status, 404);
    const team = (await call("GET", "/api/team", boss)).json;
    assert.equal(team.members.filter((m) => m.email === "p5@example.com").length, 1);
    assert.equal(
      team.members.find((m) => m.email === "p5@example.com").roleName,
      "Кладовщик / оператор",
    );
    // Отзыв: карточка пропадает, ссылка мертва.
    const memberId = team.members.find((m) => m.email === "p5@example.com").id;
    assert.equal(
      (await post("/api/team/invite/revoke", { ...boss, body: { memberId } })).status,
      200,
    );
    assert.equal((await post("/api/auth/invite/info", { body: { token: fresh } })).status, 404);
    assert.ok(!(await call("GET", "/api/team", boss)).json.members.some((m) => m.id === memberId));

    // Приглашаем человека, у которого уже есть кабинет: нужен его пароль.
    const guest = await owner("guest5@example.com", "10.1.0.7");
    await post("/api/team/invite", {
      ...boss,
      body: { warehouseRef: WH, email: "guest5@example.com", roleId: r["Кладовщик / оператор"] },
    });
    const token = tokenIn(await lastMail("guest5@example.com"));
    const info = await post("/api/auth/invite/info", { body: { token } });
    assert.equal(info.json.hasAccount, true);
    const wrong = await post("/api/auth/invite/accept", {
      body: { token, password: "не-тот-пароль-совсем" },
    });
    assert.equal(wrong.status, 401);
    const right = await post("/api/auth/invite/accept", {
      body: { token, password: PW },
      ip: "10.1.0.7",
    });
    assert.equal(right.status, 200);
    // Теперь у него две компании.
    const me = await call("GET", `/api/auth/me?org=${right.json.orgId}`, {
      cookie: cookieOf(right.res),
    });
    assert.equal(me.json.orgs.length, 2);
    assert.ok(guest.org !== right.json.orgId);
    // Тот же человек не принимает второй раз.
    await post("/api/team/invite", {
      ...boss,
      body: { warehouseRef: WH, email: "guest5@example.com", roleId: r["Кладовщик / оператор"] },
    });
    assert.equal(
      (
        await post("/api/team/invite", {
          ...boss,
          body: {
            warehouseRef: WH,
            email: "guest5@example.com",
            roleId: r["Кладовщик / оператор"],
          },
        })
      ).status,
      409,
    );
  },
);

test("свои роли: правка, занятая роль не удаляется", { skip: SKIP }, async () => {
  const boss = await owner("boss6@example.com", "10.1.0.8");
  const r = await roles(boss);
  const created = await post("/api/team/roles/save", {
    ...boss,
    body: { name: "Мастер смены", permissions: ["stock.view", "picking.do"] },
  });
  assert.equal(created.status, 200);
  const roleId = created.json.roleId;
  const m = await join(boss, "m6@example.com", roleId);
  assert.ok(
    (await call("GET", `/api/auth/me?org=${m.org}`, m)).json.current.permissions.includes(
      "picking.do",
    ),
  );
  // Расширили роль — у человека право появилось сразу.
  await post("/api/team/roles/save", {
    ...boss,
    body: { roleId, name: "Мастер смены", permissions: ["stock.view", "picking.do", "packing.do"] },
  });
  assert.ok(
    (await call("GET", `/api/auth/me?org=${m.org}`, m)).json.current.permissions.includes(
      "packing.do",
    ),
  );
  assert.equal((await post("/api/team/roles/delete", { ...boss, body: { roleId } })).status, 409);
  // Стандартную роль склада, которую никто не носит, удалить можно; владельца — нет.
  assert.equal(
    (await post("/api/team/roles/delete", { ...boss, body: { roleId: r["Старший участка"] } }))
      .status,
    200,
  );
  assert.equal(
    (await post("/api/team/roles/delete", { ...boss, body: { roleId: r["Владелец"] } })).status,
    403,
  );
  const memberId = (await call("GET", "/api/team", boss)).json.me;
  assert.ok(memberId);
});

test(
  "отключили пригласившего — его ссылка мертва, а чужого владельца не отозвать",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss7@example.com", "10.1.0.9");
    const r = await roles(boss);
    const top = await topRole(boss);
    const chief = await join(boss, "chief7@example.com", r["Начальник склада"]);
    const chiefId = (await call("GET", "/api/team", chief)).json.me;
    // Начальник перед увольнением зовёт свою вторую почту.
    await post("/api/team/invite", {
      ...chief,
      body: { warehouseRef: WH, email: "backdoor7@example.com", roleId: r["Начальник склада"] },
    });
    const token = tokenIn(await lastMail("backdoor7@example.com"));
    assert.equal((await post("/api/auth/invite/info", { body: { token } })).status, 200);
    await post("/api/team/disable", { ...boss, body: { memberId: chiefId } });
    assert.equal((await post("/api/auth/invite/info", { body: { token } })).status, 404);
    const late = await post("/api/auth/invite/accept", {
      body: { token, password: PW, consent: true },
    });
    assert.equal(late.status, 404);
    // Понизили пригласившего — приглашение тоже гаснет.
    await post("/api/team/disable", { ...boss, body: { memberId: chiefId, disabled: false } });
    await post("/api/team/invite", {
      ...chief,
      body: { warehouseRef: WH, email: "second7@example.com", roleId: r["Начальник склада"] },
    });
    const t2 = tokenIn(await lastMail("second7@example.com"));
    await post("/api/team/role", {
      ...boss,
      body: { memberId: chiefId, roleId: r["Кладовщик / оператор"] },
    });
    assert.equal((await post("/api/auth/invite/info", { body: { token: t2 } })).status, 404);
    // Приглашение владельцу начальник отозвать не может.
    await post("/api/team/role", {
      ...boss,
      body: { memberId: chiefId, roleId: r["Начальник склада"] },
    });
    await post("/api/team/invite", {
      ...boss,
      body: { warehouseRef: WH, email: "own7@example.com", roleId: top },
    });
    const ownerId = (await call("GET", "/api/team", boss)).json.members.find(
      (m) => m.email === "own7@example.com",
    ).id;
    assert.equal(
      (await post("/api/team/invite/revoke", { ...chief, body: { memberId: ownerId } })).status,
      403,
    );
  },
);

test("письмо-приглашение не несёт чужих переводов строк", { skip: SKIP }, () => {
  const { inviteLetter } = require("../src/cabinet/letters.js");
  const l = inviteLetter({ company: "Ёлка\r\nBcc: x@y.z", role: "Роль\nещё", link: "https://u" });
  assert.ok(!/[\r\n]/.test(l.subject));
  assert.ok(!l.text.includes("\nBcc:"));
});

test(
  "роль у стола: назначить, снять, не выше своей, не удалить занятую",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-desk@example.com", "10.1.0.9");
    const r = await roles(boss);
    // Сотрудники стола — люди склада: начальник ставит роль только своим.
    const staff = ["stf-olga", "stf-ivan", "stf-petr", "stf-anna"].map((id) => ({ id, name: id }));
    const card = await post("/api/cabinet/snapshot", {
      ...boss,
      body: {
        version: await version(boss),
        format: 8,
        data: { warehouse: { id: WH, name: "Склад", staff } },
      },
    });
    assert.equal(card.status, 200, JSON.stringify(card.json));
    const top = await topRole(boss);
    const set = (who, staffRef, roleId) =>
      post("/api/team/desk-role", { ...who, body: { staffRef, roleId } });
    assert.equal((await set(boss, "stf-olga", r["Начальник склада"])).status, 200);
    assert.equal((await set(boss, "stf-ivan", r["Кладовщик / оператор"])).status, 200);
    let list = (await call("GET", "/api/team", boss)).json;
    assert.deepEqual(list.deskRoles, {
      "stf-olga": r["Начальник склада"],
      "stf-ivan": r["Кладовщик / оператор"],
    });
    assert.ok(list.permissions.some((p) => p.code === "goods.decide"));
    // Начальник склада получил решения по товару и в старой, и в новой компании.
    const chiefRole = list.roles.find((x) => x.name === "Начальник склада");
    assert.ok(chiefRole.permissions.includes("goods.decide"));

    // Начальник не даёт роль выше своей и не снимает её с того, у кого она выше.
    const chief = await join(boss, "chief-desk@example.com", r["Начальник склада"]);
    assert.equal((await set(chief, "stf-petr", top)).status, 403);
    assert.equal((await set(boss, "stf-petr", top)).status, 200);
    assert.equal((await set(chief, "stf-petr", null)).status, 403);
    assert.equal((await set(chief, "stf-ivan", r["Кладовщик / оператор"])).status, 200);
    // Кладовщик с почтой роли у стола не трогает.
    const keeper = await join(boss, "keeper-desk@example.com", r["Кладовщик / оператор"]);
    assert.equal((await set(keeper, "stf-ivan", r["Кладовщик / оператор"])).status, 403);
    // Битый id и чужая роль — 404.
    assert.equal((await set(boss, "../x", r["Кладовщик / оператор"])).status, 404);
    const other = await owner("boss-desk2@example.com", "10.1.0.10");
    assert.equal((await set(other, "stf-ivan", r["Кладовщик / оператор"])).status, 404);

    // Свою роль, которую носит сотрудник стола, не удалить; снял — удаляется.
    const saved = await post("/api/team/roles/save", {
      ...boss,
      body: { name: "Старший смены", permissions: ["stock.view", "goods.decide"] },
    });
    assert.equal((await set(boss, "stf-anna", saved.json.roleId)).status, 200);
    const busy = await post("/api/team/roles/delete", {
      ...boss,
      body: { roleId: saved.json.roleId },
    });
    assert.equal(busy.status, 409);
    assert.equal((await set(boss, "stf-anna", null)).status, 200);
    list = (await call("GET", "/api/team", boss)).json;
    assert.equal(list.deskRoles["stf-anna"], undefined);
    const free = await post("/api/team/roles/delete", {
      ...boss,
      body: { roleId: saved.json.roleId },
    });
    assert.equal(free.status, 200);
  },
);

test("бейдж на строку с ролью выше своей не выпустить и не погасить", { skip: SKIP }, async () => {
  const boss = await owner("boss-badge@example.com", "10.1.0.11");
  const r = await roles(boss);
  const top = await topRole(boss);
  const set = (staffRef, roleId) =>
    post("/api/team/desk-role", { ...boss, body: { staffRef, roleId } });
  assert.equal((await set("stf-top", top)).status, 200);
  assert.equal((await set("stf-low", r["Кладовщик / оператор"])).status, 200);
  // Своя роль начальника без goods.decide: бейдж на владельца ему не выпустить.
  const saved = await post("/api/team/roles/save", {
    ...boss,
    body: { name: "Начальник без решений", permissions: ["staff.manage", "stock.view"] },
  });
  const chief = await join(boss, "chief-badge@example.com", saved.json.roleId);
  const issue = (who, staffRef) =>
    post("/api/cabinet/badges/issue", { ...who, body: { staffRef } });
  const revoke = (who, staffRef) =>
    post("/api/cabinet/badges/revoke", { ...who, body: { staffRef } });
  assert.equal((await issue(chief, "stf-top")).status, 403);
  assert.equal((await issue(boss, "stf-top")).status, 200);
  assert.equal((await revoke(chief, "stf-top")).status, 403);
  // У кладовщика есть права, которых нет у этого начальника, — тоже нельзя.
  // Строке без роли бейдж даёт «Кладовщика» (028) — а его этому начальнику
  // не дать: отказ «нет роли», а не бейдж, с которым стол не пустит.
  assert.equal((await issue(chief, "stf-low")).status, 403);
  const none = await issue(chief, "stf-new");
  assert.equal(none.status, 409);
  assert.equal(none.json.error, "no_role");
  assert.equal((await issue(boss, "stf-new")).status, 200);
  const list = (await call("GET", "/api/team", boss)).json;
  assert.equal(list.deskRoles["stf-new"], r["Кладовщик / оператор"]);
});

test(
  "повысили роль строки — бейдж от младшего руководителя погас, от владельца остался",
  {
    skip: SKIP,
  },
  async () => {
    const boss = await owner("boss-raise@example.com", "10.1.0.12");
    const r = await roles(boss);
    const top = await topRole(boss);
    const chief = await join(boss, "chief-raise@example.com", r["Начальник склада"]);
    const issue = (who, staffRef) =>
      post("/api/cabinet/badges/issue", { ...who, body: { staffRef } });
    const set = (staffRef, roleId) =>
      post("/api/team/desk-role", { ...boss, body: { staffRef, roleId } });
    const live = async (staffRef) =>
      (
        await db.root.query(
          `SELECT count(*)::int AS n FROM uklad.desk_badges
         WHERE org_id = $1 AND staff_ref = $2 AND revoked_at IS NULL`,
          [boss.org, staffRef],
        )
      ).rows[0].n;
    // Новичкам без роли бейджи выпускают начальник и владелец.
    assert.equal((await issue(chief, "stf-a")).status, 200);
    assert.equal((await issue(boss, "stf-b")).status, 200);
    // Владелец даёт обоим свою роль: копия у начальника не должна её получить.
    assert.equal((await set("stf-a", top)).status, 200);
    assert.equal((await set("stf-b", top)).status, 200);
    assert.equal(await live("stf-a"), 0);
    assert.equal(await live("stf-b"), 1);
    // Роль в пределах прав начальника бейдж не гасит.
    assert.equal((await issue(chief, "stf-c")).status, 200);
    assert.equal((await set("stf-c", r["Кладовщик / оператор"])).status, 200);
    assert.equal(await live("stf-c"), 1);
  },
);

test("кладовщик с почтой смотрит кабинет без ставок, но не пишет", { skip: SKIP }, async () => {
  const boss = await owner("boss-view@example.com", "10.1.0.13");
  const r = await roles(boss);
  const data = {
    warehouse: {
      id: "w1",
      name: "Склад",
      staff: [
        { id: "stf-ivan", name: "Иван", role: "Упаковщик", hourlyRate: 300, phone: "+7 900" },
      ],
    },
    // Справочники лежат строками, а не в документе: права смотрящего — те же.
    account: { type: "company", name: "Кирилл", org: "ООО Склад", inn: "7700000000" },
    serviceSettings: { enabled: { pick: true }, prices: { pick: 15 }, twoStageReceiving: true },
    breakPolicy: { mode: "x" },
    boxSeq: 7,
  };
  const first = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: await version(boss), format: 8, data },
  });
  assert.equal(first.status, 200);
  const keeper = await join(boss, "keeper-view@example.com", r["Кладовщик / оператор"]);
  const seen = await call("GET", "/api/cabinet/snapshot", keeper);
  assert.equal(seen.status, 200);
  assert.equal(seen.json.snapshot.viewer, true);
  const raw = await db.root.query(
    `SELECT data ?| array['account', 'serviceSettings', 'breakPolicy', 'boxSeq'] AS inline
     FROM uklad.cabinet_snapshots WHERE org_id = $1`,
    [boss.org],
  );
  assert.equal(raw.rows[0].inline, false);
  const v = seen.json.snapshot.data;
  // Номер тары — с «Остатками»; реквизиты без ИНН и цены без сумм — как прежде.
  assert.equal(v.boxSeq, 7);
  assert.equal(v.account.org, "ООО Склад");
  assert.equal(v.account.inn, undefined);
  assert.deepEqual(v.serviceSettings, { enabled: {}, prices: {}, twoStageReceiving: true });
  assert.equal("companySettings" in v || "warehouseSettings" in v, false);
  // Персонала у кладовщика нет вовсе: «Персонал: чтение» (`staff.view`) не
  // выдан (033). Имена и должности без ставок видит старший — матрица ниже.
  assert.deepEqual(seen.json.snapshot.data.warehouse.staff, []);
  // Записать — нельзя ни целиком, ни частью.
  const write = await post("/api/cabinet/snapshot", {
    ...keeper,
    body: { version: seen.json.snapshot.version, format: 8, data },
  });
  assert.equal(write.status, 403);
  // У руководителя — полный снимок, без пометки просмотра.
  const full = await call("GET", "/api/cabinet/snapshot", boss);
  assert.equal(full.json.snapshot.viewer, undefined);
  assert.equal(full.json.snapshot.data.warehouse.staff[0].hourlyRate, 300);
  assert.equal(full.json.snapshot.data.account.inn, "7700000000");
  assert.deepEqual(full.json.snapshot.data.serviceSettings.prices, { pick: 15 });
  assert.deepEqual(full.json.snapshot.data.breakPolicy, { mode: "x" });
  // Роль без «Остатков» кабинет не видит вовсе.
  const chatOnly = await post("/api/team/roles/save", {
    ...boss,
    body: { name: "Только чат", permissions: ["chat.use"] },
  });
  const talker = await join(boss, "talker-view@example.com", chatOnly.json.roleId);
  assert.equal((await call("GET", "/api/cabinet/snapshot", talker)).status, 403);
  // Роль продавца склад целиком не видит: там товар всех партнёров.
  const sellerish = await post("/api/team/roles/save", {
    ...boss,
    body: { name: "Как продавец", permissions: ["stock.view", "seller.requests"] },
  });
  const seller = await join(boss, "seller-view@example.com", sellerish.json.roleId);
  assert.equal((await call("GET", "/api/cabinet/snapshot", seller)).status, 403);
});

test(
  "роль без «Персонала» пишет только свои модули, закрытое ей не затирается",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-scope@example.com", "10.1.0.14");
    const r = await roles(boss);
    const data = {
      boxSeq: 1,
      serviceSettings: { enabled: { pack: true }, prices: { pack: 25 } },
      warehouse: {
        id: "w1",
        name: "Склад",
        staff: [{ id: "stf-ivan", name: "Иван", role: "Упаковщик", hourlyRate: 300 }],
      },
    };
    const first = await post("/api/cabinet/snapshot", {
      ...boss,
      body: { version: await version(boss), format: 8, data },
    });
    assert.equal(first.status, 200);
    const editorRole = await post("/api/team/roles/save", {
      ...boss,
      body: { name: "Товаровед", permissions: ["stock.view", "products.edit"] },
    });
    const editor = await join(boss, "editor-scope@example.com", editorRole.json.roleId);
    const seen = (await call("GET", "/api/cabinet/snapshot", editor)).json.snapshot;
    assert.ok(seen.writable.includes("categories"));
    assert.ok(!seen.writable.includes("boxSeq"));
    assert.ok(!seen.writable.includes("warehouse"));
    const doc = { ...seen.data };
    delete doc.products;
    const changes = (who, version, body) =>
      post("/api/cabinet/snapshot/changes", {
        ...who,
        body: { version, format: 8, slots: [], upsert: [], remove: [], ...body },
      });
    // Строка работы склада (тут журнал смен) — отказ всей записи.
    const row = { w: "", d: "staffEvents", ref: "e1", pos: 0, data: { id: "e1" } };
    const withRow = {
      doc: { ...doc, staffEvents: { $rows: 1 } },
      slots: [{ w: "", d: "staffEvents" }],
      upsert: [row],
    };
    assert.equal((await changes(editor, seen.version, withRow)).status, 403);
    // Каталог ложится; тара, цены, ставки и персонал, которых у него в
    // копии нет или которые он поменял, остаются как в базе.
    const own = await changes(editor, seen.version, {
      doc: {
        ...doc,
        categories: [{ id: "c1", name: "Посуда" }],
        boxSeq: 7,
        warehouse: { ...doc.warehouse, staff: [{ id: "stf-ivan", name: "Взломщик" }] },
      },
    });
    assert.equal(own.status, 200);
    const full = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
    assert.deepEqual(full.categories, [{ id: "c1", name: "Посуда" }]);
    assert.equal(full.boxSeq, 1);
    assert.equal(full.serviceSettings.prices.pack, 25);
    assert.equal(full.warehouse.staff[0].name, "Иван");
    assert.equal(full.warehouse.staff[0].hourlyRate, 300);
    // Товары он добавляет и правит, но не удаляет: каталог чистит только
    // руководитель.
    const v1 = (await call("GET", "/api/cabinet/snapshot", editor)).json.snapshot.version;
    const card = { id: "pr-1", sku: "A1", name: "Кружка" };
    assert.equal((await changes(editor, v1, { doc, products: [card] })).status, 200);
    const v2 = (await call("GET", "/api/cabinet/snapshot", editor)).json.snapshot.version;
    assert.equal((await changes(editor, v2, { doc, products: [] })).status, 403);
    const kept = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
    assert.deepEqual(
      kept.products.map((x) => x.id),
      ["pr-1"],
    );
    // Кладовщик работу склада делает у стола операциями: итог (тару,
    // ячейки, заявки) снимком не правит вовсе.
    const keeper = await join(boss, "keeper-scope@example.com", r["Кладовщик / оператор"]);
    const v = (await call("GET", "/api/cabinet/snapshot", keeper)).json.snapshot;
    assert.deepEqual(v.writable, []);
    const tried = await changes(keeper, v.version, { doc: { ...doc, boxSeq: 9 } });
    assert.equal(tried.status, 403);
  },
);

// Матрица стандартных ролей (Кирилл 14.11: «начальник должен разделять права —
// кто, куда, к чему имеет доступ; это база баз»). Каждая стандартная роль
// входит по почте: что видит на своём складе, что может записать и что чужая
// компания ей закрыта. Новая роль или раздел — строка в `MATRIX`.
const WORK = {
  placements: { pr1: { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 } },
  expectedShipments: [{ id: "es1" }],
  receivingEvents: [{ id: "re1" }],
  requests: [{ id: "rq1" }],
  outboundBoxes: [{ id: "ob1" }],
  shipments: [{ id: "sh1" }],
  disputes: [{ id: "d1" }],
  serviceSettings: { enabled: { pack: true }, prices: { pack: 25 } },
  warehouse: {
    id: "w1",
    name: "Склад",
    storageRatePerCell: 30,
    staff: [{ id: "stf-1", name: "Иван", role: "Упаковщик", hourlyRate: 300, phone: "+7 900" }],
  },
};
const AREAS = [
  "expectedShipments",
  "receivingEvents",
  "requests",
  "outboundBoxes",
  "shipments",
  "disputes",
];
// null — руководитель: снимок целиком; иначе — какие разделы работы открыты.
const MATRIX = {
  "Начальник склада": null,
  "Старший смены": AREAS,
  "Старший участка": AREAS,
  "Кладовщик / оператор": AREAS,
};

test("матрица ролей: свой склад, запись и чужая компания", { skip: SKIP }, async () => {
  const boss = await owner("boss-matrix@example.com", "10.1.0.40");
  const other = await owner("boss-matrix-2@example.com", "10.1.0.41");
  const r = await roles(boss);
  const first = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: await version(boss), format: 8, data: WORK },
  });
  assert.equal(first.status, 200);
  let n = 0;
  for (const [name, open] of Object.entries(MATRIX)) {
    assert.ok(r[name], `стандартной роли «${name}» нет`);
    const who = await join(boss, `matrix-${n++}@example.com`, r[name]);
    const seen = await call("GET", "/api/cabinet/snapshot", who);
    assert.equal(seen.status, 200, name);
    const snap = seen.json.snapshot;
    if (open === null) {
      assert.equal(snap.viewer, undefined, name);
      assert.equal(snap.data.serviceSettings.prices.pack, 25, name);
    } else {
      assert.equal(snap.viewer, true, name);
      // Справочник (остатки, план) — всем, кто смотрит.
      assert.deepEqual(snap.data.placements, WORK.placements, name);
      for (const key of AREAS)
        assert.deepEqual(snap.data[key], open.includes(key) ? WORK[key] : [], `${name}: ${key}`);
      // Денег и контактов смотрящему нет.
      assert.deepEqual(snap.data.serviceSettings.prices, {}, name);
      assert.equal(snap.data.warehouse.storageRatePerCell, undefined, name);
      // Персонал — только старшему (`staff.view`), и то без ставок и телефонов.
      const staff = snap.data.warehouse.staff;
      if (name === "Старший смены")
        assert.deepEqual(staff, [{ id: "stf-1", name: "Иван", role: "Упаковщик" }], name);
      else assert.deepEqual(staff, [], name);
      // Записать кабинет целиком нельзя, и раздать права — тоже.
      const write = await post("/api/cabinet/snapshot", {
        ...who,
        body: { version: snap.version, format: 8, data: WORK },
      });
      assert.equal(write.status, 403, name);
      const grant = await post("/api/team/roles/save", {
        ...who,
        body: { name: "Себе", permissions: ["staff.manage"] },
      });
      assert.ok(grant.status >= 400, name);
    }
    // Чужая компания закрыта любой роли.
    const foreign = await call("GET", "/api/cabinet/snapshot", { ...who, org: other.org });
    assert.ok(foreign.status === 401 || foreign.status === 403, `${name}: ${foreign.status}`);
  }
});

test("матрица ролей: второй склад компании и создание склада", { skip: SKIP }, async () => {
  // У руководителя открыт склад Б («w2»), сотрудник позван на склад А («w1»,
  // лежит среди остальных, его работа — в `warehouseData`). Миграция 034.
  const boss = await owner("boss-matrix-wh@example.com", "10.1.0.42");
  const r = await roles(boss);
  const other = {
    id: "w2",
    name: "Склад Б",
    floors: [{ id: "f2", name: "План Б", modules: [] }],
    staff: [{ id: "stf-2", name: "Пётр", role: "Кладовщик", hourlyRate: 500 }],
  };
  const workOf = (tag) => Object.fromEntries(AREAS.map((k) => [k, [{ id: `${k}-${tag}` }]]));
  const data = {
    ...WORK,
    ...workOf("b"),
    warehouse: other,
    otherWarehouses: [{ ...WORK.warehouse, floors: [{ id: "f1", name: "План А", modules: [] }] }],
    warehouseData: { w1: workOf("a") },
  };
  const put = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: await version(boss), format: 8, data },
  });
  assert.equal(put.status, 200);
  let n = 0;
  for (const [name, open] of Object.entries(MATRIX)) {
    if (open === null) continue; // руководитель видит и пишет всю компанию
    const who = await join(boss, `matrix-wh-${n++}@example.com`, r[name], { warehouseRef: "w1" });
    const snap = (await call("GET", "/api/cabinet/snapshot", who)).json.snapshot;
    assert.equal(snap.data.warehouse.id, "w1", name);
    assert.deepEqual(snap.data.otherWarehouses, [], name);
    assert.deepEqual(snap.data.warehouseData, {}, name);
    // Работа — склада А, а не открытого у руководителя склада Б.
    for (const key of AREAS) {
      assert.deepEqual(snap.data[key], open.includes(key) ? [{ id: `${key}-a` }] : [], name);
    }
    assert.ok(!JSON.stringify(snap.data).includes("Склад Б"), name);
    assert.ok(!JSON.stringify(snap.data).includes('-b"'), name);
    // План склада Б не пишет — ни как свой, ни под видом своего.
    const doc = { ...snap.data, warehouse: { id: "w2", floors: [] } };
    delete doc.products;
    const plan = await post("/api/cabinet/snapshot/changes", {
      ...who,
      body: { version: snap.version, format: 8, slots: [], upsert: [], remove: [], doc },
    });
    assert.equal(plan.status, 403, name);
    // Новый склад — запись кабинета целиком: нельзя.
    const add = await post("/api/cabinet/snapshot", {
      ...who,
      body: {
        version: snap.version,
        format: 8,
        data: { ...snap.data, otherWarehouses: [{ id: "w-new", name: "Новый", staff: [] }] },
      },
    });
    assert.equal(add.status, 403, name);
  }
  const full = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
  assert.equal(full.warehouse.id, "w2");
  assert.deepEqual(full.warehouse.floors, other.floors);
  assert.deepEqual(
    full.otherWarehouses.map((w) => w.id),
    ["w1"],
  );
});

// Кирилл 22.11: удалить склад, компанию и владельца может только владелец, а
// роль владельца из кабинета не дать никому — передача владения через поддержку.
test("склад удаляет только владелец, роль владельца не дать", { skip: SKIP }, async () => {
  const boss = await owner("boss-own@example.com", "10.1.0.50");
  const r = await roles(boss);
  const two = {
    warehouse: { id: WH, name: "Склад", staff: [] },
    otherWarehouses: [{ id: "w2", name: "Склад 2", staff: [] }],
  };
  const put = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: await version(boss), format: 8, data: two },
  });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const chief = await join(boss, "chief-own@example.com", r["Начальник склада"]);
  // Начальник склада w1 видит только свой склад (Кирилл 22.11: склады
  // связывает только владелец).
  const seen = (await call("GET", "/api/cabinet/snapshot", chief)).json.snapshot.data;
  assert.equal(seen.warehouse.id, WH);
  assert.deepEqual(seen.otherWarehouses, []);
  assert.ok(!JSON.stringify(seen).includes("Склад 2"));
  // Свой склад правит; чужой склад в записи — отказ, кабинет не меняется.
  const v = await version(chief);
  const foreign = await post("/api/cabinet/snapshot", {
    ...chief,
    body: {
      version: v,
      format: 8,
      data: { ...two, otherWarehouses: [{ id: "w2", name: "Склад Б", staff: [] }] },
    },
  });
  assert.equal(foreign.status, 409);
  assert.equal(foreign.json.error, "warehouse_owner");
  const hide = await post("/api/cabinet/snapshot", {
    ...chief,
    body: {
      version: v,
      format: 8,
      data: {
        ...two,
        otherWarehouses: [{ id: "w2", name: "Склад 2", staff: [], placeholder: true }],
      },
    },
  });
  assert.equal(hide.status, 409);
  const fresh = await post("/api/cabinet/snapshot", {
    ...chief,
    body: {
      version: v,
      format: 8,
      data: { ...two, otherWarehouses: [{ id: "w-new", name: "Н" }] },
    },
  });
  assert.equal(fresh.status, 409);
  assert.equal(await version(chief), v);
  // Запись своего склада без чужого — чужой склад остаётся как был.
  const own = await post("/api/cabinet/snapshot", {
    ...chief,
    body: {
      version: v,
      format: 8,
      data: { ...seen, warehouse: { ...seen.warehouse, name: "Склад А" } },
    },
  });
  assert.equal(own.status, 200, JSON.stringify(own.json));
  const kept = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
  assert.deepEqual(
    [kept.warehouse.name, ...kept.otherWarehouses.map((w) => w.name)],
    ["Склад А", "Склад 2"],
  );
  // Владелец удаляет.
  const gone = await post("/api/cabinet/snapshot", {
    ...boss,
    body: {
      version: await version(boss),
      format: 8,
      data: { warehouse: two.warehouse, otherWarehouses: [] },
    },
  });
  assert.equal(gone.status, 200, JSON.stringify(gone.json));

  // Владелец не делает владельцем другого: ни приглашением, ни сменой роли, ни у стола.
  const invite = await post("/api/team/invite", {
    ...boss,
    body: { warehouseRef: WH, email: "owner2@example.com", roleId: r["Владелец"] },
  });
  assert.equal(invite.status, 403);
  assert.equal(invite.json.error, "owner_role");
  const chiefId = (await call("GET", "/api/team", chief)).json.me;
  const promote = await post("/api/team/role", {
    ...boss,
    body: { memberId: chiefId, roleId: r["Владелец"] },
  });
  assert.equal(promote.status, 403);
  assert.equal(promote.json.error, "owner_role");
  const desk = await post("/api/team/desk-role", {
    ...boss,
    body: { staffRef: "stf-any", roleId: r["Владелец"] },
  });
  assert.equal(desk.status, 403);
});

test("журнал смен, корректировки и размещения — только своего склада", { skip: SKIP }, async () => {
  const { splitRecords } = require("../src/cabinet/records.js");
  const boss = await owner("boss-root@example.com", "10.1.0.60");
  const r = await roles(boss);
  const cell = (floorId) => ({ floorId, moduleId: "m", shelfIndex: 0, cellIndex: 0 });
  const ev = (id, staffId) => ({ id, staffId, type: "error", at: 1 });
  const pay = (id, staffId) => ({
    id,
    staffId,
    kind: "bonus",
    amount: 100,
    reason: "р",
    at: 1,
    createdAt: 1,
  });
  const data = {
    warehouse: {
      id: WH,
      name: "Склад",
      staff: [{ id: "s1", name: "Иван" }],
      floors: [{ id: "f1" }],
    },
    otherWarehouses: [
      { id: "w2", name: "Склад 2", staff: [{ id: "s2", name: "Пётр" }], floors: [{ id: "f2" }] },
    ],
    staffEvents: [ev("e1", "s1"), ev("e2", "s2")],
    payAdjustments: [pay("a1", "s1"), pay("a2", "s2")],
    placements: { p1: cell("f1"), p2: cell("f2") },
    categories: [{ id: "c1", name: "Обувь" }],
  };
  const put = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: await version(boss), format: 8, data },
  });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  const chief = await join(boss, "chief-root@example.com", r["Начальник склада"]);
  const seen = (await call("GET", "/api/cabinet/snapshot", chief)).json.snapshot.data;
  assert.deepEqual(
    seen.staffEvents.map((x) => x.id),
    ["e1"],
  );
  assert.deepEqual(
    seen.payAdjustments.map((x) => x.id),
    ["a1"],
  );
  assert.deepEqual(Object.keys(seen.placements), ["p1"]);
  assert.ok(!JSON.stringify(seen).includes("Пётр"));
  // Запись целиком: своё меняется, чужое из базы, даже если прислано пустым.
  const whole = await post("/api/cabinet/snapshot", {
    ...chief,
    body: {
      version: await version(chief),
      format: 8,
      data: {
        ...seen,
        staffEvents: [ev("e3", "s1"), ev("e4", "s2")],
        payAdjustments: [],
        placements: {},
      },
    },
  });
  assert.equal(whole.status, 200, JSON.stringify(whole.json));
  const full = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
  assert.deepEqual(full.staffEvents.map((x) => x.id).sort(), ["e2", "e3"]);
  assert.deepEqual(
    full.payAdjustments.map((x) => x.id),
    ["a2"],
  );
  assert.deepEqual(Object.keys(full.placements), ["p2"]);

  // «Только изменённое»: удержание своему и правка общей категории — можно.
  const mine = (await call("GET", "/api/cabinet/snapshot", chief)).json.snapshot.data;
  const diff = (after) => {
    const was = new Map(splitRecords(mine).items.map((x) => [`${x.w}/${x.d}/${x.ref}`, x]));
    const now = splitRecords(after);
    const upsert = now.items.filter(
      (x) => JSON.stringify(was.get(`${x.w}/${x.d}/${x.ref}`)?.data) !== JSON.stringify(x.data),
    );
    const left = new Set(now.items.map((x) => `${x.w}/${x.d}/${x.ref}`));
    const remove = [...was.values()]
      .filter((x) => !left.has(`${x.w}/${x.d}/${x.ref}`))
      .map(({ w, d, ref }) => ({ w, d, ref }));
    const doc = { ...now.doc };
    delete doc.products;
    return { doc, slots: now.slots, upsert, remove };
  };
  const v = await version(chief);
  const ok = await post("/api/cabinet/snapshot/changes", {
    ...chief,
    body: {
      version: v,
      format: 8,
      ...diff({
        ...mine,
        payAdjustments: [pay("a3", "s1")],
        categories: [{ id: "c1", name: "Одежда" }],
      }),
    },
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const after1 = (await call("GET", "/api/cabinet/snapshot", boss)).json.snapshot.data;
  assert.deepEqual(after1.payAdjustments.map((x) => x.id).sort(), ["a2", "a3"]);
  assert.equal(after1.categories[0].name, "Одежда");
  // Удержание человеку чужого склада — отказ.
  const mine2 = (await call("GET", "/api/cabinet/snapshot", chief)).json.snapshot.data;
  const bad = await post("/api/cabinet/snapshot/changes", {
    ...chief,
    body: {
      version: await version(chief),
      format: 8,
      ...(() => {
        const d = diff({ ...mine2, payAdjustments: [...mine2.payAdjustments, pay("a4", "s2")] });
        d.upsert = d.upsert.filter((x) => x.ref === "a4");
        return d;
      })(),
    },
  });
  assert.equal(bad.status, 403);
});

test(
  "команда — люди своего склада: начальник видит и трогает только своих",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-team@example.com", "10.1.0.70");
    const r = await roles(boss);
    const two = {
      warehouse: { id: WH, name: "Склад", staff: [{ id: "s1", name: "Иван" }] },
      otherWarehouses: [{ id: "w2", name: "Склад 2", staff: [{ id: "s2", name: "Пётр" }] }],
    };
    const put = await post("/api/cabinet/snapshot", {
      ...boss,
      body: { version: await version(boss), format: 8, data: two },
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    const chief = await join(boss, "chief-team@example.com", r["Начальник склада"]);
    // У склада w2 свои роли (058): роль склада w1 туда не дать.
    const w2keeper = (await call("GET", "/api/team", boss)).json.roles.find(
      (x) => x.warehouseRef === "w2" && x.name === "Кладовщик / оператор",
    ).id;
    const wrong = await post("/api/team/invite", {
      ...boss,
      body: {
        email: "wrong-team@example.com",
        roleId: r["Кладовщик / оператор"],
        warehouseRef: "w2",
      },
    });
    assert.equal(wrong.status, 409);
    await join(boss, "other-team@example.com", w2keeper, { warehouseRef: "w2" });
    const all = (await call("GET", "/api/team", boss)).json;
    const other = all.members.find((m) => m.email === "other-team@example.com");
    assert.equal(other.warehouseRef, "w2");
    // Начальник склада w1: свои и владелец, без людей склада w2.
    const seen = (await call("GET", "/api/team", chief)).json;
    const emails = seen.members.map((m) => m.email).sort();
    assert.deepEqual(emails, ["boss-team@example.com", "chief-team@example.com"]);
    // Человека склада w2 не трогает ни ролью, ни отключением, ни переводом.
    const role = await post("/api/team/role", {
      ...chief,
      body: { memberId: other.id, roleId: r["Старший смены"] },
    });
    assert.equal(role.status, 404);
    const off = await post("/api/team/disable", { ...chief, body: { memberId: other.id } });
    assert.equal(off.status, 404);
    const move = await post("/api/team/place", {
      ...chief,
      body: { memberId: other.id, warehouseRef: WH },
    });
    assert.equal(move.status, 404);
    // Позвать на чужой склад и дать роль сотруднику чужого стола — нельзя.
    const inv = await post("/api/team/invite", {
      ...chief,
      body: { email: "x-team@example.com", roleId: r["Кладовщик / оператор"], warehouseRef: "w2" },
    });
    assert.equal(inv.status, 404);
    const desk = await post("/api/team/desk-role", {
      ...chief,
      body: { staffRef: "s2", roleId: r["Старший смены"] },
    });
    assert.equal(desk.status, 404);
    const mine = await post("/api/team/desk-role", {
      ...chief,
      body: { staffRef: "s1", roleId: r["Старший смены"] },
    });
    assert.equal(mine.status, 200, JSON.stringify(mine.json));
    // Владелец видит всех.
    assert.equal(all.members.length, 3);
  },
);

test(
  "роли у каждого склада свои: начальник правит только роли своего",
  { skip: SKIP },
  async () => {
    const boss = await owner("boss-roles-wh@example.com", "10.1.0.80");
    const r = await roles(boss);
    const two = {
      warehouse: { id: WH, name: "Склад", staff: [] },
      otherWarehouses: [{ id: "w2", name: "Склад 2", staff: [] }],
    };
    const put = await post("/api/cabinet/snapshot", {
      ...boss,
      body: { version: await version(boss), format: 8, data: two },
    });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    const all = (await call("GET", "/api/team", boss)).json.roles;
    const w2 = Object.fromEntries(
      all.filter((x) => x.warehouseRef === "w2").map((x) => [x.name, x.id]),
    );
    assert.ok(
      w2["Кладовщик / оператор"] && w2["Кладовщик / оператор"] !== r["Кладовщик / оператор"],
    );
    // Своя роль склада w2 владельцем — только на w2.
    const test2 = await post("/api/team/roles/save", {
      ...boss,
      body: { name: "Тест", permissions: ["stock.view"], warehouseRef: "w2" },
    });
    assert.equal(test2.status, 200);
    const chief = await join(boss, "chief-roles-wh@example.com", r["Начальник склада"]);
    // Начальник w1 видит роли своего склада и не видит «Тест» склада w2.
    const seen = (await call("GET", "/api/team", chief)).json.roles;
    assert.ok(seen.every((x) => x.warehouseRef === WH || x.warehouseRef === null));
    assert.ok(!seen.some((x) => x.id === test2.json.roleId));
    // Роль склада w2 не правит и не удаляет.
    const edit = await post("/api/team/roles/save", {
      ...chief,
      body: { roleId: w2["Кладовщик / оператор"], name: "Х", permissions: ["stock.view"] },
    });
    assert.equal(edit.status, 404);
    const del = await post("/api/team/roles/delete", {
      ...chief,
      body: { roleId: test2.json.roleId },
    });
    assert.equal(del.status, 404);
    // В названии роли цифр нет (Кирилл 22.11).
    for (const name of ["Роль 1", "123", "Склад№"]) {
      const digits = await post("/api/team/roles/save", {
        ...chief,
        body: { name, permissions: ["stock.view"] },
      });
      assert.deepEqual([digits.status, digits.json.error], [422, "role_name"], name);
    }
    // Новая роль начальника — на его складе, даже если просил другой.
    const mine = await post("/api/team/roles/save", {
      ...chief,
      body: { name: "Моя", permissions: ["stock.view"], warehouseRef: "w2" },
    });
    assert.equal(mine.status, 200);
    const made = (await call("GET", "/api/team", boss)).json.roles.find(
      (x) => x.id === mine.json.roleId,
    );
    assert.equal(made.warehouseRef, WH);
  },
);
