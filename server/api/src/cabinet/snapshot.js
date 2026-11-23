/**
 * Кабинет компании на сервере одним снимком (ADR 0010, миграция 008).
 *
 * Переходный шаг, пока работа склада раскладывается по таблицам: сервер
 * хранит тот же JSON, что кабинет держит в браузере (`persistedState`).
 * Сервер его не разбирает — только проверяет, что это объект нужного
 * размера, и ставит компанию из сессии: чужой снимок не прочитать и не
 * записать, это решает RLS.
 *
 * Одновременная правка с двух устройств: запись проходит, только если
 * клиент знает текущую `version`. Не знает — 409 и текущая версия: клиент
 * забирает свежий снимок, а не затирает чужую работу молча.
 *
 * Кому: только вход по паролю с правом `staff.manage` (владелец, начальник
 * склада). В снимке весь кабинет — ставки, журнал смен, товар всех продавцов,
 * — поэтому продавец и вход по бейджу получают 403: своё они увидят через
 * отдельные таблицы, когда снимок разложится по ним.
 *
 * Маршруты:
 *   GET  /api/cabinet/snapshot — снимок компании или `snapshot: null`
 *   POST /api/cabinet/snapshot — { version, format, data }; version 0 — первая запись
 *   POST /api/cabinet/snapshot/changes — только изменённое поверх версии:
 *     { version, format, doc, slots, upsert, remove, products? } (`saveChanges`)
 *   GET  /api/cabinet/history?after=… — архив законченной работы страницами
 *     (`history`): `{ rows: [{ w, d, ref, pos, data }], next }`
 *
 * Товары в снимке не хранятся (миграция 013): кабинет присылает и получает
 * их в составе снимка, а сервер раскладывает по строкам `uklad.products` —
 * со своей корзиной и журналом правок. Так же — работа склада (миграция 021,
 * `records.js`): заявки, приёмка, тара, рейсы и журнал смен лежат строками
 * `uklad.cabinet_records`, в документе от них остаются метки.
 */
/* global require, module, Buffer */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createRateLimit } = require("../rateLimit");
const { writableKeys, foreignRows, mergeScoped } = require("./writeScope");
const { forViewer, VIEW_PERMS } = require("./viewer");
const { forSeller } = require("./seller");
const { placeRef, focusWarehouse, warehousesOf } = require("./viewerPlace");
const {
  managerRef,
  managerWarehouse,
  archiveFor,
  restoreManager,
  foreignWarehouses,
  ownScope,
  scopeRoot,
  mergeRoot,
  rowsAllowed,
  foreignCounts,
} = require("./managerScope");
const { logAction } = require("./audit");
const { recordMoves, invalidWork } = require("./moves");
const { recordStorage, loadStorage, parsePeriod } = require("./storage");
const { loadInventoryLog, parseLogPeriod } = require("./inventoryLog");
const {
  splitWarehouses,
  withWarehouses,
  storeWarehouses,
  guardWarehouseDelete,
  WarehouseDeleteError,
} = require("./warehouses");
const { PlanLimitError } = require("./planLimits");
const {
  WAREHOUSE_LISTS,
  COMPANY_LISTS,
  splitRecords,
  assembleRecords,
  loadRecords,
  storedDoc,
  storeRecords,
  hasMarks,
  massGone,
  massRemoved,
  lostLists,
  inlineDrops,
  marksOf,
  liveCounts,
  upsertRecords,
  removeRecords,
  isRef,
  archiveDaily,
  loadArchive,
  archivedChanged,
} = require("./records");

// Пустой кабинет — единицы килобайт, демо со всей историей — около мегабайта.
// Восемь — с запасом, но не столько, чтобы одним запросом забить диск.
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
/** С какой доли лимита предупреждаем нас (не склад: его это только пугает). */
const NEAR_LIMIT = 0.7;

/**
 * Снимок компании подбирается к лимиту записи: дальше у неё перестанет
 * сохраняться работа. Это знаем мы, по журналу сервера, за недели до отказа.
 */
const warned = new Map();
const WARN_EVERY_MS = 60 * 60 * 1000;
function warnNearLimit(log, orgId, bytes, now = Date.now()) {
  if (bytes < NEAR_LIMIT * MAX_SNAPSHOT_BYTES) return;
  // Раз в час на компанию: стол пишет сотни раз в час, журнал не засоряем.
  if (now - (warned.get(orgId) ?? -Infinity) < WARN_EVERY_MS) return;
  warned.set(orgId, now);
  const pct = Math.round((bytes / MAX_SNAPSHOT_BYTES) * 100);
  log.warn?.(`[uklad] снимок компании ${orgId} заполнен на ${pct}% лимита записи`);
}
// Кабинет пишет не чаще раза в 5 секунд на человека; 30 записей в минуту на
// компанию — запас на несколько устройств, но не на скрипт с мегабайтами.
const WRITES_PER_MINUTE = 30;

