/**
 * Подкачка заказов площадок на сервере (шаг 2 `docs/domain/fbs.md`,
 * миграция 050).
 *
 * Сервер сам, круглые сутки, раз в полторы минуты на подключение спрашивает у
 * Ozon, WB и Маркета неотгруженные заказы и заводит новые заявками склада.
 * Браузер для этого не нужен: кабинет руководителя закрыт, а столы получают
 * работу. До миграции 050 то же делал кабинет (`orderSync.ts`, #203).
 *
 * Правило сопоставления (было `orderImport.ts`, теперь одно — здесь):
 *   · товар строки ищем по артикулу продавца или штрихкоду только среди
 *     товаров склада подключения и его партнёра (#204): одинаковый артикул у
 *     двух продавцов не путается;
 *   · совпадение должно быть одно; ноль или два — заказ целиком не заводится
 *     (половину посылки собрать нельзя), его номер — в «товар не найден»;
 *   · номер, который уже был заявкой этой площадки в любом статусе и на любом
 *     складе, в том числе отменённой или ушедшей в архив, второй раз не
 *     заводится: иначе подкачка воскрешала бы отменённое каждые полторы минуты.
 *
 * Проход по одному подключению — три шага, чтобы не держать транзакцию,
 * пока отвечает площадка (до 20 с):
 *   1. под компанией (`app.org_id`, обычный RLS) — ключ и параметры;
 *   2. без транзакции — запрос к площадке (`askPlatform`, белый список);
 *   3. под компанией — снимок FOR UPDATE, новые заявки на месте склада,
 *      версия +1 и строки работы склада — как операции стола (`deskOps.js`).
 *      Версия +1 заставляет кабинеты и столы подтянуть свежее.
 * Итог прохода — в `pull_result` подключения, его видно на экране «Интеграции».
 *
 * Найти подключение, которому пора, поверх компаний умеет только
 * `auth.connector_pull_claim` — и отдаёт она лишь компанию, номер и площадку.
 */
/* global require, module, setInterval, fetch, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { randomUUID } = require("node:crypto");
const { allowed, askPlatform, createSealer, queryString } = require("./connectors");
const { warehousesOf, focusWarehouse } = require("./viewerPlace");
const { restore } = require("./deskPlace");
const { loadCabinet, splitCabinet, MAX_SNAPSHOT_BYTES } = require("./snapshot");
const { storeRecords } = require("./records");

/** Как часто одно подключение спрашивает площадку. */
const EVERY = "90 seconds";
/** Как часто сервер ищет, кому пора. */
const TICK_MS = 30_000;
/** Сколько подключений за один обход: остальные — следующим. */
const PER_TICK = 50;
/** Страниц ответа за раз (Ozon по 100, Маркет по 50). */
const MAX_PAGES = 5;
/** Номер заказа в заявке — не длиннее, чем принимает кабинет (`MAX_EXTERNAL_ID`). */
const MAX_EXTERNAL_ID = 64;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const norm = (v) =>
  (typeof v === "string" || typeof v === "number" ? String(v) : "").trim().toLowerCase();

// ---- Ответы площадок → заказы в общей форме ----
// Заказ: { externalId, shipBy?, lines: [{ vendorCode?, barcode?, qty }] }.

/** Ozon `POST /v4/posting/fbs/unfulfilled/list`: `result.postings`. */
function mapOzon(payload) {
  const postings = payload?.result?.postings ?? payload?.postings;
  return list(postings)
    .filter((p) => isObject(p) && typeof p.posting_number === "string")
    .map((p) => ({
      externalId: p.posting_number,
      shipBy: typeof p.shipment_date === "string" ? p.shipment_date : undefined,
      // `awaiting_packaging` — ждёт сборки; после «собран» — `awaiting_deliver`.
      ...(typeof p.status === "string" ? { status: p.status } : {}),
      lines: list(p.products).map((l) => ({
        vendorCode: l?.offer_id,
        // SKU Ozon — им «собрать» называет товар (`product_id`).
        ...(Number.isSafeInteger(l?.sku) ? { sku: l.sku } : {}),
        qty: Number(l?.quantity) || 0,
      })),
    }));
}

/** WB `GET /api/v3/orders/new`: один заказ — один товар. */
function mapWb(payload) {
  return list(payload?.orders)
    .filter((o) => isObject(o) && typeof o.id === "number")
    .map((o) => ({
      externalId: String(o.id),
      lines: [{ vendorCode: o.article, barcode: list(o.skus)[0], qty: 1 }],
    }));
}

