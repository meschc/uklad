/**
 * Вход стола (миграция 011): пропуск компьютера у рабочего места вместо
 * сессии руководителя.
 *
 * Руководитель, сидя за компьютером, делает его столом: его сессия с паролем
 * в этом браузере гаснет, браузер получает свою куку стола. Со столом можно
 * только то, что нужно для работы за ним:
 *   · узнать сотрудника по бейджу;
 *   · прочитать снимок кабинета без ставок, контактов, подключений, переписки
 *     и чужих складов;
 *   · записать работу склада по разрешённому списку (`DESK_WRITES`); журнал
 *     смен только дописывается, решённое спорное не меняется, всё прочее
 *     сервер берёт из текущего снимка;
 *   · отвязаться бейджем руководителя.
 * Остальные маршруты кабинета со столом отвечают 403 — не 401, чтобы стол не
 * принял это за потерю входа.
 *
 * Пока кабинет живёт снимком (ADR 0010), стол по-прежнему пишет работу склада
 * целиком: сервер не проверяет, что упаковку отметил тот, кто вошёл бейджем.
 * Это придёт с операциями по таблицам.
 *
 * Маршруты руководителя (вход по паролю с правом staff.manage):
 *   POST /api/cabinet/desks        — { deviceRef, name } → кука стола, вход руководителя гаснет
 *   POST /api/cabinet/desks/revoke — { deviceRef } → стол гаснет с другого компьютера
 * Маршруты стола (кука стола и нет куки входа):
 *   GET  /api/auth/me              — { kind: "desk", current: { orgId } }
 *   GET  /api/cabinet/snapshot     — снимок без лишнего
 *   POST /api/cabinet/snapshot     — запись работы склада поверх известной версии
 *   POST /api/cabinet/badges/check — чей бейдж
 *   POST /api/desk/unbind          — { code } бейдж руководителя → стол отвязан
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomBytes } = require("node:crypto");
const { createRateLimit } = require("../rateLimit");
const { MAX_SNAPSHOT_BYTES } = require("./snapshot");
const { whoseBadge, answerCheck, CHECKS_PER_MINUTE } = require("./deskBadges");

// Стол живёт, пока его не отвяжут; срок — страховка от забытого компьютера.
const DESK_TTL_MS = 180 * 86_400_000;
const DEVICE_RE = /^[A-Za-z0-9_-]{1,100}$/;
const WRITES_PER_MINUTE = 30;
// Вход по бейджу за столом живёт 12 часов — как `SESSION_TTL_MS` в браузере.
const SHIFT_TTL_MS = 12 * 3_600_000;
// Должности руководства — те же, что в кабинете (`MANAGER_ROLE`, lib/workstation.ts).
const MANAGER_ROLE = /управля|заместител|руковод|директор|manager/i;

/**
 * Что стол вправе записать — разрешённый список, а не запретный: новый домен
 * кабинета для стола закрыт, пока его сюда не впишут. Это работа склада у
 * стола: приёмка, тара, паллеты, сборка (заявки, остатки в ячейках), рейсы,
 * задания. Всё остальное — персонал и план (`warehouse`), товары и их
 * продавцы, документы, цены, тариф, подключения, другие склады — сервер
 * берёт из текущего снимка.
 */
const DESK_WRITES = [
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "boxSeq",
  "palletSeq",
  "receiving",
  "requests",
  "shipments",
  "tasks",
  "placements",
  // Короба отгрузки: состав пишет упаковка, закрывает погрузка — обе за столом.
  "outboundBoxes",
];

const byId = (list) =>
  new Map((Array.isArray(list) ? list : []).filter(isObject).map((x) => [x.id, x]));

/**
 * Журнал смен — основа зарплаты, поэтому со стола он только дописывается:
 * прежние записи остаются как были, новые добавляются в конец.
 */
function appendOnly(current, incoming, allow = () => true) {
  const known = byId(current);
  const added = (Array.isArray(incoming) ? incoming : []).filter(
    (x) => isObject(x) && typeof x.id === "string" && !known.has(x.id) && allow(x),
  );
  return [...(Array.isArray(current) ? current : []), ...added];
}

