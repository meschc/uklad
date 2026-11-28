/**
 * Заявка продавца на отгрузку через сервер (п. 2.1а «До запуска», Кирилл 27.11).
 *
 *   POST /api/requests — продавец: { key, items: [{ productId, qty }], note?,
 *                        vehicle?, truckDate?, source?, externalId? }
 *
 * Та же таблица заявок, что у склада (`cabinet_records`, домен `requests`), но
 * запись — операцией, а не правкой кабинета: продавец присылает «что и
 * сколько», а заявку собирает сервер. Статус, собранное, тару и рейс он
 * прислать не может — этих полей в теле нет вовсе.
 *
 * Что решает сервер, а не браузер:
 *   · склад — из сессии продавца (`actor_place`), в теле его нет;
 *   · товар — только свой: тот, что видит продавец (`forSeller`); чужой и
 *     несуществующий отвечают одинаково (`not_found`), чтобы не угадывать;
 *   · количество — целое от 1 и не больше свободного на складе
 *     (`stockPush.freeStock`: на полках минус открытые заявки и карантин);
 *   · повтор с тем же ключом (двойной клик, обрыв связи) заявок не задваивает:
 *     id заявок выводятся из ключа, второй раз сервер отвечает теми же заявками;
 *   · номер заказа площадки, который уже был заявкой, второй раз не заводится;
 *   · неоплаченный кабинет — 402 раньше, в `planLimits.handle`.
 *
 * Заявка помечена `by: "seller"`: склад видит, что её завёл продавец.
 * Склад заявки по-прежнему пишет правкой кабинета; этот маршрут ему закрыт,
 * пока кабинет склада не перейдёт на операции.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { loadCabinet } = require("./snapshot");
const { placeRef, focusWarehouse } = require("./viewerPlace");
const { forSeller } = require("./seller");
const { freeStock } = require("./stockPush");
const { createRateLimit } = require("../rateLimit");
const { writeView } = require("./viewWrite");

const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
/** Строк в одной заявке (одна машина). */
const MAX_ITEMS = 200;
/** Штук в одной строке — с запасом выше любого склада. */
const MAX_QTY = 1_000_000;
const MAX_NOTE = 200;
const MAX_VEHICLE = 100;
/** Номер заказа — не длиннее, чем принимает кабинет (`MAX_EXTERNAL_ID`). */
const MAX_EXTERNAL_ID = 64;
/** Открытых заявок продавца на складе: дальше — 409, снимок не растёт без конца. */
const MAX_OPEN = 2000;
const SOURCES = new Set(["ozon", "wildberries", "yandex-market"]);
/**
 * Заявок в минуту на человека продавца (разбор «Безопасности продукта» 28.11):
 * каждая берёт снимок компании под блокировку и будит все кабинеты и столы,
 * тысяча подряд затормозила бы склад. Повтор с тем же ключом тоже считается.
 */
const PER_MINUTE = 30;
const DAY_MS = 24 * 3_600_000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Необязательная строка: пусто → `undefined`, длиннее `max` или не строка → `null`. */
function optText(v, max) {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length > max) return null;
  return s || undefined;
}

/** Строки заявки → `[{ productId, qty }]` или `null`. */
function readLines(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  const lines = [];
  for (const it of items) {
    if (!isObject(it) || typeof it.productId !== "string" || !ID_RE.test(it.productId)) {
      return null;
    }
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) return null;
    lines.push({ productId: it.productId, qty: it.qty });
  }
  return lines;
}

/** Дата машины: не раньше чем сутки назад и не дальше года. `null` — не то. */
function readTruck(v, now) {
  if (v === undefined || v === null) return undefined;
  if (!Number.isFinite(v) || v < now - DAY_MS || v > now + 366 * DAY_MS) return null;
  return v;
}

/** Площадка и номер заказа: «своя» заявка — без них. `null` — не то. */
function readOrigin(b) {
  if (b.source === undefined || b.source === null || b.source === "manual") return {};
  if (!SOURCES.has(b.source)) return null;
  const externalId = optText(b.externalId, MAX_EXTERNAL_ID);
  return externalId ? { source: b.source, externalId } : null;
}

/** Тело запроса → заявка в общей форме или `null` (400). */
function readBody(b, now) {
  if (!isObject(b) || typeof b.key !== "string" || !KEY_RE.test(b.key)) return null;
  const lines = readLines(b.items);
  const note = optText(b.note, MAX_NOTE);
  const vehicle = optText(b.vehicle, MAX_VEHICLE);
  const truckDate = readTruck(b.truckDate, now);
  const origin = readOrigin(b);
  if (!lines || note === null || vehicle === null || truckDate === null || !origin) return null;
  return { key: b.key, lines, note, vehicle, truckDate, ...origin };
}

/** id заявки строки `i`: из ключа повтора, поэтому повтор даёт те же id. */
const requestId = (key, i) => `req_s${key}_${i}`;

/**
 * Свободного не хватает: первый товар, где просят больше, `{ productId, free }`.
 * Строки одного товара складываются. Количество не известно (товар размещён
 * без счёта, `freeStock` → `undefined`) — не проверяем: склад разберётся сам.
 */
function shortOf(lines, free) {
  const want = new Map();
  for (const l of lines) want.set(l.productId, (want.get(l.productId) ?? 0) + l.qty);
  for (const [productId, n] of want) {
    if (!free.has(productId)) return { productId, free: 0 };
    const have = free.get(productId);
    if (have !== undefined && n > have) return { productId, free: have };
  }
  return null;
}