const FORBIDDEN = Symbol("forbidden");
/** Смотрящему не назначен склад, а складов в компании несколько. */
const NO_WAREHOUSE = Symbol("no_warehouse");

/** Склад, карточка, имя и роль того, кто вошёл (миграция 034). */
async function actorPlace(c) {
  return (await c.query(`SELECT * FROM auth.actor_place()`)).rows[0] ?? null;
}

/**
 * Продавец (миграция 039) — человек, закреплённый за партнёром, какая бы
 * роль у него ни стояла: он видит только свой товар и кабинет не пишет
 * (заявки продавца через сервер — следующим шагом).
 */
const sellerOf = (place) => (typeof place?.partner_ref === "string" ? place.partner_ref : null);

/**
 * Кто смотрит: имя — из его карточки на складе (или из приглашения), подпись
 * в шапке — его роль. Без этого шапка показывала «Здравствуйте!» и запасное
 * «Кладовщик» вместо «Старшего смены».
 */
function withPerson(data, place, warehouse) {
  const card = Array.isArray(warehouse?.staff)
    ? warehouse.staff.find((m) => m && m.id === place?.staff_ref)
    : undefined;
  const name = String(card?.name ?? place?.name ?? "").trim();
  return {
    ...data,
    account: { ...data.account, name, ...(place?.role_name ? { title: place.role_name } : {}) },
  };
}
const LIMITED = Symbol("limited");
/** Снимок — весь кабинет: только руководитель, вошедший паролем. */
/**
 * Есть ли в записи новое решение по спорному, подходящее под `match`:
 * строка `disputes` с решением, которое у той же строки на сервере другое
 * или отсутствует.
 */
