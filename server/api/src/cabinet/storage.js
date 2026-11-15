/**
 * Хранение как услуга (миграция 036): сколько паллето-мест и коробов товар
 * продавца занимает на складе — по суткам.
 *
 * Снимок кабинета знает только «где лежит сейчас», а склад берёт деньги за
 * каждые сутки. Поэтому после каждой записи работы склада сервер считает
 * занятость (`storageTally`) и пишет её строкой на сегодня (`recordStorage`):
 * за день строка переписывается, остаётся состояние на конец дня. Сутки без
 * записей ничего на полках не меняли — их отчёт берёт из последней строки до
 * них (`loadStorage` отдаёт и её).
 *
 * Правила счёта — те же, что в `src/lib/storage.ts` (менять в обоих местах):
 * - хранение начинается с размещения — тара без адреса места не занимает;
 * - паллето-место — ячейка полки с отметкой «паллетное место»
 *   (`ShelfConfig.palletPlace`), где лежит товар продавца: сколько бы тары ни
 *   стояло в ячейке, место одно;
 * - остальная тара на местах хранения — короб каждая; товар, положенный в
 *   ячейку без тары, — один короб на ячейку;
 * - продавец — по товару (`Product.partnerId`); в таре двух продавцов место
 *   считается каждому: каждый из них его занимает;
 * - невскрытые места грузовой приёмки товара по учёту не держат и продавца
 *   не знают — пока не считаются.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const MAX_REF = 100;
/** Самый длинный период отчёта: год с запасом. */
const MAX_DAYS = 400;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Склады кабинета: активный в корне, остальные — в `otherWarehouses` и `warehouseData`. */
function warehouses(data) {
  const out = [];
  const active = isObject(data.warehouse) ? data.warehouse : null;
  if (active && typeof active.id === "string") {
    out.push({ id: active.id, floors: list(active.floors), work: data });
  }
  const work = isObject(data.warehouseData) ? data.warehouseData : {};
  for (const w of list(data.otherWarehouses)) {
    if (typeof w.id !== "string" || w.id === active?.id) continue;
    out.push({ id: w.id, floors: list(w.floors), work: isObject(work[w.id]) ? work[w.id] : {} });
  }
  return out.filter((w) => w.id.length >= 1 && w.id.length <= MAX_REF);
}

/** Полка ячейки по плану склада (этаж-алиас берёт раскладку источника). */
function shelfOf(floors, a) {
  const floor = floors.find((f) => f.id === a.floorId);
  if (!floor) return null;
  const own = floor.aliasOf ? (floors.find((f) => f.id === floor.aliasOf) ?? floor) : floor;
  const m = list(own.modules).find((x) => x.id === a.moduleId);
  if (!m || !Array.isArray(m.shelves)) return null;
  const sh = m.shelves[a.shelfIndex];
  return isObject(sh) ? sh : null;
}

const cellKey = (a) => `${a.floorId}/${a.moduleId}/${a.shelfIndex}/${a.cellIndex}`;
const isAddress = (a) =>
  isObject(a) &&
  typeof a.floorId === "string" &&
  typeof a.moduleId === "string" &&
  Number.isInteger(a.shelfIndex) &&
  Number.isInteger(a.cellIndex);

/**
 * Занятость складов сейчас: строка на склад и продавца. Продавец без товара на
 * полках в ответ не попадает — ноль за него допишет `recordStorage`.
 */
function storageTally(data) {
  if (!isObject(data)) return [];
  const partnerOf = new Map(
    list(data.products)
      .filter((p) => typeof p.id === "string")
      .map((p) => [p.id, typeof p.partnerId === "string" ? p.partnerId : ""]),
  );
  const partnersOf = (lines) => {
    const out = new Set();
    for (const l of list(lines)) {
      if (typeof l.productId !== "string" || !(Number(l.qty) > 0)) continue;
      out.add(partnerOf.get(l.productId) ?? "");
    }
    return out;
  };
  const rows = [];
  const placements = isObject(data.placements) ? Object.entries(data.placements) : [];
  for (const wh of warehouses(data)) {
    const floorIds = new Set(wh.floors.map((f) => f.id));
    // продавец → ячейки паллето-мест и число коробов
    const pallets = new Map();
    const boxes = new Map();
    const put = (partner, a) => {
      if (partner.length > MAX_REF) return;
      if (shelfOf(wh.floors, a)?.palletPlace === true) {
        if (!pallets.has(partner)) pallets.set(partner, new Set());
        pallets.get(partner).add(cellKey(a));
      } else {
        boxes.set(partner, (boxes.get(partner) ?? 0) + 1);
      }
    };
    for (const b of list(wh.work.boxes)) {
      if (b.sealed || !isAddress(b.address) || !floorIds.has(b.address.floorId)) continue;
      for (const partner of partnersOf(b.lines)) put(partner, b.address);
    }
    // Товар без тары: один короб на ячейку и продавца.
    const loose = new Set();
    for (const [productId, a] of placements) {
      if (!isAddress(a) || !floorIds.has(a.floorId) || !partnerOf.has(productId)) continue;
      const partner = partnerOf.get(productId);
      const key = `${partner}\u0000${cellKey(a)}`;
      if (loose.has(key)) continue;
      loose.add(key);
      put(partner, a);
    }
    for (const partner of new Set([...pallets.keys(), ...boxes.keys()])) {
      rows.push({
        warehouse: wh.id,
        partner,
        pallets: pallets.get(partner)?.size ?? 0,
        boxes: boxes.get(partner) ?? 0,
      });
    }
  }
  return rows.sort((a, b) =>
    a.warehouse === b.warehouse
      ? a.partner.localeCompare(b.partner)
      : a.warehouse.localeCompare(b.warehouse),
  );
}