/**
 * Кто за столом по данным сервера (миграция 012): `staff` — отсканировал
 * бейдж и не ушёл, `prev` — стоял до него последние 10 минут (его отметки
 * ещё могут догонять сервер). Руководитель ли — по должности в снимке.
 */
function deskPeople(current, who) {
  const staff = Array.isArray(current?.warehouse?.staff) ? current.warehouse.staff : [];
  const roleOf = (id) => String(staff.find((m) => isObject(m) && m.id === id)?.role ?? "");
  const present = new Set([who?.staff, who?.prev].filter(Boolean));
  return {
    present,
    staff: who?.staff ?? null,
    isManager: Boolean(who?.staff) && MANAGER_ROLE.test(roleOf(who.staff)),
  };
}

/** Порядок статуса заявки: назад со стола — только «в работе» → «новая». */
const REQUEST_FLOW = ["new", "in_progress", "done", "shipped"];
/** Что стол вправе менять в заявке: ход работы, а не её суть. */
const REQUEST_WORK = [
  "status",
  "startedAt",
  "pickedQty",
  "partial",
  "shipmentId",
  "shippedAt",
  "packedAt",
  "packedBy",
  "updatedAt",
];

/**
 * Заявки со стола. Заявку заводит и отменяет продавец или руководитель, а
 * не стол: новых и удалённых стол не делает. У существующей меняется только
 * ход работы — статус, собрано, упаковано, уехало. Товар, количество,
 * назначение, машина и бронь остаются как были: иначе за столом можно было
 * бы «уменьшить» заказ под недостачу. Уехавшая и отменённая заявка не
 * меняется вовсе. Упаковал — тот, кто за столом.
 */
function mergeRequests(current, incoming, people) {
  if (!Array.isArray(incoming)) return current;
  const next = byId(incoming);
  return (Array.isArray(current) ? current : []).map((r) => {
    const n = isObject(r) ? next.get(r.id) : undefined;
    if (!n || r.status === "shipped" || r.status === "cancelled") return r;
    const out = { ...r };
    for (const f of REQUEST_WORK) {
      if (f in n) out[f] = n[f];
      else delete out[f];
    }
    const from = REQUEST_FLOW.indexOf(r.status);
    const to = REQUEST_FLOW.indexOf(out.status);
    const back = to < from && !(r.status === "in_progress" && out.status === "new");
    if (to < 0 || back) out.status = r.status;
    const qty = Number(r.qty) || 0;
    if (out.pickedQty !== undefined) {
      const picked = Number(out.pickedQty);
      out.pickedQty = Number.isFinite(picked) ? Math.min(Math.max(0, picked), qty) : r.pickedQty;
    }
    if (out.packedBy !== r.packedBy && !people.present.has(out.packedBy)) {
      out.packedBy = r.packedBy;
      out.packedAt = r.packedAt;
    }
    return out;
  });
}

/**
 * Спорное со стола: новое добавляется, открытое можно решить (старший решает
 * за столом), решённое не меняется — решение старшего не перепишешь.
 */
function mergeDisputes(current, incoming, people) {
  const next = byId(incoming);
  const kept = (Array.isArray(current) ? current : []).map((d) => {
    const n = isObject(d) ? next.get(d.id) : undefined;
    if (!n || d.resolution || !n.resolution) return d;
    // Решает руководитель, который сейчас за столом, и только от своего имени.
    if (!people.isManager || n.resolvedBy !== people.staff) return d;
    return {
      ...d,
      resolution: n.resolution,
      resolvedAt: n.resolvedAt,
      resolvedBy: n.resolvedBy,
      note: n.note,
    };
  });
  // Новое спорное приходит только открытым: списать в обход «сначала
  // открыто, потом решение старшего» одной записью нельзя.
  const fresh = (Array.isArray(incoming) ? incoming : []).filter(isObject).map((d) => {
    const open = { ...d };
    for (const f of ["resolution", "resolvedAt", "resolvedBy", "note"]) delete open[f];
    return open;
  });
  // Завести спорное может только тот, кто за столом.
  return appendOnly(kept, fresh, (d) => people.present.has(d.raisedBy));
}