async function newDecision(c, items, match) {
  const decided = items.filter(
    (i) =>
      i.d === "disputes" &&
      isObject(i.data) &&
      typeof i.data.resolution === "string" &&
      match(i.data),
  );
  if (decided.length === 0) return false;
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, ref, data->>'resolution' AS res FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND domain = 'disputes' AND ref = ANY($1::text[])`,
    [decided.map((i) => i.ref)],
  );
  const was = new Map(rows.map((r) => [`${r.w}\u0000${r.ref}`, r.res]));
  return decided.some((i) => was.get(`${i.w}\u0000${i.ref}`) !== i.data.resolution);
}

/**
 * Права на решения в записи кабинета: правка учёта по инвентаризации —
 * `goods.decide` (миграция 024), списание — `goods.writeoff`, начальник
 * склада (миграция 030, Кирилл 13.11).
 */
async function decisionsForbidden(c, ctx, items) {
  const inventory = (d) => d.kind === "inventory_short" || d.kind === "inventory_over";
  if (!ctx.can("goods.decide") && (await newDecision(c, items, inventory))) return true;
  const writeOff = (d) => d.resolution === "written_off";
  return !ctx.can("goods.writeoff") && (await newDecision(c, items, writeOff));
}

const mayUse = (ctx) => Boolean(ctx.accountId) && ctx.can("staff.manage");
// Член команды без «Персонала» (кладовщик, приёмщик…) кабинет только
// смотрит: снимок по разрешённому списку (`viewer.js` — без реквизитов,
// цен, ставок, контактов, журнала смен), запись — только `staff.manage`.
// Роль продавца (`seller.requests`) склад так не видит: там товар всех
// партнёров, а продавцу — только свой.
// Смотреть кабинет — любое право чтения раздела (миграция 033); что именно
// уйдёт, решает `forViewer` по разделам.
const mayView = (ctx) =>
  Boolean(ctx.accountId) && VIEW_PERMS.some((p) => ctx.can(p)) && !ctx.can("seller.requests");

/**
 * Документ компании из базы → кабинет целиком, как его видит браузер:
 * товары — из таблицы, работа склада — со строк.
 */
async function loadCabinet(c, doc, rows = null) {
  // `rows` — строки работы склада, уже известные стол (`deskCache.js`).
  const records = rows ? assembleRecords(await storedDoc(c, doc), rows) : await loadRecords(c, doc);
  return { ...records, products: await allProducts(c) };
}

/** Товары компании из таблицы — все склады. */
async function allProducts(c) {
  const { rows } = await c.query(`SELECT uklad.load_products() AS products`);
  return rows[0].products;
}

/** Снимок без товаров. */
function withoutProducts(data) {
  const out = { ...data };
  delete out.products;
  return out;
}

/**
 * Кабинет → что хранится в `cabinet_snapshots` (`doc`: без товаров и складов,
 * с метками вместо списков), строки работы склада (`items`) и склады
 * (`warehouses`, `null` — не трогать). Строки раскладываются до того, как
 * склады уйдут из документа: списки в корне — открытого склада.
 */
function splitCabinet(data) {
  const split = splitRecords(withoutProducts(data));
  const { doc, cards } = splitWarehouses(split.doc);
  // `withStores` — тот же документ со складами: проверкам списков нужно знать,
  // чьи списки в корне.
  return { ...split, doc, warehouses: cards, withStores: split.doc };
}

/**
 * Каталог, который пишет не владелец: товары его склада `ref`. Общий каталог
 * (товары без склада) — только у склада без своего каталога (`ownCatalog`) и
 * только пока такие товары у компании есть (до 17.11, миграция 059): иначе
 * товар без склада ложится на его склад, а не становится общим.
 * `null` — склада нет.
 */
async function productScope(c, data, ref) {
  const wh = warehousesOf(data).find((w) => w.id === ref);
  if (!wh) return null;
  if (wh.ownCatalog) return { ref, shared: false };
  const { rows } = await c.query(
    `SELECT EXISTS (SELECT 1 FROM uklad.products WHERE org_id = uklad.current_org()
       AND warehouse_ref IS NULL AND deleted_at IS NULL) AS shared`,
  );
  return { ref, shared: rows[0].shared };
}

/** Строки каталога в счёт: всей компании (`$2` пуст) или одного склада. */
const IN_SCOPE = `($2::text IS NULL OR warehouse_ref = $2 OR ($3 AND warehouse_ref IS NULL))`;
const scopeArgs = (scope) => [scope?.ref ?? null, scope?.shared ?? false];

/**
 * Убирает ли запись вместе с уже убранным за сутки больше половины каталога.
 * Так выглядит сбой (пустой стор после ошибки) или злой умысел, а не работа
 * человека: из корзины в кабинете пока не восстановить, поэтому такую запись
 * сервер не принимает. Счёт — за сутки, а не за одну запись: иначе каталог
 * стирался бы частями по девять. Большой каталог чистится за несколько
 * дней, маленький (один-два товара) — как обычно. Заведённое за последние
 * сутки в счёт не идёт (ревью безопасности #238).
 */
async function massDelete(c, data, scope = null) {
  if (!Array.isArray(data.products)) return false;
  const refs = data.products.map((p) => p?.id).filter((id) => typeof id === "string");
  // Считаем только товары, жившие сутки назад: заведённые сегодня (опечатки
  // импорта) удаляются свободно и не раздувают базу — иначе тысяча пустышек
  // первой записью позволила бы второй стереть настоящий каталог.
  const { rows } = await c.query(
    `SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS live,
            count(*) FILTER (WHERE deleted_at IS NULL AND NOT (ref = ANY($1::text[])))::int AS gone,
            count(*) FILTER (WHERE deleted_at > now() - interval '1 day'
                             AND NOT (ref = ANY($1::text[])))::int AS day
     FROM uklad.products WHERE org_id = uklad.current_org() AND ${IN_SCOPE}
       AND created_at <= now() - interval '1 day'
       AND (deleted_at IS NULL OR deleted_at > now() - interval '1 day')`,
    [refs, ...scopeArgs(scope)],
  );
  const { live, gone, day } = rows[0];
  if (gone === 0) return false;
  const base = live + day;
  const out = gone + day;
  if (out * 2 <= base) return false;
  return out >= 10 || (out === base && base >= 3);
}

/** Сколько живых товаров запись уводит в корзину. */
async function productsGone(c, data, scope) {
  if (!Array.isArray(data.products)) return 0;
  const refs = data.products.map((p) => p?.id).filter((id) => typeof id === "string");
  const { rows } = await c.query(
    `SELECT count(*)::int AS n FROM uklad.products
     WHERE org_id = uklad.current_org() AND ${IN_SCOPE}
       AND deleted_at IS NULL AND NOT (ref = ANY($1::text[]))`,
    [refs, ...scopeArgs(scope)],
  );
  return rows[0].n;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const LISTS = new Set([...WAREHOUSE_LISTS, ...COMPANY_LISTS]);
/** Что из работы склада нужно журналу движений: тара, короба отгрузки и размещения. */
const MOVE_LISTS = ["boxes", "outboundBoxes", "placements"];
const slotKey = (x) => `${x.w}\u0000${x.d}`;
const isSlot = (x) => isObject(x) && typeof x.w === "string" && x.w.length <= 200 && LISTS.has(x.d);

/**
 * Правка «только изменённое» неверной формы. Строка — своя запись своего
 * списка (`data.id === ref`), список правки — метка в документе, тара
 * проходит те же проверки, что в записи целиком.
 */
function badChanges(b) {
  if (!Number.isInteger(b.version) || b.version < 1) return true;
  if (!Number.isInteger(b.format) || b.format < 1) return true;
  if (!isObject(b.doc) || "products" in b.doc) return true;
  if ("products" in b && !Array.isArray(b.products)) return true;
  if (![b.slots, b.upsert, b.remove].every(Array.isArray)) return true;
  if (!b.slots.every(isSlot)) return true;
  const slots = new Set(b.slots.map(slotKey));
  const inSlot = (r) => isSlot(r) && slots.has(slotKey(r)) && isRef(r.ref);
  if (
    !b.upsert.every(
      (r) => inSlot(r) && Number.isInteger(r.pos) && isObject(r.data) && r.data.id === r.ref,
    )
  ) {
    return true;
  }
  if (!b.remove.every(inSlot)) return true;
  const marks = marksOf(b.doc);
  if (!b.slots.every((x) => marks.has(slotKey(x)))) return true;
  // Тара и размещения — тем же правилом, что запись целиком.
  return invalidWork(assembleRecords(b.doc, b.upsert));
}

/** Живые товары компании: ref → склад и время правки (для журнала действий). */
async function liveProducts(c) {
  const { rows } = await c.query(
    `SELECT ref, warehouse_ref AS w, updated_at::text AS t FROM uklad.products
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL`,
  );
  return new Map(rows.map((r) => [r.ref, r]));
}

/** id товаров — сколько влезет в подробности журнала, остальное — числом. */
function idsFor(list) {
  const ids = [];
  for (const id of list) if (JSON.stringify([...ids, id]).length <= 1500) ids.push(id);
  return {
    n: list.length,
    ids,
    ...(ids.length < list.length ? { more: list.length - ids.length } : {}),
  };
}

/**
 * Журнал действий (Кирилл 22.11: «удаление товаров… все действия»): что
 * запись каталога завела, изменила и унесла в корзину — по складу товара,
 * одной строкой на вид. Ничего не изменилось — ничего не пишется.
 */
async function noteProducts(c, log, before, after) {
  const by = new Map();
  const add = (w, kind, ref) => {
    const key = `${w ?? ""}|${kind}`;
    if (!by.has(key)) by.set(key, { w: w ?? null, kind, refs: [] });
    by.get(key).refs.push(ref);
  };
  for (const [ref, r] of after) {
    const was = before.get(ref);
    if (!was) add(r.w, "create", ref);
    else if (was.w !== r.w) {
      // Перенос на другой склад виден обоим: новому — пришёл, прежнему — ушёл.
      add(r.w, "move_in", ref);
      add(was.w, "move_out", ref);
    } else if (was.t !== r.t) add(r.w, "update", ref);
  }
  for (const [ref, r] of before) if (!after.has(ref)) add(r.w, "delete", ref);
  for (const { w, kind, refs } of by.values()) {
    await logAction(c, log, { action: `product.${kind}`, warehouse: w, details: idsFor(refs) });
  }
}

/** Товары из присланного снимка — в таблицу. Нет поля — товары не трогаем. */
async function storeProducts(c, data, scope = null, log = null) {
  if (!("products" in data)) return;
  const cards = JSON.stringify(data.products);
  const before = await liveProducts(c);
  if (!scope) await c.query(`SELECT uklad.save_products($1::jsonb)`, [cards]);
  // Не владелец пишет каталог своего склада (миграция 059): чужой не трогается.
  else
    await c.query(`SELECT uklad.save_products($1::jsonb, $2, $3)`, [
      cards,
      scope.ref,
      scope.shared,
    ]);
  await noteProducts(c, log, before, await liveProducts(c));
}

function createSnapshot({ auth, send, log, limits = null }) {
  const { withSession, readJson } = auth;

  /**
   * Склады — в таблицу, под лимитом тарифа (`planLimits`, ключ `warehouses`):
   * новый склад сверх тарифа — `PlanLimitError`, запись откатывается.
   * Правка, переименование и удаление склада лимит не трогают. Удаление —
   * только владельцу (`guardWarehouseDelete`).
   */
  async function storeWarehousesLimited(c, ctx, cards) {
    await guardWarehouseDelete(c, ctx, cards);
    const room = cards && limits ? await limits.guard(c, ctx.orgId, "warehouses") : null;
    await storeWarehouses(c, cards, { owner: ctx.can("org.manage") });
    await room?.check();
  }

  /**
   * Отказ лимита тарифа из записи — ответ 409 `plan_limit`, а не 500; удаление
   * склада не владельцем — 409 `warehouse_delete_owner`, кабинет забирает копию;
   * товар чужого склада — 403.
   */
  const overLimit = (pending) =>
    pending.catch((err) => {
      if (err instanceof PlanLimitError) return { planLimit: err };
      if (err instanceof WarehouseDeleteError) return { conflict: true, error: err.message };
      // Карточка чужого склада (миграция 059) — отказ, а не сбой.
      if (err?.code === "42501" && err.message === "products:foreign") return FORBIDDEN;
      throw err;
    });
  const sendLimit = (res, err) =>
    send(res, 409, { ok: false, error: "plan_limit", limit: err.key, max: err.limit });
  const writes = createRateLimit({
    capacity: WRITES_PER_MINUTE,
    refillPerMinute: WRITES_PER_MINUTE,
  });

  async function load(req, res) {
    const out = await withSession(req, async (c, ctx) => {
      const place = ctx.accountId ? await actorPlace(c) : null;
      const seller = sellerOf(place);
      const viewer = Boolean(seller) || !mayUse(ctx);
      if (viewer && !seller && !mayView(ctx)) return FORBIDDEN;
      const { rows } = await c.query(
        `SELECT version, format, data, updated_at FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org()`,
      );
      if (!rows[0]) return false;
      // Законченное старше окна — в архив, до того как собрать кабинет: так
      // браузер держит живую работу и последние недели, а не всю историю.
      if (viewer) {
        // Смотрящий архив не двигает: это работа руководителя. Кабинет — на
        // его складе (миграция 034), а не на том, что открыт у руководителя.
        const full = await loadCabinet(c, rows[0].data);
        const ref = placeRef(full, place?.warehouse_ref);
        const focused = focusWarehouse(full, ref);
        if (!focused) return NO_WAREHOUSE;
        if (seller) {
          return {
            ...rows[0],
            viewer,
            seller,
            writable: [],
            data: withPerson(forSeller(focused, seller), place, null),
          };
        }
        return {
          ...rows[0],
          viewer,
          writable: writableKeys(ctx.can),
          data: withPerson(forViewer(focused, ctx.can), place, focused.warehouse),
        };
      }
      await archiveDaily(c);
      // Весь кабинет — владельцу; руководитель склада — свой склад (managerScope.js).
      const full = await loadCabinet(c, rows[0].data);
      const ref = managerRef(ctx, place, full);
      if (ref === false) return NO_WAREHOUSE;
      if (!ref) return { ...rows[0], data: full };
      // Журнал смен, корректировки и размещения — только своего склада.
      return { ...rows[0], data: scopeRoot(focusWarehouse(full, ref), await ownScope(c, ref)) };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (out === NO_WAREHOUSE) return send(res, 403, { ok: false, error: "no_warehouse" });
    if (!out) return send(res, 200, { ok: true, snapshot: null });
    return send(res, 200, {
      ok: true,
      snapshot: {
        version: out.version,
        format: out.format,
        data: out.data,
        updatedAt: out.updated_at,
        ...(out.viewer ? { viewer: true, writable: out.writable } : {}),
        ...(out.seller ? { seller: out.seller } : {}),
      },
    });
  }

  async function save(req, res) {
    const b = await readJson(req, res, MAX_SNAPSHOT_BYTES);
    if (!b) return;
    const version = b.version;
    const format = b.format;
    if (
      !Number.isInteger(version) ||
      version < 0 ||
      !Number.isInteger(format) ||
      format < 1 ||
      !b.data ||
      typeof b.data !== "object" ||
      Array.isArray(b.data) ||
      ("products" in b.data && !Array.isArray(b.data.products)) ||
      invalidWork(b.data) ||
      hasMarks(b.data)
    ) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    let split = splitCabinet(b.data);
    let data = JSON.stringify(split.doc);
    const out = await overLimit(
      withSession(req, async (c, ctx) => {
        const place = await actorPlace(c);
        if (!mayUse(ctx) || sellerOf(place)) return FORBIDDEN;
        if (!writes.take(ctx.orgId)) return LIMITED;
        // Каталог, который пишет не владелец, — только его склада.
        let catalog = null;
        // Руководитель склада пишет только свой склад: присланное — на место
        // его склада в кабинете компании из базы (managerScope.js).
        if (!ctx.can("org.manage")) {
          const cur = await c.query(
            `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org() FOR UPDATE`,
          );
          // Первый склад компании заводит владелец.
          if (!cur.rows[0]) return FORBIDDEN;
          const full = await loadCabinet(c, cur.rows[0].data);
          const ref = managerRef(ctx, place, full);
          if (ref === false) return FORBIDDEN;
          if (foreignWarehouses(b.data, ref)) return { conflict: true, error: "warehouse_owner" };
          catalog = await productScope(c, full, ref);
          if (!catalog) return FORBIDDEN;
          b.data = mergeRoot(full, restoreManager(full, b.data, ref), await ownScope(c, ref));
          split = splitCabinet(b.data);
          data = JSON.stringify(split.doc);
        }
        if (await massDelete(c, b.data, catalog)) {
          return { conflict: true, error: "products_mass_delete" };
        }
        if (await massGone(c, split.items, split.slots)) {
          return { conflict: true, error: "records_mass_delete" };
        }
        // Архив не переписывается: копия забирает свежие данные.
        if (await archivedChanged(c, split.items)) return { conflict: true };
        if (await decisionsForbidden(c, ctx, split.items)) return FORBIDDEN;
        // Список, лежавший строками, пропал вовсе (ключа нет, не список) —
        // кабинет показал бы пустоту, а массовое удаление этого не увидело бы.
        const prev = await c.query(
          `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org() FOR UPDATE`,
        );
        // Прежний документ — с оглавлением (миграция 056): после записи
        // оглавление уже новое, поэтому «до» берём здесь, а не из `previous`.
        const prevDoc = prev.rows[0] ? await storedDoc(c, prev.rows[0].data) : null;
        if (prevDoc) {
          const lost = lostLists(prevDoc, split.withStores);
          if (lost.missing.length > 0 || (await inlineDrops(c, lost.inline))) {
            return { conflict: true, error: "records_mass_delete" };
          }
        }
        // Первая запись: строки ещё нет. Двое одновременно — второй получит
        // конфликт ключа и ответ 409, а не вторую строку.
        if (version === 0) {
          const { rows } = await c.query(
            `INSERT INTO uklad.cabinet_snapshots (org_id, format, data, updated_by)
           VALUES (uklad.current_org(), $1, $2::jsonb, $3)
           ON CONFLICT (org_id) DO NOTHING
           RETURNING version`,
            [format, data, ctx.memberId],
          );
          if (!rows[0]) return { conflict: true };
          await storeProducts(c, b.data, null, log);
          await storeWarehousesLimited(c, ctx, split.warehouses);
          await storeRecords(c, split.items, split.slots);
          await recordMoves(c, {}, b.data, rows[0].version, { memberId: ctx.memberId });
          await recordStorage(c, b.data);
          return { version: rows[0].version, orgId: ctx.orgId };
        }
        const { rows } = await c.query(
          `UPDATE uklad.cabinet_snapshots
         SET previous = data, data = $1::jsonb, format = $2, version = version + 1,
             updated_at = now(), updated_by = $3, updated_by_desk = NULL
         WHERE org_id = uklad.current_org() AND version = $4
         RETURNING version`,
          [data, format, ctx.memberId, version],
        );
        // Версия не сошлась — товары тоже не трогаем: запись целиком не прошла.
        if (!rows[0]) return { conflict: true };
        // Прежний кабинет целиком — пока строки ещё старые: по нему журнал
        // движений считает, что прибыло и убыло.
        const before = await loadRecords(c, prevDoc ?? {});
        await storeProducts(c, b.data, catalog, log);
        // Дальше — кабинет целиком: занятости нужны товары и чужих складов.
        if (catalog) b.data = { ...b.data, products: await allProducts(c) };
        await storeWarehousesLimited(c, ctx, split.warehouses);
        await storeRecords(c, split.items, split.slots);
        // Что где прибыло и убыло — в журнал движений, с тем, кто записал.
        await recordMoves(c, before, b.data, rows[0].version, {
          memberId: ctx.memberId,
        });
        // Сколько паллето-мест и коробов занято сегодня — для счёта за хранение.
        await recordStorage(c, b.data);
        return { version: rows[0].version, orgId: ctx.orgId };
      }),
    );
    if (out === null) return send(res, 401, { ok: false });
    if (out?.planLimit) return sendLimit(res, out.planLimit);
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (out === LIMITED) return send(res, 429, { ok: false }, { "Retry-After": "30" });
    if (out.conflict) {
      const current = await withSession(req, async (c) => {
        const { rows } = await c.query(
          `SELECT version FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
        );
        return rows[0]?.version ?? 0;
      });
      const error = out.error ?? "conflict";
      return send(res, 409, { ok: false, error, version: current ?? 0 });
    }
    // Потолок теперь — размер одной записи кабинета целиком, а не документа.
    const sent = Number(req.headers["content-length"]) || Buffer.byteLength(JSON.stringify(b.data));
    warnNearLimit(log, out.orgId, sent);
    return send(res, 200, { ok: true, version: out.version });
  }

  /**
   * Только изменённое (шаг 2 потолка данных): документ компании без списков
   * работы склада и строки, которые поменялись. Кабинет считает правку от
   * того, что сервер отдал или принял на этой версии. Не сошлось — число
   * строк в списке не равно метке — правка откатывается целиком, а кабинет
   * получает `diverged` и пишет кабинет целиком.
   */
  async function saveChanges(req, res) {
    const b = await readJson(req, res, MAX_SNAPSHOT_BYTES);
    if (!b) return;
    if (badChanges(b)) return send(res, 400, { ok: false, error: "bad_request" });
    let doc = JSON.stringify(b.doc);
    const out = await overLimit(
      withSession(req, async (c, ctx) => {
        // Без «Персонала» — только то, на что есть право роли (`writeScope.js`).
        const place = await actorPlace(c);
        if (sellerOf(place)) return FORBIDDEN;
        const scoped = !mayUse(ctx);
        // Руководитель склада: строки — только своего склада (managerScope.js).
        const manager = !scoped && !ctx.can("org.manage");
        if (scoped && !(mayView(ctx) && writableKeys(ctx.can).length > 0)) return FORBIDDEN;
        if (scoped && (foreignRows(b.upsert, ctx.can) || foreignRows(b.remove, ctx.can))) {
          return FORBIDDEN;
        }
        if (scoped && "products" in b && !ctx.can("products.edit")) return FORBIDDEN;
        if (!writes.take(ctx.orgId)) return LIMITED;
        const { rows } = await c.query(
          `SELECT version, data FROM uklad.cabinet_snapshots
         WHERE org_id = uklad.current_org() FOR UPDATE`,
        );
        const cur = rows[0] && { ...rows[0], data: await storedDoc(c, rows[0].data) };
        if (!cur || cur.version !== b.version) return { conflict: true };
        let catalog = null;
        if (manager) {
          const ref = managerRef(ctx, place, cur.data);
          if (ref === false) return FORBIDDEN;
          catalog = await productScope(c, cur.data, ref);
          if (!catalog) return FORBIDDEN;
          // Свой склад или общие списки компании (`w = ""`); из журнала смен,
          // корректировок и размещений — только записи своего склада.
          const scope = await ownScope(c, ref);
          if (!(await rowsAllowed(c, ref, scope, b.upsert, b.remove))) return FORBIDDEN;
          if (!b.slots.every((r) => r.w === ref || r.w === "")) return FORBIDDEN;
          if (foreignWarehouses(b.doc, ref)) return { conflict: true, error: "warehouse_owner" };
          // Склад не менялся — его карточка из базы, чтобы встать на своё место.
          if (!("warehouse" in b.doc)) {
            b.doc = { ...b.doc, warehouse: focusWarehouse(cur.data, ref).warehouse };
          }
          b.doc = await foreignCounts(c, restoreManager(cur.data, b.doc, ref), scope);
          doc = JSON.stringify(b.doc);
        }
        // Документ без складов — склады не менялись: берём их из таблицы, иначе
        // проверки ниже не знали бы, чьи списки в корне.
        if (!("warehouse" in b.doc)) b.doc = await withWarehouses(c, b.doc);
        if (scoped) {
          // Закрытое смотрящему он не получал — берём из базы, а не из копии.
          const place = await actorPlace(c);
          const ref = placeRef(cur.data, place?.warehouse_ref);
          if (!ref || !focusWarehouse(cur.data, ref)) return FORBIDDEN;
          catalog = await productScope(c, cur.data, ref);
          if (!catalog) return FORBIDDEN;
          b.doc = mergeScoped(cur.data, b.doc, ctx.can, ref);
          doc = JSON.stringify(b.doc);
        }
        // Удалять товары может только руководитель (`staff.manage`): роль с
        // «Товары: запись» правит и добавляет, но каталог не чистит.
        if (scoped && "products" in b && (await productsGone(c, b, catalog)) > 0) return FORBIDDEN;
        if ("products" in b && (await massDelete(c, b, catalog))) {
          return { conflict: true, error: "products_mass_delete" };
        }
        // Список, лежавший строками, обязан остаться меткой: иначе кабинет
        // показал бы пустоту, не тронув строк. Пусть пишет себя целиком —
        // там такую запись судит защита от массового удаления.
        const lost = lostLists(cur.data, b.doc);
        if (lost.missing.length + lost.inline.length > 0)
          return { conflict: true, error: "diverged" };
        if (await massRemoved(c, b.remove)) return { conflict: true, error: "records_mass_delete" };
        if (await archivedChanged(c, b.upsert)) return { conflict: true };
        if (await decisionsForbidden(c, ctx, b.upsert)) return FORBIDDEN;
        const before = await loadRecords(c, cur.data, MOVE_LISTS);
        await c.query(`SAVEPOINT changes`);
        await upsertRecords(c, b.upsert);
        await removeRecords(c, b.remove);
        // Каждая метка документа — ровно столько живых строк. Иначе копия в
        // браузере считала правку не от того, что лежит здесь.
        const marks = marksOf(b.doc);
        const live = await liveCounts(
          c,
          [...marks.keys()].map((k) => {
            const [w, d] = k.split("\u0000");
            return { w, d };
          }),
        );
        if ([...marks].some(([k, n]) => live.get(k) !== n)) {
          await c.query(`ROLLBACK TO SAVEPOINT changes`);
          return { conflict: true, error: "diverged" };
        }
        // Склады — строками (миграция 051), в документе их нет.
        const wh = splitWarehouses(b.doc);
        doc = JSON.stringify(wh.doc);
        await storeWarehousesLimited(c, ctx, wh.cards);
        const upd = await c.query(
          `UPDATE uklad.cabinet_snapshots
         SET previous = data, data = $1::jsonb, format = $2, version = version + 1,
             updated_at = now(), updated_by = $3, updated_by_desk = NULL
         WHERE org_id = uklad.current_org()
         RETURNING version`,
          [doc, b.format, ctx.memberId],
        );
        const version = upd.rows[0].version;
        if ("products" in b) await storeProducts(c, b, catalog, log);
        const after = await loadRecords(c, b.doc, MOVE_LISTS);
        await recordMoves(c, before, after, version, { memberId: ctx.memberId });
        // Правка могла сдвинуть тару, отметить паллетное место или сменить
        // продавца товара — занятость считаем по кабинету целиком.
        await recordStorage(c, await loadCabinet(c, b.doc));
        return { version, orgId: ctx.orgId };
      }),
    );
    if (out === null) return send(res, 401, { ok: false });
    if (out?.planLimit) return sendLimit(res, out.planLimit);
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    if (out === LIMITED) return send(res, 429, { ok: false }, { "Retry-After": "30" });
    if (out.conflict) {
      const current = await withSession(req, async (c) => {
        const { rows } = await c.query(
          `SELECT version FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
        );
        return rows[0]?.version ?? 0;
      });
      return send(res, 409, { ok: false, error: out.error ?? "conflict", version: current ?? 0 });
    }
    warnNearLimit(log, out.orgId, Buffer.byteLength(doc));
    return send(res, 200, { ok: true, version: out.version });
  }

  /**
   * Архив законченной работы — для отчётов за долгий период. Только тем же,
   * кому весь кабинет. Страница — `ARCHIVE_PAGE` строк, `after` — ключ из
   * `next` прошлой страницы.
   */
  async function history(req, res, url) {
    let after = null;
    const raw = url.searchParams.get("after");
    if (raw !== null) {
      try {
        after = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
      } catch {
        after = undefined;
      }
      if (
        !isObject(after) ||
        typeof after.w !== "string" ||
        after.w.length > 200 ||
        !LISTS.has(after.d) ||
        !isRef(after.ref)
      ) {
        return send(res, 400, { ok: false, error: "bad_request" });
      }
    }
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      // Руководитель склада — только архив своего склада (managerScope.js).
      const ref = await managerWarehouse(c, ctx);
      if (ref === false) return FORBIDDEN;
      const page = await loadArchive(c, after);
      if (!ref) return page;
      return { ...page, rows: archiveFor(ref, await ownScope(c, ref), page.rows) };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    const next = out.next && Buffer.from(JSON.stringify(out.next)).toString("base64url");
    return send(res, 200, { ok: true, rows: out.rows, next });
  }

  /**
   * Занятость склада по суткам за период (миграция 037) — для счёта за
   * хранение. Только руководителю: это основа денег продавцу, как и цены.
   */
  async function storage(req, res, url) {
    const period = parsePeriod(url);
    if (!period) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      // Занятость чужого склада руководителю не нужна: это деньги того склада.
      const ref = await managerWarehouse(c, ctx);
      if (ref === false || (ref && ref !== period.warehouse)) return FORBIDDEN;
      return loadStorage(c, period);
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    return send(res, 200, { ok: true, rows: out });
  }

  /**
   * Пересчёты инвентаризации за период (`inventoryLog.js`) — для акта.
   * Только руководителю: в акте числа учёта, которых стол не показывает.
   */
  async function inventory(req, res, url) {
    const period = parseLogPeriod(url);
    if (!period) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!mayUse(ctx)) return FORBIDDEN;
      // Руководитель — пересчёты своего склада, владелец — всей компании.
      const ref = await managerWarehouse(c, ctx);
      if (ref === false) return FORBIDDEN;
      return loadInventoryLog(c, { ...period, warehouse: ref });
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out === FORBIDDEN) return send(res, 403, { ok: false });
    return send(res, 200, { ok: true, entries: out });
  }

  const routes = {
    "GET /api/cabinet/history": history,
    "GET /api/cabinet/storage": storage,
    "GET /api/cabinet/inventory": inventory,
    "GET /api/cabinet/snapshot": load,
    "POST /api/cabinet/snapshot": save,
    "POST /api/cabinet/snapshot/changes": saveChanges,
  };

  /** Обработчик маршрутов снимка. `false` — маршрут не наш. */
  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой снимка кабинета:", err.message);
      if (!res.headersSent) send(res, err?.httpStatus === 403 ? 403 : 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = {
  createSnapshot,
  MAX_SNAPSHOT_BYTES,
  warnNearLimit,
  loadCabinet,
  splitCabinet,
  storeRecords,
  hasMarks,
  archivedChanged,
};
