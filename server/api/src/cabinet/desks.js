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
 *   · записать работу склада только операциями (`POST /api/desk/ops`): факт с
 *     ключом повтора, сервер сам применяет его к текущему снимку; журнал смен
 *     только дописывается, решённое спорное не меняется;
 *   · отвязаться бейджем руководителя.
 * Остальные маршруты кабинета со столом отвечают 403 — не 401, чтобы стол не
 * принял это за потерю входа.
 *
 * Работает стол на складе своего устройства (`deskPlace.js`), а не на том,
 * что открыт у руководителя: снимок, бейдж и операции — только этого склада.
 *
 * Снимок кабинета стол не пишет вовсе (шаг 4 «потолка данных»): записью
 * целого документа со стола он упирался бы в лимит и мог затереть правку
 * руководителя. Результат каждой операции проходит сверку (`mergeDeskWrite`):
 * кто за столом (миграция 012) и куда делся товар (`deskStock.js`).
 *
 * Маршруты руководителя (вход по паролю с правом staff.manage):
 *   POST /api/cabinet/desks        — { deviceRef, name, email?+password? | code? } → кука
 *                                    стола, вход руководителя гаснет. Руководитель здесь и
 *                                    сейчас (052): вход паролем ≤10 мин, пароль или его бейдж
 *   POST /api/cabinet/desks/check  — то же подтверждение без привязки: 200 / 428 / 422
 *   POST /api/cabinet/desks/revoke — { deviceRef } → стол гаснет с другого компьютера
 * Маршруты стола (кука стола и нет куки входа):
 *   GET  /api/auth/me              — { kind: "desk", current: { orgId } }
 *   GET  /api/cabinet/snapshot     — снимок без лишнего
 *   GET  /api/desk/version         — версия снимка: пора ли подтянуть свежий
 *   POST /api/desk/ops             — пачка операций с ключами повтора
 *   POST /api/cabinet/badges/check — чей бейдж
 *   POST /api/desk/unbind          — { code } бейдж старшего или { email, password }
 *                                    руководителя → стол отвязан; по паролю — сразу вход
 *   /api/desk/switch…, /api/cabinet/switch-requests… — смена процесса с
 *                                    подтверждением старшего (`deskSwitch.js`, 042)
 *   POST /api/desk/senior          — { code } → { staffRef, decide }: бейдж старшего
 *                                    снимает остановку, за стол он не встаёт
 */
/* global require, module, fetch */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash, randomBytes } = require("node:crypto");
const { createRateLimit } = require("../rateLimit");
const {
  MAX_SNAPSHOT_BYTES,
  warnNearLimit,
  loadCabinet,
  splitCabinet,
  storeRecords,
} = require("./snapshot");
const { whoseBadge, badgeAnswer, answerCheck, CHECKS_PER_MINUTE } = require("./deskBadges");
const { storeWarehouses } = require("./warehouses");
const { withSettings } = require("./records");
const { GOODS_DECIDE, GOODS_WRITEOFF, STAFF_MANAGE, may, loadDeskPerms } = require("./deskPerms");
const { mergeDeskStock, STOCK_KEYS } = require("./deskStock");
const { recordMoves, diffMoves } = require("./moves");
const { recordStorage } = require("./storage");
const { isOp, runDeskOps, MAX_OPS } = require("./deskOps");
const { createSwitchRoutes } = require("./deskSwitch");
const { createLabelRoutes } = require("./deskLabel");
const { deskPlace } = require("./deskPlace");

// Стол живёт, пока его не отвяжут; срок — страховка от забытого компьютера.
const DESK_TTL_MS = 180 * 86_400_000;
// Сколько вход паролем считается «руководитель здесь» для привязки стола (052).
const FRESH_LOGIN_MS = 10 * 60_000;
const DEVICE_RE = /^[A-Za-z0-9_-]{1,100}$/;
/**
 * Пачки операций — на стол: отметок смены у человека единицы за смену, а
 * журнал операций только растёт. Очередь после обрыва уходит за минуту-две.
 */
const OPS_PER_MINUTE = 20;
// Вход по бейджу за столом живёт 12 часов — как `SESSION_TTL_MS` в браузере.
const SHIFT_TTL_MS = 12 * 3_600_000;