/** Чего стол не видит вовсе: переписка, подключения, чужие склады. */
const HIDE_ON_READ = { chats: {}, integrations: {}, otherWarehouses: [], warehouseData: {} };

const sha256 = (s) => createHash("sha256").update(s).digest();
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Продавец для стола: имя без контакта. */
function deskPartner(p) {
  if (!isObject(p)) return p;
  const out = { ...p };
  delete out.contact;
  return out;
}

/** Сотрудник для стола: имя, должность и фото — без ставки и контактов. */
function deskStaff(m) {
  if (!isObject(m)) return m;
  const out = { ...m };
  delete out.hourlyRate;
  delete out.phone;
  delete out.email;
  return out;
}

/** Снимок глазами стола. */
function forDesk(data) {
  const out = { ...data, ...HIDE_ON_READ };
  if (isObject(data.warehouse)) {
    const w = data.warehouse;
    out.warehouse = {
      ...w,
      ...(Array.isArray(w.staff) ? { staff: w.staff.map(deskStaff) } : {}),
      ...(Array.isArray(w.partners) ? { partners: w.partners.map(deskPartner) } : {}),
    };
  }
  return out;
}

/**
 * Запись стола: разрешённое — из запроса, остальное — из текущего снимка.
 * `who` — кто за столом по данным сервера (`auth.desk_staff`): отметки смены
 * и спорное принимаются только от него, заявки — только ходом работы.
 */
function mergeDeskWrite(current, incoming, who = {}) {
  const people = deskPeople(current, who);
  const out = { ...current };
  for (const key of DESK_WRITES) {
    if (key in incoming) out[key] = incoming[key];
  }
  out.requests = mergeRequests(current.requests, incoming.requests, people);
  out.staffEvents = appendOnly(current.staffEvents, incoming.staffEvents, (e) =>
    people.present.has(e.staffId),
  );
  out.disputes = mergeDisputes(current.disputes, incoming.disputes, people);
  return out;
}