/** Заявки из тела: по одной на строку, как `createRequests` в кабинете. */
function newRequests(b, at, memberId) {
  return b.lines.map((l, i) => ({
    id: requestId(b.key, i),
    productId: l.productId,
    qty: l.qty,
    ...(b.note ? { note: b.note } : {}),
    ...(b.vehicle ? { vehicle: b.vehicle } : {}),
    ...(b.truckDate !== undefined ? { truckDate: b.truckDate } : {}),
    ...(b.source ? { source: b.source, externalId: b.externalId } : {}),
    by: "seller",
    // Кто из людей продавца завёл: спор «я этого не заказывал» решается по журналу.
    ...(memberId ? { byMember: memberId } : {}),
    status: "new",
    createdAt: at,
    updatedAt: at,
  }));
}

/** Что видит продавец о своей заявке — как в его кабинете (`forSeller`). */
const toSeller = (r) => {
  const out = { ...r };
  delete out.packedBy;
  return out;
};

/** Проверки до записи: `null` — можно, иначе отказ `{ status, error, … }`. */
/**
 * Номера заказов площадки в заявках на свой товар этого склада: чужой номер
 * не проверяем — ответ «уже есть» выдал бы, что такой заказ есть у другого.
 */
function ownOrders(view, own, source) {
  const out = new Set();
  for (const r of list(view.requests)) {
    if (isObject(r) && r.source === source && own.has(r.productId) && r.externalId) {
      out.add(String(r.externalId).trim().toLowerCase());
    }
  }
  return out;
}

function refusal(view, own, b) {
  if (b.lines.some((l) => !own.has(l.productId))) return { status: 404, error: "not_found" };
  const open = list(view.requests).filter(
    (r) => isObject(r) && r.by === "seller" && r.status === "new" && own.has(r.productId),
  );
  if (open.length + b.lines.length > MAX_OPEN) return { status: 409, error: "too_many" };
  if (b.source && ownOrders(view, own, b.source).has(b.externalId.toLowerCase())) {
    return { status: 409, error: "duplicate_order" };
  }
  const short = shortOf(b.lines, freeStock(view));
  return short ? { status: 409, error: "short", ...short } : null;
}

function createSellerRequests({ auth, send, log, now = () => Date.now() }) {
  const { withSession, readJson } = auth;
  const limiter = createRateLimit({ capacity: PER_MINUTE, refillPerMinute: PER_MINUTE, now });
  const place = async (c) => (await c.query(`SELECT * FROM auth.actor_place()`)).rows[0] ?? null;

  /** Заявки с этими id уже есть (в любом статусе, в архиве, в корзине)? */
  async function known(c, view, ids) {
    const live = list(view.requests).filter((r) => isObject(r) && ids.includes(r.id));
    if (live.length) return live;
    const { rows } = await c.query(
      `SELECT data FROM uklad.cabinet_records
       WHERE org_id = uklad.current_org() AND domain = 'requests' AND ref = ANY($1::text[])`,
      [ids],
    );
    return rows.map((r) => r.data);
  }

  /** Склад продавца под блокировкой снимка: `{ full, view, ref }` или отказ. */
  async function sellerView(c, p) {
    const { rows } = await c.query(
      `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org() FOR UPDATE`,
    );
    if (!rows[0]) return { status: 403, error: "no_warehouse" };
    const full = await loadCabinet(c, rows[0].data);
    const ref = placeRef(full, p.warehouse_ref);
    const view = ref ? focusWarehouse(full, ref) : null;
    return view ? { full, view, ref } : { status: 403, error: "no_warehouse" };
  }

  async function create(req, res) {
    const raw = await readJson(req, res);
    if (!raw) return;
    const at = now();
    const b = readBody(raw, at);
    if (!b) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      const p = ctx.accountId ? await place(c) : null;
      const seller = typeof p?.partner_ref === "string" ? p.partner_ref : null;
      if (!seller) return { status: 403 };
      if (!limiter.take(`${ctx.orgId}:${ctx.memberId}`)) return { status: 429, error: "rate" };
      const at0 = await sellerView(c, p);
      if (at0.status) return at0;
      const { full, view, ref } = at0;
      const mine = forSeller(view, seller);
      // Склад убрал продавца из партнёров — заявок от него больше не ждёт.
      if (!list(mine.warehouse?.partners).length) return { status: 403, error: "partner" };

      const own = new Set(mine.products.map((x) => x.id));
      const ids = b.lines.map((_, i) => requestId(b.key, i));
      const before = await known(c, view, ids);
      if (before.length) {
        // Ключ уже чей-то: свои заявки — повтор, чужие не показываем.
        if (!before.every((r) => isObject(r) && own.has(r.productId))) {
          return { status: 409, error: "key_taken" };
        }
        return { status: 200, requests: before, duplicate: true };
      }
      const no = refusal(view, own, b);
      if (no) return no;

      const made = newRequests(b, at, ctx.memberId);
      const next = { ...view, requests: [...made, ...list(view.requests)] };
      const bad = await writeView(c, full, next, ref);
      if (bad) return { status: 409, error: bad.error };
      return { status: 200, requests: made };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) {
      const { status, ...rest } = out;
      return send(res, status, { ok: false, ...rest });
    }
    return send(res, 200, {
      ok: true,
      requests: out.requests.map(toSeller),
      ...(out.duplicate ? { duplicate: true } : {}),
    });
  }

  async function handle(req, res, url) {
    if (req.method !== "POST" || url.pathname !== "/api/requests") return false;
    try {
      await create(req, res);
    } catch (err) {
      // Отказ продавцу на чужой маршрут (`SellerForbidden`) — 403, а не сбой.
      if (err.httpStatus) {
        if (!res.headersSent) send(res, err.httpStatus, { ok: false });
        return true;
      }
      log.error("[uklad] заявка продавца:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createSellerRequests, readBody, shortOf, requestId };