/**
 * Что результат операции стола вправе изменить — разрешённый список, а не
 * запретный: новый домен кабинета для стола закрыт, пока его сюда не впишут.
 * Это работа склада у стола: приёмка, тара, паллеты, сборка (заявки, остатки
 * в ячейках), рейсы. Всё остальное — персонал и план (`warehouse`), товары и их
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
 * ещё могут догонять сервер). Решает ли — по праву роли (`goods.decide`,
 * миграция 024), а не по должности в снимке.
 */
function deskPeople(who) {
  const present = new Set([who?.staff, who?.prev].filter(Boolean));
  return {
    present,
    staff: who?.staff ?? null,
    mayDecide: may(who, who?.staff, GOODS_DECIDE),
    mayWriteOff: may(who, who?.staff, GOODS_WRITEOFF),
  };
}

/** Отметки, которые не зависят от движения товара. */
const SHIFT_EVENTS = new Set([
  "shift_start",
  "shift_end",
  "break_start",
  "break_end",
  "idle_start",
  "idle_end",
]);

/** Решение старшего, которое меняет остаток тары: списание или оприходование. */
const movesGoods = (d, resolution) =>
  resolution === "written_off" || (resolution === "accepted" && d.kind === "inventory_over");

/** Какие решения допустимы у какого вида спорного; у остальных — вернуть, переложить, списать. */
const RESOLUTIONS_BY_KIND = {
  receive_overage: new Set(["accepted", "written_off"]),
  inventory_short: new Set(["returned", "written_off"]),
  inventory_over: new Set(["returned", "accepted"]),
};
const OTHER_RES = new Set(["returned", "moved", "written_off"]);

/**
 * После отката остатков: спорное как на сервере, но решения без списания
 * («переложили», «вернули») и новое открытое сохраняются.
 */
function keepDecisions(current, merged) {
  const next = byId(merged);
  const kept = (Array.isArray(current) ? current : []).map((d) => {
    const n = isObject(d) ? next.get(d.id) : undefined;
    // Решения, которые двигают товар (списание, оприходование излишка),
    // от остатков зависят — после отката их не оставляем.
    return n && !d.resolution && n.resolution && !movesGoods(d, n.resolution) ? n : d;
  });
  // Лишнее с приёмки заводится вместе с приёмкой: откатилась она — нет и его.
  return appendOnly(kept, merged, (d) => !d.resolution && d.kind !== "receive_overage");
}