/**
 * Записать занятость на сегодня (сутки по Москве). Продавец, который был в
 * сегодняшних строках, а теперь с полок ушёл, получает ноль: последняя строка
 * дня — состояние на конец дня, и прежнее количество не должно тянуться.
 */
async function recordStorage(c, data) {
  const rows = storageTally(data);
  await c.query(
    `WITH now_rows AS (
       SELECT r.warehouse, r.partner, r.pallets, r.boxes
       FROM jsonb_to_recordset($1::jsonb)
         AS r(warehouse text, partner text, pallets integer, boxes integer)
     ), today AS (SELECT (now() AT TIME ZONE 'Europe/Moscow')::date AS d),
     gone AS (
       UPDATE uklad.storage_days s SET pallets = 0, boxes = 0, updated_at = now()
       FROM today
       WHERE s.org_id = uklad.current_org() AND s.day = today.d
         AND (s.pallets > 0 OR s.boxes > 0)
         AND NOT EXISTS (SELECT 1 FROM now_rows n
                         WHERE n.warehouse = s.warehouse_ref AND n.partner = s.partner_ref)
       RETURNING 1
     ), carried AS (
       -- Ушёл с полок до сегодняшней записи: вчерашнее число иначе тянулось бы
       -- на сегодня и дальше. Ноль пишем на сегодня явно.
       SELECT DISTINCT ON (s.warehouse_ref, s.partner_ref) s.warehouse_ref, s.partner_ref,
         s.pallets, s.boxes
       FROM uklad.storage_days s, today
       WHERE s.org_id = uklad.current_org() AND s.day < today.d
       ORDER BY s.warehouse_ref, s.partner_ref, s.day DESC
     )
     INSERT INTO uklad.storage_days (org_id, warehouse_ref, day, partner_ref, pallets, boxes)
     SELECT uklad.current_org(), n.warehouse, today.d, n.partner, n.pallets, n.boxes
     FROM now_rows n, today
     UNION ALL
     SELECT uklad.current_org(), p.warehouse_ref, today.d, p.partner_ref, 0, 0
     FROM carried p, today
     WHERE (p.pallets > 0 OR p.boxes > 0)
       -- Сегодняшнюю строку уже обнулил gone: второй раз её не трогаем.
       AND NOT EXISTS (SELECT 1 FROM uklad.storage_days s
                       WHERE s.org_id = uklad.current_org() AND s.day = today.d
                         AND s.warehouse_ref = p.warehouse_ref AND s.partner_ref = p.partner_ref)
       AND NOT EXISTS (SELECT 1 FROM now_rows n
                       WHERE n.warehouse = p.warehouse_ref AND n.partner = p.partner_ref)
     ON CONFLICT (org_id, warehouse_ref, day, partner_ref) DO UPDATE
       SET pallets = EXCLUDED.pallets, boxes = EXCLUDED.boxes, updated_at = now()
       WHERE uklad.storage_days.pallets <> EXCLUDED.pallets
          OR uklad.storage_days.boxes <> EXCLUDED.boxes`,
    [JSON.stringify(rows)],
  );
  return rows.length;
}

/** Период отчёта из запроса; null — неверный. */
function parsePeriod(url) {
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const warehouse = url.searchParams.get("warehouse") ?? "";
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) return null;
  if (!warehouse || warehouse.length > MAX_REF) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  if ((b - a) / 86_400_000 > MAX_DAYS) return null;
  return { from, to, warehouse };
}

/**
 * Строки склада за период и последние сутки до него: по ним отчёт
 * восстанавливает каждые сутки периода, даже без записей в них.
 */
async function loadStorage(c, { from, to, warehouse }) {
  const { rows } = await c.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, partner_ref AS partner, pallets, boxes
     FROM uklad.storage_days
     WHERE org_id = uklad.current_org() AND warehouse_ref = $3
       AND day <= $2::date
       AND day >= coalesce(
         (SELECT max(day) FROM uklad.storage_days
          WHERE org_id = uklad.current_org() AND warehouse_ref = $3 AND day < $1::date),
         $1::date)
     ORDER BY day, partner_ref`,
    [from, to, warehouse],
  );
  return rows;
}

module.exports = { storageTally, recordStorage, loadStorage, parsePeriod };