/** Маркет `GET /v2/campaigns/{id}/orders`. */
function mapYm(payload) {
  return list(payload?.orders)
    .filter((o) => isObject(o) && typeof o.id === "number")
    .map((o) => ({
      externalId: String(o.id),
      shipBy: ymDate(o.delivery?.shipments?.[0]?.shipmentDate),
      lines: list(o.items).map((l) => ({ vendorCode: l?.offerId, qty: Number(l?.count) || 0 })),
    }));
}

/** Дата Маркета «ДД-ММ-ГГГГ» (время по Москве) → ISO; иначе нет даты. */
function ymDate(v) {
  const m = typeof v === "string" && /^(\d{2})-(\d{2})-(\d{4})$/.exec(v);
  return m ? `${m[3]}-${m[2]}-${m[1]}T00:00:00+03:00` : undefined;
}

/** Срок отгрузки заказа → мс; площадка не дала или дала не дату — нет срока. */
function shipByMs(v) {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : undefined;
}

/**
 * Запросы к площадке по страницам: `first` — первая, `next(req, data)` —
 * следующая или `null`. Следующую страницу просим, только если площадка
 * сама дала, откуда продолжать.
 */
const PAGES = {
  ozon: {
    map: mapOzon,
    first: (now) => ({
      method: "POST",
      path: "/v4/posting/fbs/unfulfilled/list",
      body: {
        dir: "ASC",
        filter: {
          cutoff_from: new Date(now - 7 * 864e5).toISOString(),
          cutoff_to: new Date(now + 14 * 864e5).toISOString(),
        },
        // v4 принимает не больше 100 за запрос (ответ Ozon 18.11).
        limit: 100,
      },
    }),
    next: (req, data) =>
      data?.result?.has_next && typeof data.result.cursor === "string" && data.result.cursor
        ? { ...req, body: { ...req.body, cursor: data.result.cursor } }
        : null,
  },
  wildberries: {
    map: mapWb,
    first: () => ({ method: "GET", path: "/api/v3/orders/new" }),
    next: () => null,
  },
  "yandex-market": {
    map: mapYm,
    // Ждут сборки: в обработке и ещё не готовы к отгрузке.
    first: () => ({
      method: "GET",
      path: "/v2/campaigns/{campaignId}/orders",
      query: { status: "PROCESSING", substatus: "STARTED", limit: 50 },
    }),
    next: (req, data) => {
      const token = data?.paging?.nextPageToken;
      return typeof token === "string" && token
        ? { ...req, query: { ...req.query, page_token: token } }
        : null;
    },
  },
};

/** Все неотгруженные заказы подключения: `{ ok, orders }` или отказ площадки. */
async function fetchOrders(ctx, system, now) {
  const spec = PAGES[system];
  if (!spec) return { ok: false, error: "unsupported" };
  const orders = [];
  let req = spec.first(now);
  for (let page = 0; req && page < MAX_PAGES; page += 1) {
    if (!allowed(system, req.method, req.path, "server"))
      return { ok: false, error: "not_allowed" };
    const res = await askPlatform(
      { ...ctx, system },
      { method: req.method, path: req.path, qs: queryString(req.query), body: req.body },
    );
    if (!res.ok) return res;
    orders.push(...spec.map(res.data));
    req = spec.next(req, res.data);
  }
  return { ok: true, orders };
}

// ---- «Собран» на площадке (шаг 5 `docs/domain/fbs.md`) ----

/**
 * Запрос «собран» к площадке для заказа или `null`, если по этому заказу
 * площадке сказать нечего. Ozon: `/v4/posting/fbs/ship`, одно грузовое место
 * со всеми товарами (только из «ждёт сборки», SKU у каждой строки). Маркет:
 * `PROCESSING / READY_TO_SHIP`. WB — после сверки пути поставки с живым
 * ключом: старый метод добавления в поставку WB убрал.
 */
const ASSEMBLE = {
  ozon: (o) => {
    if (o.status !== "awaiting_packaging") return null;
    if (!o.lines.length || o.lines.some((l) => !l.sku || !(l.qty > 0))) return null;
    return {
      method: "POST",
      path: "/v4/posting/fbs/ship",
      body: {
        posting_number: o.externalId,
        packages: [{ products: o.lines.map((l) => ({ product_id: l.sku, quantity: l.qty })) }],
        with: { additional_data: false },
      },
    };
  },
  "yandex-market": (o) =>
    /^\d{1,20}$/.test(o.externalId)
      ? {
          method: "PUT",
          path: `/v2/campaigns/{campaignId}/orders/${o.externalId}/status`,
          body: { order: { status: "PROCESSING", substatus: "READY_TO_SHIP" } },
        }
      : null,
};