/** Порядок статуса заявки: назад со стола — только «в работе» → «новая». */
const REQUEST_FLOW = ["new", "in_progress", "done", "shipped"];
/** Что стол вправе менять в заявке: ход работы, а не её суть. */
const REQUEST_WORK = [
  "status",
  "startedAt",
  "pickedAt",
  "pickedQty",
  "partial",
  "shipmentId",
  "shippedAt",
  "packedAt",
  "packedBy",
  "toteId",
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
function mergeRequests(current, incoming, people, boxes) {
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
    // Собранное со стола только растёт: «вернул из сборки» и «собрал снова»
    // давали бы товар в таре из ничего. Отменяет сборку руководитель.
    if ((Number(out.pickedQty) || 0) < (Number(r.pickedQty) || 0)) {
      out.pickedQty = r.pickedQty;
    }
    if (out.packedBy !== r.packedBy && !people.present.has(out.packedBy)) {
      out.packedBy = r.packedBy;
      out.packedAt = r.packedAt;
    }
    // Тара сборки — короб этого склада без места хранения и не невскрытый;
    // после упаковки заявка свою тару не меняет.
    if (out.toteId !== r.toteId) {
      const tote = (Array.isArray(boxes) ? boxes : []).find(
        (b) => isObject(b) && b.id === out.toteId,
      );
      if (r.packedAt || !tote || tote.address || tote.sealed) {
        if (r.toteId === undefined) delete out.toteId;
        else out.toteId = r.toteId;
      }
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
  const kept = (Array.isArray(current) ? current : []).map((was) => {
    const n = isObject(was) ? next.get(was.id) : undefined;
    if (!n || was.resolution) return was;
    // Та же недостача в той же таре копится в одном спорном (`raiseDispute`):
    // открытое может только вырасти и только от того, кто его завёл.
    const grown =
      Number.isInteger(n.qty) &&
      n.qty > (Number(was.qty) || 0) &&
      n.qty <= 100_000 &&
      people.present.has(was.raisedBy)
        ? { ...was, qty: n.qty }
        : was;
    if (!n.resolution) return grown;
    const d = grown;
    // У каждого вида свои решения: лишнее с приёмки оставляют или списывают,
    // по инвентаризации правят учёт к факту либо закрывают без правки.
    if (!(RESOLUTIONS_BY_KIND[d.kind] ?? OTHER_RES).has(n.resolution)) return d;
    // Решает тот, у кого есть право, кто сейчас за столом, и только от своего имени.
    if (!people.mayDecide || n.resolvedBy !== people.staff) return d;
    // Списание — только с правом начальника (030); просьбу снимком не пишут.
    if (n.resolution === "written_off" && !people.mayWriteOff) return d;
    // Списание — с причиной и не тем, кто нашёл (как в кабинете, #71):
    // иначе свою же недостачу можно списать в одиночку.
    // То же — оприходование излишка: товар из ничего подтверждает второй.
    if (
      movesGoods(d, n.resolution) &&
      (n.resolvedBy === d.raisedBy || !String(n.note ?? "").trim())
    )
      return d;
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
  // Завести спорное может только тот, кто за столом. Лишнее с приёмки
  // заводит сервер (`overageDisputes` в `deskStock.js`), не стол.
  return appendOnly(
    kept,
    fresh,
    // Id `ovr-…` тоже занят сервером: иначе стол заранее подложил бы своё
    // спорное под id будущего «лишнего».
    (d) =>
      people.present.has(d.raisedBy) &&
      d.kind !== "receive_overage" &&
      !String(d.id).startsWith("ovr-"),
  );
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
  // Тариф и копии столу не нужны — дело владельца. Ключ убираем, а не
  // пустим: без него кабинет стола оставит своё значение по умолчанию.
  delete out.subscription;
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
  const people = deskPeople(who);
  const out = { ...current };
  for (const key of DESK_WRITES) {
    if (key in incoming) out[key] = incoming[key];
  }
  out.requests = mergeRequests(current.requests, incoming.requests, people, out.boxes);
  out.staffEvents = appendOnly(current.staffEvents, incoming.staffEvents, (e) =>
    people.present.has(e.staffId),
  );
  out.disputes = mergeDisputes(current.disputes, incoming.disputes, people);
  // Остатки: движение товара сверяется с работой (`deskStock.js`). Не сошлось —
  // вся работа с товаром остаётся как на сервере, а стол заберёт свежий снимок.
  const stock = mergeDeskStock(current, out, people);
  Object.assign(out, stock.out);
  // За столом никого: товар не двигается вовсе — в журнале не должно
  // остаться «стол, неизвестно кто».
  if (people.present.size === 0) {
    for (const m of diffMoves(current, out)) {
      if (!stock.mismatch.includes(m.product)) stock.mismatch.push(m.product);
    }
  }
  if (stock.mismatch.length > 0) {
    const decided = out.disputes;
    for (const key of STOCK_KEYS) {
      if (key in current) out[key] = current[key];
      else delete out[key];
    }
    // Пики оплачиваются по журналу: упаковка, которой нет в данных, не
    // оплачивается. Остаются отметки смены, перерывов и простоя.
    out.staffEvents = appendOnly(current.staffEvents, out.staffEvents, (e) =>
      SHIFT_EVENTS.has(e.type),
    );
    // Решения старшего, кроме списания, от остатков не зависят — оставляем.
    out.disputes = keepDecisions(current.disputes, decided);
  }
  return { data: out, mismatch: stock.mismatch };
}

/**
 * Документ снимка компании без строк работы: склады, сотрудники и устройства
 * лежат в нём самом (`records.js` строками держит только списки работы).
 */
async function companyDoc(c) {
  const { rows } = await c.query(
    `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
  );
  return rows[0] ? withSettings(c, rows[0].data) : null;
}

function createDesks({ auth, cfg, send, log, secretKey = null, fetchImpl = fetch }) {
  const { withSession, readJson, tokenHash, clearCookie, cookieName } = auth;
  const local = !cfg.publicUrl.startsWith("https://");
  const COOKIE = local ? "uklad_desk" : "__Host-uklad_desk";
  const attrs = `Path=/; HttpOnly;${local ? "" : " Secure;"} SameSite=Strict`;
  const deskCookie = (token) => `${COOKIE}=${token}; ${attrs}; Max-Age=${DESK_TTL_MS / 1000}`;
  const clearDesk = `${COOKIE}=; ${attrs}; Max-Age=0`;
  // Стол раз в 20 секунд спрашивает версию снимка: запас на несколько вкладок.
  const versionLimit = createRateLimit({ capacity: 12, refillPerMinute: 12 });
  const opsLimit = createRateLimit({ capacity: OPS_PER_MINUTE, refillPerMinute: OPS_PER_MINUTE });
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
    const byPassword = await passwordOf(req, res, b);
    if (byPassword === undefined) return;
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.accountId || !ctx.can("staff.manage")) return 403;
      const confirmed = await bindConfirmed(c, ctx, hash, b, byPassword);
      if (confirmed !== true) return confirmed;
      // Стол — устройство склада: без него стол не знал бы, чью работу вести.
      // Кабинет дописывает устройство на сервер до этого запроса (`deskServer.ts`).
      if (!deskPlace(await companyDoc(c), deviceRef)) return 409;
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
    if (out === 409) return send(res, 409, { ok: false, error: "desk_warehouse" });
    if (typeof out === "object") return send(res, out.status, { ok: false, error: out.error });
    if (out !== 200) return send(res, out, { ok: false });
    return send(res, 200, { ok: true }, { "Set-Cookie": [deskCookie(token), clearCookie] });
  }

  /**
   * Руководитель здесь и сейчас (миграция 052): вошёл паролем только что, или
   * в запросе его пароль, или бейдж сотрудника с правом на персонал. Иначе
   * забытый открытым вход руководителя давал бы любому завести стол.
   * `true` — можно; иначе ответ отказа `{ status, error }`.
   */
  async function bindConfirmed(c, ctx, hash, b, byPassword) {
    if (byPassword) {
      return byPassword === ctx.accountId ? true : { status: 422, error: "bad_credentials" };
    }
    if (typeof b.code === "string" && b.code) {
      if (!checks.take(ctx.orgId)) return { status: 429, error: "too_many" };
      const staffRef = await whoseBadge(c, b.code);
      const perms = staffRef ? await loadDeskPerms(c, [staffRef]) : {};
      return staffRef && may({ perms }, staffRef, STAFF_MANAGE)
        ? true
        : { status: 422, error: "not_manager" };
    }
    const { rows } = await c.query(`SELECT auth.session_fresh($1, $2::interval) AS fresh`, [
      hash,
      `${FRESH_LOGIN_MS / 1000} seconds`,
    ]);
    return rows[0].fresh === true ? true : { status: 428, error: "confirm" };
  }

  /**
   * Проверить подтверждение до привязки, ничего не меняя: кабинет заводит
   * устройство у себя только после «да», иначе каждый отказ оставлял бы в
   * списке погашенное устройство. Те же ответы, что у привязки.
   */
  async function checkBind(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const pw = await passwordOf(req, res, b);
    if (pw === undefined) return;
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.accountId || !ctx.can("staff.manage")) return 403;
      const confirmed = await bindConfirmed(c, ctx, tokenHash(req), b, pw);
      return confirmed === true ? 200 : confirmed;
    });
    if (out === null) return send(res, 401, { ok: false });
    if (typeof out === "object") return send(res, out.status, { ok: false, error: out.error });
    return send(res, out, { ok: out === 200 });
  }

  /**
   * Пароль из запроса привязки: `null` — его нет, id учётной записи — верный,
   * `undefined` — отказ уже отправлен. До транзакции: у пароля свои счётчики.
   */
  async function passwordOf(req, res, b) {
    if (typeof b.password !== "string" || !b.password) return null;
    const who = await auth.checkCredentials(req, b);
    if (who.status === 429) {
      send(res, 429, { ok: false, error: who.error }, who.headers);
      return undefined;
    }
    // 422, а не 401: кабинет принял бы 401 за потерю своего входа.
    if (!who.accountId) {
      send(res, 422, { ok: false, error: "bad_credentials" });
      return undefined;
    }
    return who.accountId;
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

  /**
   * Журнал устройства (миграция 026): операции, пришедшие с его пропусков, и
   * кто был за столом. Только для того, кто управляет персоналом: по журналу
   * видно, кто когда работал.
   */
  async function journal(req, res, url) {
    const deviceRef = String(url.searchParams.get("device") ?? "");
    if (!DEVICE_RE.test(deviceRef)) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.accountId || !ctx.can("staff.manage")) return { status: 403 };
      const { rows } = await c.query(
        `SELECT at, staff_ref, kind, status, refs FROM auth.desk_journal($1, 200)`,
        [deviceRef],
      );
      const { rows: events } = await c.query(
        `SELECT at, kind, by_member, by_staff FROM auth.desk_events($1)`,
        [deviceRef],
      );
      return { status: 200, rows, events };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false });
    return send(res, 200, {
      ok: true,
      entries: out.rows.map((r) => ({
        at: new Date(r.at).getTime(),
        staffRef: r.staff_ref,
        kind: r.kind,
        flagged: r.status === "flagged",
        // Товар, тара, заказ — чтобы строка говорила, с чем было действие.
        ...(r.refs && Object.keys(r.refs).length ? { refs: r.refs } : {}),
      })),
      // Привязали и отвязали — по пропускам стола, с тем, кто это сделал
      // (миграция 040): руководитель по имени или сотрудник по бейджу.
      events: out.events.map((e) => ({
        at: new Date(e.at).getTime(),
        kind: e.kind,
        ...(e.by_member ? { byName: e.by_member } : {}),
        ...(e.by_staff ? { byStaff: e.by_staff } : {}),
      })),
    });
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
    const out = await withDesk(req, async (c, d) => {
      const { rows } = await c.query(
        `SELECT version, format, data, updated_at FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org()`,
      );
      if (!rows[0]) return { row: null };
      // Кабинет на складе стола: другой склад, открытый у руководителя, стол
      // не видит и в его работу не попадает.
      const place = deskPlace(await loadCabinet(c, rows[0].data), d.deviceRef);
      if (!place) return { noWarehouse: true };
      return { row: { ...rows[0], data: place.data } };
    });
    if (!out) return gone(res);
    if (out.noWarehouse) return send(res, 403, { ok: false, error: "desk_warehouse" });
    if (!out.row) return send(res, 200, { ok: true, snapshot: null });
    const { version, format, data, updated_at: updatedAt } = out.row;
    return send(res, 200, {
      ok: true,
      snapshot: { version, format, data: forDesk(data), updatedAt },
      // Клиент узнаёт по этому, что он стол: стол снимок не пишет, а сам
      // подтягивает свежий (`store/serverSync.ts`).
      desk: true,
    });
  }

  /**
   * Версия снимка без самого снимка: стол сам снимок не пишет, а подтягивает
   * свежий, когда версия ушла вперёд (правка руководителя или другого стола).
   */
  async function snapshotVersion(req, res) {
    const out = await withDesk(req, async (c, d) => {
      if (!versionLimit.take(d.deskId)) return { limited: true };
      const { rows } = await c.query(
        `SELECT version FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
      );
      // Один вход на бейдж (миграция 049): сотрудника этого стола сняли
      // сканом за другим — стол показывает «Вход перехвачен».
      const { rows: taken } = await c.query(`SELECT * FROM auth.desk_taken($1)`, [deskHash(req)]);
      return { version: rows[0]?.version ?? null, taken: taken[0] ?? null };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    const t = out.taken;
    return send(res, 200, {
      ok: true,
      version: out.version,
      ...(t
        ? { taken: { staffRef: t.staff_ref, at: new Date(t.taken_at).getTime(), by: t.by_name } }
        : {}),
    });
  }

  /**
   * Операции стола (миграция 015): пачка фактов с ключами повтора. Ответ на
   * каждую — `applied`, `flagged` с причиной или повтор уже принятой.
   */
  async function saveOps(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const ops = b.ops;
    if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS || !ops.every(isOp)) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const out = await withDesk(req, async (c, d) => {
      if (!opsLimit.take(d.deskId)) return { limited: true };
      const { rows } = await c.query(`SELECT * FROM auth.desk_staff_times($1)`, [deskHash(req)]);
      const ms = (t) => (t ? new Date(t).getTime() : undefined);
      const who = {
        staff: rows[0]?.staff_ref,
        staffSince: ms(rows[0]?.staff_since),
        prev: rows[0]?.prev_staff_ref,
        prevSince: ms(rows[0]?.prev_since),
        prevLeft: ms(rows[0]?.prev_left),
      };
      who.perms = await loadDeskPerms(c, [who.staff, who.prev]);
      who.switches = await loadSwitches(c, d.deskId, [who.staff, who.prev]);
      // Упаковка проходит те же правила, что запись снимка со стола.
      // `atDesk` — кто за столом из тех, кто работает на складе стола.
      const verify = (before, after, atDesk) => {
        const w = mergeDeskWrite(before, after, atDesk);
        return w.mismatch.length > 0 ? { ok: false } : { ok: true, data: w.data };
      };
      return runDeskOps(c, d.deskId, ops, who, Date.now(), {
        verify,
        place: (full) => deskPlace(full, d.deviceRef),
        load: loadCabinet,
        split: splitCabinet,
        storeRecords,
        storeWarehouses,
        recordMoves,
        recordStorage,
        maxBytes: MAX_SNAPSHOT_BYTES,
      }).then((r) => ({ ...r, orgId: d.orgId }));
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (out.tooLarge) {
      // Снимок компании упёрся в потолок: дальше работа стола не сохраняется.
      // Это должны увидеть мы, а не только стол тостом.
      log.warn?.(`[uklad] стол: снимок компании ${out.orgId} больше лимита, операции не приняты`);
      return send(res, 413, { ok: false, error: "too_large" });
    }
    // Снимка ещё нет: класть отметки некуда, его заводит руководитель.
    if (out.conflict !== undefined) return send(res, 409, { ok: false, error: "no_snapshot" });
    if (out.bytes) warnNearLimit(log, out.orgId, out.bytes);
    const answer = { ...out };
    delete answer.bytes;
    delete answer.orgId;
    return send(res, 200, { ok: true, ...answer });
  }

  /**
   * Переходы, подтверждённые старшим, по людям этого стола (`deskSwitch.js`):
   * `{ ref: [{ at, station }] }` по возрастанию времени стола. Процесс у
   * пропуска стола — последний переход человека за его смену здесь.
   */
  async function loadSwitches(c, deskId, refs) {
    const want = refs.filter((r) => typeof r === "string" && r);
    if (want.length === 0) return {};
    const { rows } = await c.query(
      `SELECT staff_ref, body->>'station' AS station, (body->>'at')::double precision AS at
       FROM uklad.desk_ops
       WHERE org_id = uklad.current_org() AND desk_id = $1 AND kind = 'station_switch'
         AND status = 'applied' AND staff_ref = ANY($2::text[])
         AND received_at > now() - interval '24 hours'
       ORDER BY 3`,
      [deskId, want],
    );
    const out = {};
    for (const r of rows) (out[r.staff_ref] ??= []).push({ at: r.at, station: r.station });
    return out;
  }

  async function checkBadge(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const out = await withDesk(req, async (c, d) => {
      if (!checks.take(d.orgId)) return { limited: true };
      const staffRef = await whoseBadge(c, b.code);
      if (staffRef) {
        // Бейдж — сотрудника склада этого стола: бейдж «Логопарка» за столом
        // «Складской 5» не открывает работу, даже если компания одна.
        const place = deskPlace(await companyDoc(c), d.deviceRef);
        if (!place) return { noWarehouse: true };
        if (!place.staffHere(staffRef)) return { otherWarehouse: true };
      }
      // Узнанный бейдж — это «встал за стол»: дальше запись стола сверяется
      // с ним 12 часов, как и вход по бейджу в браузере. Вход у сотрудника
      // один: за другим столом его снимает этот скан (миграция 049).
      if (staffRef) {
        await c.query(`SELECT auth.desk_set_staff($1, $2, $3::interval)`, [
          deskHash(req),
          staffRef,
          `${SHIFT_TTL_MS / 1000} seconds`,
        ]);
      }
      return badgeAnswer(c, staffRef);
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (out.noWarehouse) return send(res, 409, { ok: false, error: "desk_warehouse" });
    if (out.otherWarehouse) return send(res, 409, { ok: false, error: "other_warehouse" });
    return answerCheck(res, send, out);
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

  /**
   * Бейдж старшего, который снимает остановку на сортировке и погрузке
   * (повтор посылки). Только ответ «решает ли он по товару»: за стол он не
   * встаёт — смена и запись остаются за тем, кто работает, — в отличие от
   * `badges/check`. Список команды стол не читает: у куки стола на него нет
   * права, и 401 выкидывал стол на экран входа (обход столов 15.11).
   */
  async function senior(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const out = await withDesk(req, async (c, d) => {
      if (!checks.take(d.orgId)) return { limited: true };
      const staffRef = await whoseBadge(c, b.code);
      if (!staffRef) return { staffRef: null };
      const place = deskPlace(await companyDoc(c), d.deviceRef);
      if (!place || !place.staffHere(staffRef)) return { staffRef: null };
      const perms = await loadDeskPerms(c, [staffRef]);
      return { staffRef, decide: may({ perms }, staffRef, GOODS_DECIDE) };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (!out.staffRef) return send(res, 404, { ok: false, error: "bad_badge" });
    return send(res, 200, { ok: true, staffRef: out.staffRef, decide: out.decide });
  }

  /**
   * Отвязать стол на нём самом: бейджем старшего (`code`) или паролем
   * руководителя (`email` + `password`) — тем же правом staff.manage, каким
   * стол привязывают. Без второго пути стол без такого бейджа не отвязать:
   * вход паролем здесь погашен привязкой. Кто отвязал — в пропуске стола
   * (миграция 040), журнал устройства это показывает.
   */
  async function unbind(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (typeof b.email === "string") return unbindByPassword(req, res, b);
    const out = await withDesk(req, async (c, d) => {
      if (!checks.take(d.orgId)) return { limited: true };
      const staffRef = await whoseBadge(c, b.code);
      if (!staffRef) return { manager: false };
      // Отвязать стол — право роли на персонал, а не должность в снимке.
      const perms = await loadDeskPerms(c, [staffRef]);
      if (!may({ perms }, staffRef, STAFF_MANAGE)) return { manager: false };
      await c.query(`SELECT auth.close_desk($1, $2)`, [deskHash(req), staffRef]);
      return { manager: true };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (!out.manager) return send(res, 404, { ok: false, error: "not_manager" });
    return send(res, 200, { ok: true }, { "Set-Cookie": clearDesk });
  }

  async function unbindByPassword(req, res, b) {
    // Сначала — что это стол: пароль чужого браузера здесь не проверяем.
    if (!(await withDesk(req, async () => true))) return gone(res);
    const who = await auth.checkCredentials(req, b);
    // 422, а не 401: стол принял бы 401 за потерю своего пропуска.
    if (who.status === 429) return send(res, 429, { ok: false, error: who.error }, who.headers);
    if (!who.accountId) return send(res, 422, { ok: false, error: "bad_credentials" });
    const out = await withDesk(req, async (c) => {
      const { rows } = await c.query(`SELECT auth.close_desk_by_account($1, $2) AS ok`, [
        deskHash(req),
        who.accountId,
      ]);
      if (rows[0].ok !== true) return { manager: false };
      // Руководитель только что ввёл почту и пароль — это и есть вход: он
      // сразу в кабинете, а не на втором таком же экране (Кирилл 20.11).
      return { manager: true, cookie: await auth.startSession(c, who.accountId) };
    });
    if (!out) return gone(res);
    if (!out.manager) return send(res, 404, { ok: false, error: "not_manager" });
    return send(res, 200, { ok: true }, { "Set-Cookie": [clearDesk, out.cookie] });
  }

  const switches = createSwitchRoutes({
    withDesk,
    withSession,
    readJson,
    send,
    gone,
    limited,
    deskHash,
    checks,
    companyDoc,
  });
  const labels = createLabelRoutes({
    withDesk,
    deskHash,
    readJson,
    send,
    gone,
    limited,
    log,
    secretKey,
    fetchImpl,
  });
  const managerRoutes = {
    ...switches.manager,
    "POST /api/cabinet/desks": open,
    "POST /api/cabinet/desks/revoke": revoke,
    "POST /api/cabinet/desks/check": checkBind,
    "GET /api/cabinet/desks/journal": journal,
  };
  const deskRoutes = {
    "GET /api/auth/me": me,
    "GET /api/cabinet/snapshot": loadSnapshot,
    "POST /api/cabinet/badges/check": checkBadge,
    "POST /api/desk/unbind": unbind,
    "POST /api/desk/senior": senior,
    ...switches.desk,
    ...labels,
    "POST /api/desk/leave": leave,
    "GET /api/desk/version": snapshotVersion,
    "POST /api/desk/ops": saveOps,
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
      if (!res.headersSent) send(res, err?.httpStatus === 403 ? 403 : 500, { ok: false });
    }
    return true;
  }

  return { handle, cookieName: COOKIE };
}

module.exports = { createDesks, forDesk, mergeDeskWrite, DESK_WRITES };