function createDesks({ auth, cfg, send, log }) {
  const { withSession, readJson, tokenHash, clearCookie, cookieName } = auth;
  const local = !cfg.publicUrl.startsWith("https://");
  const COOKIE = local ? "uklad_desk" : "__Host-uklad_desk";
  const attrs = `Path=/; HttpOnly;${local ? "" : " Secure;"} SameSite=Strict`;
  const deskCookie = (token) => `${COOKIE}=${token}; ${attrs}; Max-Age=${DESK_TTL_MS / 1000}`;
  const clearDesk = `${COOKIE}=; ${attrs}; Max-Age=0`;
  const writes = createRateLimit({
    capacity: WRITES_PER_MINUTE,
    refillPerMinute: WRITES_PER_MINUTE,
  });
  const checks = createRateLimit({
    capacity: CHECKS_PER_MINUTE,
    refillPerMinute: CHECKS_PER_MINUTE,
  });

  const cookieValue = (req, name) => {
    for (const part of (req.headers.cookie ?? "").split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === name) return v.join("=");
    }
    return "";
  };
  const deskHash = (req) => {
    const t = cookieValue(req, COOKIE);
    return /^[A-Za-z0-9_-]{43}$/.test(t) ? sha256(t) : null;
  };
  /** Запрос идёт от стола: есть кука стола и нет куки входа по паролю. */
  const fromDesk = (req) => Boolean(deskHash(req)) && !cookieValue(req, cookieName);

  /** Транзакция от имени стола; `null` — пропуска нет или он погашен. */
  async function withDesk(req, fn) {
    const hash = deskHash(req);
    if (!hash) return null;
    return auth.tx(async (c) => {
      const { rows } = await c.query(
        `SELECT desk_id, org_id, device_ref FROM auth.desk_resolve($1)`,
        [hash],
      );
      if (!rows[0]) return null;
      return fn(c, {
        deskId: rows[0].desk_id,
        orgId: rows[0].org_id,
        deviceRef: rows[0].device_ref,
      });
    });
  }

  // ---- Руководитель ----

  async function open(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const deviceRef = String(b.deviceRef ?? "");
    const name = String(b.name ?? "").trim();
    if (!DEVICE_RE.test(deviceRef) || !name || name.length > 200) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const token = randomBytes(32).toString("base64url");
    const hash = tokenHash(req);
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.accountId || !ctx.can("staff.manage")) return 403;
      await c.query(`SELECT auth.open_desk($1, $2, $3, $4::interval)`, [
        deviceRef,
        name,
        sha256(token),
        `${DESK_TTL_MS / 1000} seconds`,
      ]);
      // Вход руководителя на этом компьютере гаснет: дальше здесь стол, и
      // его пароль за столом больше никому не открыт.
      await c.query(`SELECT auth.close_session($1)`, [hash]);
      return 200;
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out !== 200) return send(res, out, { ok: false });
    return send(res, 200, { ok: true }, { "Set-Cookie": [deskCookie(token), clearCookie] });
  }

  async function revoke(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const deviceRef = String(b.deviceRef ?? "");
    if (!DEVICE_RE.test(deviceRef)) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.accountId || !ctx.can("staff.manage")) return { status: 403 };
      const { rows } = await c.query(`SELECT auth.revoke_desk($1) AS n`, [deviceRef]);
      return { status: 200, revoked: rows[0].n };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false });
    return send(res, 200, { ok: true, revoked: out.revoked });
  }

  // ---- Стол ----

  /** Нет пропуска — 401 с очисткой куки: стол погасили, нужен вход руководителя. */
  const gone = (res) => send(res, 401, { ok: false }, { "Set-Cookie": clearDesk });
  const limited = (res) => send(res, 429, { ok: false }, { "Retry-After": "30" });

  async function me(req, res) {
    const out = await withDesk(req, async (_c, d) => d);
    if (!out) return gone(res);
    return send(res, 200, {
      ok: true,
      kind: "desk",
      orgs: [],
      current: { orgId: out.orgId, memberId: null, warehouseId: null },
      desk: { deviceRef: out.deviceRef },
    });
  }

  async function loadSnapshot(req, res) {
    const out = await withDesk(req, async (c) => {
      const { rows } = await c.query(
        `SELECT version, format, data, updated_at FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org()`,
      );
      return { row: rows[0] ?? null };
    });
    if (!out) return gone(res);
    if (!out.row) return send(res, 200, { ok: true, snapshot: null });
    const { version, format, data, updated_at: updatedAt } = out.row;
    return send(res, 200, {
      ok: true,
      snapshot: { version, format, data: forDesk(data), updatedAt },
    });
  }

  async function saveSnapshot(req, res) {
    const b = await readJson(req, res, MAX_SNAPSHOT_BYTES);
    if (!b) return;
    const { version, format, data } = b;
    // Первую запись (версия 0) стол не делает: снимок заводит руководитель.
    if (
      !Number.isInteger(version) ||
      version < 1 ||
      !Number.isInteger(format) ||
      format < 1 ||
      !isObject(data)
    ) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const out = await withDesk(req, async (c, d) => {
      if (!writes.take(d.orgId)) return { limited: true };
      const { rows } = await c.query(
        `SELECT version, data FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org() FOR UPDATE`,
      );
      const cur = rows[0];
      if (!cur || cur.version !== version) return { conflict: cur?.version ?? 0 };
      // Стол работает на одном складе. Руководитель переключил кабинет на
      // другой — работа стола легла бы поверх чужого склада; пусть стол
      // сначала заберёт свежий снимок.
      if (data.warehouse?.id !== cur.data.warehouse?.id) return { conflict: cur.version };
      const people = await c.query(`SELECT staff_ref, prev_staff_ref FROM auth.desk_staff($1)`, [
        deskHash(req),
      ]);
      const who = { staff: people.rows[0]?.staff_ref, prev: people.rows[0]?.prev_staff_ref };
      const merged = JSON.stringify(mergeDeskWrite(cur.data, data, who));
      const upd = await c.query(
        `UPDATE uklad.cabinet_snapshots
         SET previous = data, data = $1::jsonb, format = $2, version = version + 1,
             updated_at = now(), updated_by = NULL, updated_by_desk = $3
         WHERE org_id = uklad.current_org()
         RETURNING version`,
        [merged, format, d.deskId],
      );
      return { version: upd.rows[0].version };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (out.conflict !== undefined) {
      return send(res, 409, { ok: false, error: "conflict", version: out.conflict });
    }
    return send(res, 200, { ok: true, version: out.version });
  }

  async function checkBadge(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const out = await withDesk(req, async (c, d) => {
      if (!checks.take(d.orgId)) return { limited: true };
      const staffRef = await whoseBadge(c, b.code);
      // Узнанный бейдж — это «встал за стол»: дальше запись стола сверяется
      // с ним 12 часов, как и вход по бейджу в браузере.
      if (staffRef) {
        await c.query(`SELECT auth.desk_set_staff($1, $2, $3::interval)`, [
          deskHash(req),
          staffRef,
          `${SHIFT_TTL_MS / 1000} seconds`,
        ]);
      }
      return { staffRef };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    return answerCheck(res, send, out.staffRef);
  }

  /** Сотрудник вышел со стола: его отметки дальше не принимаются. */
  async function leave(req, res) {
    const out = await withDesk(req, async (c) => {
      await c.query(`SELECT auth.desk_set_staff($1, NULL, '0 seconds'::interval)`, [deskHash(req)]);
      return true;
    });
    // Пропуск погашен — уходить уже неоткуда; 401 тут ничего бы не добавил.
    if (!out) return send(res, 200, { ok: true, desk: false });
    return send(res, 200, { ok: true });
  }

  async function unbind(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const out = await withDesk(req, async (c, d) => {
      if (!checks.take(d.orgId)) return { limited: true };
      const staffRef = await whoseBadge(c, b.code);
      if (!staffRef) return { manager: false };
      // Персонал пока живёт в снимке: должность берём оттуда, а не из запроса.
      const { rows } = await c.query(
        `SELECT data->'warehouse'->'staff' AS staff FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org()`,
      );
      const staff = Array.isArray(rows[0]?.staff) ? rows[0].staff : [];
      const member = staff.find((m) => isObject(m) && m.id === staffRef);
      if (!member || !MANAGER_ROLE.test(String(member.role ?? ""))) return { manager: false };
      await c.query(`SELECT auth.close_desk($1)`, [deskHash(req)]);
      return { manager: true };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (!out.manager) return send(res, 404, { ok: false, error: "not_manager" });
    return send(res, 200, { ok: true }, { "Set-Cookie": clearDesk });
  }

  const managerRoutes = {
    "POST /api/cabinet/desks": open,
    "POST /api/cabinet/desks/revoke": revoke,
  };
  const deskRoutes = {
    "GET /api/auth/me": me,
    "GET /api/cabinet/snapshot": loadSnapshot,
    "POST /api/cabinet/snapshot": saveSnapshot,
    "POST /api/cabinet/badges/check": checkBadge,
    "POST /api/desk/unbind": unbind,
    "POST /api/desk/leave": leave,
  };
  // Куда стол не ходит: весь кабинет. Заявки с витрины и демо — не наши.
  const CABINET = /^\/api\/(auth|cabinet|staff|chat|telegram|desk|company|account)\//;

  /** Обработчик: `false` — маршрут не наш, пусть отвечают остальные. */
  async function handle(req, res, url) {
    const key = `${req.method} ${url.pathname}`;
    let route = managerRoutes[key];
    if (!route && fromDesk(req)) {
      route = deskRoutes[key];
      if (!route && CABINET.test(url.pathname)) {
        send(res, 403, { ok: false, error: "desk" });
        return true;
      }
    }
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой стола:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle, cookieName: COOKIE };
}

module.exports = { createDesks, forDesk, mergeDeskWrite, DESK_WRITES };