/** Сколько заказов за проход отмечаем «собран»: остальные — следующим. */
const MAX_ASSEMBLE = 20;

/**
 * Номера заказов, собранных на складе целиком: есть заявки этой площадки с
 * этим номером, ни одна не ждёт и не собирается, ни одна не закрыта частично
 * (недособранное площадке «собран» не говорим — решает человек).
 */
function pickedOrders(requests, source) {
  const by = new Map();
  for (const r of list(requests)) {
    if (!isObject(r) || r.source !== source || !r.externalId || r.status === "cancelled") continue;
    const k = norm(r.externalId);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out = new Set();
  for (const [k, rs] of by) {
    const done = rs.every((r) => (r.status === "done" || r.status === "shipped") && !r.partial);
    if (done) out.add(k);
  }
  return out;
}

// ---- Заказы → заявки (чистое правило) ----

/**
 * Товары, среди которых ищем строки подключения: номенклатура склада
 * (`productsOfWarehouse` кабинета), а в ней — товары партнёра подключения;
 * без партнёра — товары без партнёра («свой товар»).
 */
function productsFor(products, warehouse, partnerId) {
  return list(products).filter(
    (p) =>
      isObject(p) &&
      (p.warehouseId ? p.warehouseId === warehouse.id : !warehouse.ownCatalog) &&
      (partnerId ? p.partnerId === partnerId : !p.partnerId),
  );
}

/** Индекс «код → товары»: по артикулу и по штрихкоду. */
function codeIndex(products) {
  const map = new Map();
  const add = (code, id) => {
    if (!code) return;
    if (!map.has(code)) map.set(code, new Set());
    map.get(code).add(id);
  };
  for (const p of products) {
    add(norm(p.sku), p.id);
    add(norm(p.barcode), p.id);
  }
  return map;
}

/** Один товар по артикулу или штрихкоду строки; ноль или два — null. */
function matchLine(index, line) {
  for (const code of [norm(line.vendorCode), norm(line.barcode)]) {
    const hit = code ? index.get(code) : undefined;
    if (hit?.size === 1) return [...hit][0];
    if (hit && hit.size > 1) return null;
  }
  return null;
}

/**
 * Что завести: `{ items: [{ productId, qty, externalId }], orders, unknown }`.
 * `known` — номера этой площадки, уже бывшие заявками (в нижнем регистре).
 */
function planImport(orders, products, known) {
  const index = codeIndex(products);
  const seen = new Set(known);
  const plan = { items: [], orders: 0, unknown: [] };
  for (const order of orders) {
    const externalId = String(order.externalId ?? "")
      .trim()
      .slice(0, MAX_EXTERNAL_ID);
    const key = norm(externalId);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const lines = order.lines.filter((l) => Number.isFinite(l.qty) && l.qty > 0);
    const matched = lines.map((l) => matchLine(index, l));
    if (!lines.length || matched.some((m) => m === null)) {
      plan.unknown.push(externalId);
      continue;
    }
    plan.orders += 1;
    const truckDate = shipByMs(order.shipBy);
    lines.forEach((l, i) =>
      plan.items.push({
        productId: matched[i],
        qty: Math.max(1, Math.round(l.qty)),
        externalId,
        ...(truckDate !== undefined ? { truckDate } : {}),
      }),
    );
  }
  return plan;
}

/** Заявки из плана — той же формы, что `createRequests` кабинета. */
function newRequests(plan, source, now, makeId = () => `req_${randomUUID()}`) {
  return plan.items.map((it) => ({
    id: makeId(),
    productId: it.productId,
    qty: it.qty,
    source,
    externalId: it.externalId,
    // Срок отгрузки площадки — дата машины заявки: по ней «Задания» и
    // «Сборка» ставят срочное первым, календарь показывает день.
    ...(it.truckDate !== undefined ? { truckDate: it.truckDate } : {}),
    status: "new",
    createdAt: now,
    updatedAt: now,
  }));
}

/** Номера заказов площадки во всех заявках кабинета (все склады). */
function knownIn(full, source) {
  const out = new Set();
  const take = (reqs) => {
    for (const r of list(reqs)) {
      if (isObject(r) && r.source === source && r.externalId) out.add(norm(r.externalId));
    }
  };
  take(full.requests);
  for (const saved of Object.values(isObject(full.warehouseData) ? full.warehouseData : {})) {
    if (isObject(saved)) take(saved.requests);
  }
  return out;
}

/**
 * Склад подключения: сохранённый с ним, если он ещё есть в компании; не
 * сохранён (подключения до миграции 050) и склад в компании один — он.
 * Иначе `null`: на какой склад заводить, не угадываем.
 */
function connectionWarehouse(full, params) {
  const all = warehousesOf(full);
  if (params.warehouseId) {
    return all.some((w) => w.id === params.warehouseId) ? params.warehouseId : null;
  }
  return all.length === 1 ? all[0].id : null;
}

// ---- Проход ----

function createOrderPull({
  auth,
  log,
  secretKey,
  fetchImpl = fetch,
  now = () => Date.now(),
  // Кабинет не оплачен и закрыт на правку (`planLimits.paymentFor`) — площадку
  // не спрашиваем и заявок не заводим (Кирилл 20.11): склад не работает
  // бесплатно, а оплатили — следующий обход подхватит заказы.
  unpaid = () => false,
}) {
  const sealer = createSealer(secretKey);
  if (!sealer) return null;

  /**
   * Транзакция под компанией подключения. Компанию ставит база
   * (`auth.connector_pull_enter`) по билету прохода, а не сервер. Билет
   * истёк, подключение или компанию удалили — прохода нет.
   */
  const inOrg = (orgId, id, ticket, fn) =>
    auth.tx(async (c) => {
      const r = await c.query(`SELECT auth.connector_pull_enter($1, $2) AS org`, [id, ticket]);
      if (r.rows[0]?.org !== orgId) return { gone: true };
      return fn(c);
    });

  // Итог записан — проход кончен, билет больше не нужен.
  const remember = (orgId, id, ticket, result) =>
    inOrg(orgId, id, ticket, (c) =>
      c.query(
        `UPDATE uklad.connector_accounts
         SET pull_result = $2, pull_ticket = NULL, pull_ticket_until = NULL WHERE id = $1`,
        [id, result],
      ),
    ).catch((e) => log.error("[uklad] подкачка: итог не записан", id, e.message));

  /** Шаг 3: новые заявки на складе подключения. */
  async function store(c, account, orders, at) {
    const { rows } = await c.query(
      `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org() FOR UPDATE`,
    );
    if (!rows[0]) return { error: "no_snapshot" };
    const full = await loadCabinet(c, rows[0].data);
    const params = isObject(account.params) ? account.params : {};
    const ref = connectionWarehouse(full, params);
    const view = ref ? focusWarehouse(full, ref) : null;
    if (!view) return { error: "warehouse" };
    const partnerId = typeof params.partnerId === "string" ? params.partnerId : null;
    // Партнёра могли удалить со склада: тогда его магазин заказов не заводит.
    const partners = list(view.warehouse.partners);
    if (partnerId && !partners.some((p) => isObject(p) && p.id === partnerId)) {
      return { error: "partner" };
    }
    const source = account.system;
    const ids = orders.map((o) => norm(o.externalId)).filter(Boolean);
    const known = knownIn(full, source);
    // Ушедшие в архив заявки в кабинет не грузятся, но номер тоже занят.
    const archived = await c.query(
      `SELECT DISTINCT lower(data->>'externalId') AS x FROM uklad.cabinet_records
       WHERE org_id = uklad.current_org() AND domain = 'requests' AND deleted_at IS NULL
         AND data->>'source' = $1 AND lower(data->>'externalId') = ANY($2::text[])`,
      [source, ids],
    );
    for (const r of archived.rows) known.add(r.x);
    const plan = planImport(orders, productsFor(full.products, view.warehouse, partnerId), known);
    if (plan.items.length) {
      const next = {
        ...view,
        requests: [...newRequests(plan, source, at), ...list(view.requests)],
      };
      const split = splitCabinet(restore(full, next, ref));
      const payload = JSON.stringify(split.doc);
      if (Buffer.byteLength(payload) > MAX_SNAPSHOT_BYTES) return { error: "too_large" };
      await c.query(
        `UPDATE uklad.cabinet_snapshots
         SET previous = data, data = $1::jsonb, version = version + 1,
             updated_at = now(), updated_by = NULL, updated_by_desk = NULL
         WHERE org_id = uklad.current_org()`,
        [payload],
      );
      if (split.items) await storeRecords(c, split.items, split.slots);
    }
    // Собранное на складе — площадке «собран» (после записи, вне транзакции).
    const picked = pickedOrders(view.requests, source);
    return { created: plan.orders, unknown: plan.unknown, picked };
  }

  /** «Собран» на площадке для собранных на складе заказов из ответа площадки. */
  async function assemble(ctx, system, orders, picked) {
    const make = ASSEMBLE[system];
    const out = { assembled: 0, assembleFailed: [] };
    if (!make) return out;
    const todo = orders
      .filter((o) => picked.has(norm(o.externalId)))
      .map((o) => [o.externalId, make(o)])
      .filter(([, req]) => req)
      .slice(0, MAX_ASSEMBLE);
    for (const [externalId, req] of todo) {
      if (!allowed(system, req.method, req.path, "server")) continue;
      const res = await askPlatform({ ...ctx, system }, { ...req, qs: "" });
      if (res.ok) out.assembled += 1;
      else {
        out.assembleFailed.push(externalId);
        out.assembleDetail ??= res.detail || res.error;
      }
    }
    return out;
  }

  /**
   * Один проход по подключению `{ orgId, id, system, ticket }` (билет — из
   * `connector_pull_claim` или `connector_pull_ticket`). Возвращает и пишет в
   * `pull_result`: `{ at, created, unknown }` или `{ at, error, detail? }`.
   */
  async function pullAccount({ orgId, id, system, ticket }) {
    const at = now();
    if (unpaid(orgId)) {
      const result = { at, error: "unpaid" };
      await remember(orgId, id, ticket, result);
      return result;
    }
    let account;
    try {
      account = await inOrg(orgId, id, ticket, async (c) => {
        const r = await c.query(
          `SELECT id, system, params, secret FROM uklad.connector_accounts
           WHERE id = $1 AND system = $2 AND deleted_at IS NULL`,
          [id, system],
        );
        return r.rows[0] ?? null;
      });
    } catch (e) {
      log.error("[uklad] подкачка: подключение не прочитано", id, e.message);
      return { at, error: "server" };
    }
    if (!account || account.gone) return { at, error: "no_connection" };
    let key;
    try {
      key = sealer.open(account.secret, `${orgId}:${id}`);
    } catch {
      log.error("[uklad] подкачка: ключ не расшифровался", id);
      const result = { at, error: "key" };
      await remember(orgId, id, ticket, result);
      return result;
    }
    const params = isObject(account.params) ? account.params : {};
    const fetched = await fetchOrders({ key, params, log, fetchImpl }, system, at);
    let result;
    if (!fetched.ok) {
      result = { at, error: fetched.error, ...(fetched.detail ? { detail: fetched.detail } : {}) };
    } else {
      try {
        const stored = await inOrg(orgId, id, ticket, (c) => store(c, account, fetched.orders, at));
        if (stored.gone) result = { at, error: "no_connection" };
        else {
          const { picked, ...rest } = stored;
          const done = picked
            ? await assemble({ key, params, log, fetchImpl }, system, fetched.orders, picked)
            : {};
          result = { at, ...rest, ...done };
        }
      } catch (e) {
        log.error("[uklad] подкачка: заявки не записаны", id, e.message);
        result = { at, error: "server" };
      }
    }
    await remember(orgId, id, ticket, result);
    return result;
  }

  let running = false;
  /** Один обход: подключения, которым пора, по одному. */
  async function tick() {
    if (running) return;
    running = true;
    try {
      for (let i = 0; i < PER_TICK; i += 1) {
        const claim = await auth.tx(
          async (c) =>
            (await c.query(`SELECT * FROM auth.connector_pull_claim($1::interval)`, [EVERY]))
              .rows[0],
        );
        if (!claim) break;
        await pullAccount({
          orgId: claim.org_id,
          id: claim.id,
          system: claim.system,
          ticket: claim.ticket,
        });
      }
    } catch (e) {
      log.error("[uklad] подкачка заказов:", e.message);
    } finally {
      running = false;
    }
  }

  return {
    pullAccount,
    tick,
    start() {
      setInterval(tick, TICK_MS).unref();
    },
  };
}

module.exports = {
  createOrderPull,
  mapOzon,
  mapWb,
  mapYm,
  planImport,
  productsFor,
  newRequests,
  knownIn,
  connectionWarehouse,
  fetchOrders,
  pickedOrders,
  ASSEMBLE,
};
