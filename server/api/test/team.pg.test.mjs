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
  const r = await call("GET", "/api/team", who);
  return Object.fromEntries(r.json.roles.map((x) => [x.name, x.id]));
}

/** Пригласить и принять новым человеком → его кука. */
async function join(who, email, roleId) {
  const inv = await post("/api/team/invite", { ...who, body: { email, roleId } });
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
    body: { email: "Chief@Example.com", roleId: r["Начальник склада"], name: "Пётр" },
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
    body: { email: "x@example.com", roleId: r["Владелец"] },
  });
  assert.equal(up.status, 403);
  // Владельца не переназначить и не отключить.
  const demote = await post("/api/team/role", {
    ...chief,
    body: { memberId: bossId, roleId: r["Кладовщик"] },
  });
  assert.equal(demote.status, 403);
  const off = await post("/api/team/disable", { ...chief, body: { memberId: bossId } });
  assert.equal(off.status, 403);
  // Себя тоже.
  const self = await post("/api/team/role", {
    ...chief,
    body: { memberId: chiefId, roleId: r["Кладовщик"] },
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
  // Опечатка в праве — отказ, а не роль без права.
  const typo = await post("/api/team/roles/save", {
    ...chief,
    body: { name: "Опечатка", permissions: ["stock.vieww"] },
  });
  assert.ok(typo.status >= 400);
  // Роли по умолчанию не правятся.
  const builtIn = await post("/api/team/roles/save", {
    ...chief,
    body: { roleId: r["Кладовщик"], name: "Кладовщик", permissions: ["stock.view"] },
  });
  assert.equal(builtIn.status, 403);
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
    (await post("/api/team/role", { ...boss, body: { memberId: chiefId, roleId: r["Кладовщик"] } }))
      .status,
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
    const clerk = await join(boss, "clerk4@example.com", r["Кладовщик"]);
    assert.equal((await call("GET", "/api/team", clerk)).status, 403);
    assert.equal(
      (
        await post("/api/team/invite", {
          ...clerk,
          body: { email: "z@example.com", roleId: r["Приёмщик"] },
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
      body: { email: "n@example.com", roleId: r["Приёмщик"] },
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
      body: { email: "p5@example.com", roleId: r["Приёмщик"] },
    });
    assert.equal(first.status, 200);
    const old = tokenIn(await lastMail("p5@example.com"));
    // Повторное приглашение гасит старую ссылку и не плодит карточки.
    sent.length = 0;
    await post("/api/team/invite", {
      ...boss,
      body: { email: "p5@example.com", roleId: r["Сборщик"] },
    });
    const fresh = tokenIn(await lastMail("p5@example.com"));
    assert.notEqual(fresh, old);
    assert.equal((await post("/api/auth/invite/info", { body: { token: old } })).status, 404);
    const team = (await call("GET", "/api/team", boss)).json;
    assert.equal(team.members.filter((m) => m.email === "p5@example.com").length, 1);
    assert.equal(team.members.find((m) => m.email === "p5@example.com").roleName, "Сборщик");
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
      body: { email: "guest5@example.com", roleId: r["Кладовщик"] },
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
      body: { email: "guest5@example.com", roleId: r["Приёмщик"] },
    });
    assert.equal(
      (
        await post("/api/team/invite", {
          ...boss,
          body: { email: "guest5@example.com", roleId: r["Приёмщик"] },
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
  assert.equal(
    (await post("/api/team/roles/delete", { ...boss, body: { roleId: r["Кладовщик"] } })).status,
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
    const chief = await join(boss, "chief7@example.com", r["Начальник склада"]);
    const chiefId = (await call("GET", "/api/team", chief)).json.me;
    // Начальник перед увольнением зовёт свою вторую почту.
    await post("/api/team/invite", {
      ...chief,
      body: { email: "backdoor7@example.com", roleId: r["Начальник склада"] },
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
      body: { email: "second7@example.com", roleId: r["Начальник склада"] },
    });
    const t2 = tokenIn(await lastMail("second7@example.com"));
    await post("/api/team/role", { ...boss, body: { memberId: chiefId, roleId: r["Кладовщик"] } });
    assert.equal((await post("/api/auth/invite/info", { body: { token: t2 } })).status, 404);
    // Приглашение владельцу начальник отозвать не может.
    await post("/api/team/role", {
      ...boss,
      body: { memberId: chiefId, roleId: r["Начальник склада"] },
    });
    await post("/api/team/invite", {
      ...boss,
      body: { email: "own7@example.com", roleId: r["Владелец"] },
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
    const set = (who, staffRef, roleId) =>
      post("/api/team/desk-role", { ...who, body: { staffRef, roleId } });
    assert.equal((await set(boss, "stf-olga", r["Начальник склада"])).status, 200);
    assert.equal((await set(boss, "stf-ivan", r["Кладовщик"])).status, 200);
    let list = (await call("GET", "/api/team", boss)).json;
    assert.deepEqual(list.deskRoles, {
      "stf-olga": r["Начальник склада"],
      "stf-ivan": r["Кладовщик"],
    });
    assert.ok(list.permissions.some((p) => p.code === "goods.decide"));
    // Начальник склада получил решения по товару и в старой, и в новой компании.
    const chiefRole = list.roles.find((x) => x.name === "Начальник склада");
    assert.ok(chiefRole.permissions.includes("goods.decide"));

    // Начальник не даёт роль выше своей и не снимает её с того, у кого она выше.
    const chief = await join(boss, "chief-desk@example.com", r["Начальник склада"]);
    assert.equal((await set(chief, "stf-petr", r["Владелец"])).status, 403);
    assert.equal((await set(boss, "stf-petr", r["Владелец"])).status, 200);
    assert.equal((await set(chief, "stf-petr", null)).status, 403);
    assert.equal((await set(chief, "stf-ivan", r["Сборщик"])).status, 200);
    // Кладовщик с почтой роли у стола не трогает.
    const keeper = await join(boss, "keeper-desk@example.com", r["Кладовщик"]);
    assert.equal((await set(keeper, "stf-ivan", r["Кладовщик"])).status, 403);
    // Битый id и чужая роль — 404.
    assert.equal((await set(boss, "../x", r["Кладовщик"])).status, 404);
    const other = await owner("boss-desk2@example.com", "10.1.0.10");
    assert.equal((await set(other, "stf-ivan", r["Кладовщик"])).status, 404);

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
  const set = (staffRef, roleId) =>
    post("/api/team/desk-role", { ...boss, body: { staffRef, roleId } });
  assert.equal((await set("stf-top", r["Владелец"])).status, 200);
  assert.equal((await set("stf-low", r["Кладовщик"])).status, 200);
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
  assert.equal(list.deskRoles["stf-new"], r["Кладовщик"]);
});

test(
  "повысили роль строки — бейдж от младшего руководителя погас, от владельца остался",
  {
    skip: SKIP,
  },
  async () => {
    const boss = await owner("boss-raise@example.com", "10.1.0.12");
    const r = await roles(boss);
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
    assert.equal((await set("stf-a", r["Владелец"])).status, 200);
    assert.equal((await set("stf-b", r["Владелец"])).status, 200);
    assert.equal(await live("stf-a"), 0);
    assert.equal(await live("stf-b"), 1);
    // Роль в пределах прав начальника бейдж не гасит.
    assert.equal((await issue(chief, "stf-c")).status, 200);
    assert.equal((await set("stf-c", r["Кладовщик"])).status, 200);
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
  };
  const first = await post("/api/cabinet/snapshot", {
    ...boss,
    body: { version: 0, format: 8, data },
  });
  assert.equal(first.status, 200);
  const keeper = await join(boss, "keeper-view@example.com", r["Кладовщик"]);
  const seen = await call("GET", "/api/cabinet/snapshot", keeper);
  assert.equal(seen.status, 200);
  assert.equal(seen.json.snapshot.viewer, true);
  const ivan = seen.json.snapshot.data.warehouse.staff[0];
  assert.equal(ivan.name, "Иван");
  assert.equal(ivan.hourlyRate, undefined);
  assert.equal(ivan.phone, undefined);
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
      body: { version: 0, format: 8, data },
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
    // Кладовщик работу склада делает у стола операциями: итог (тару,
    // ячейки, заявки) снимком не правит вовсе.
    const keeper = await join(boss, "keeper-scope@example.com", r["Кладовщик"]);
    const v = (await call("GET", "/api/cabinet/snapshot", keeper)).json.snapshot;
    assert.deepEqual(v.writable, []);
    const tried = await changes(keeper, v.version, { doc: { ...doc, boxSeq: 9 } });
    assert.equal(tried.status, 403);
  },
);
