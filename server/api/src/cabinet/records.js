/**
 * Работа склада строками, а не одним документом (миграция 021, ADR 0010).
 *
 * Заявки, поставки, приёмка, тара, рейсы, задания, спорное, документы,
 * короба отгрузки и журнал смен растут с каждым заказом — в документе
 * компании они упирались в лимит записи за недели работы. Теперь каждая
 * запись — своя строка `uklad.cabinet_records`, а в документе на её месте
 * остаётся метка `{ "$rows": n }`. При чтении сервер собирает документ
 * обратно, и кабинет получает тот же JSON, что прислал: туда и обратно без
 * потерь, порядок списка сохраняется.
 *
 * Список, который нельзя разложить без потерь (запись без строкового id,
 * два одинаковых id), остаётся в документе как был: лучше лишний вес, чем
 * пропавшая заявка. Старый документ без меток читается как есть и
 * раскладывается при первой записи — переносить данные миграцией не нужно.
 *
 * Строки не удаляются: пропавшая из списка уходит в корзину (`deleted_at`),
 * вернувшаяся — из неё.
 */
/* global module */

/** Списки работы склада: у активного склада — в корне, у остальных — в `warehouseData`. */
const WAREHOUSE_LISTS = [
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "requests",
  "shipments",
  "tasks",
  "disputes",
  "docRecords",
  "outboundBoxes",
];
/**
 * Списки, куда кабинет добавляет новое в начало. Место в списке у них
 * считается от конца (−1 — последняя запись): новая заявка сверху не
 * сдвигает остальные, и запись переписывает одну строку, а не все. Ошибка
 * здесь стоит лишних перезаписей, а не порядка: порядок верен в любом случае.
 */
const NEWEST_FIRST = new Set(["expectedShipments", "requests", "shipments", "tasks", "disputes"]);
/** Списки всей компании, без склада. */
const COMPANY_LISTS = ["staffEvents"];
/** Склад для списков компании. */
const COMPANY = "";
const MARK = "$rows";
const MAX_REF = 200;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isRef = (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_REF;

/** Метка «список лежит строками». */
function isMark(v) {
  return isObject(v) && Object.keys(v).length === 1 && Number.isInteger(v[MARK]);
}

/** Список можно разложить без потерь: у каждой записи свой строковый id. */
function rowable(list) {
  if (!Array.isArray(list)) return false;
  const seen = new Set();
  for (const item of list) {
    if (!isObject(item) || !isRef(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
  }
  return true;
}

/**
 * Пройти по всем местам, где лежат списки: корень (активный склад и
 * компания) и `warehouseData` остальных складов. `visit(holder, key, wh)`
 * получает копию объекта, которую можно править.
 */
function eachList(data, visit) {
  const out = { ...data };
  const active = isRef(data.warehouse?.id) ? data.warehouse.id : null;
  if (active) for (const key of WAREHOUSE_LISTS) visit(out, key, active);
  for (const key of COMPANY_LISTS) visit(out, key, COMPANY);
  if (isObject(data.warehouseData)) {
    out.warehouseData = { ...data.warehouseData };
    for (const [wh, work] of Object.entries(data.warehouseData)) {
      // Стопка активного склада рядом с ним самим — его строки уже взяты
      // из корня. Такую оставляем документом, иначе два списка слились бы.
      if (!isObject(work) || !isRef(wh) || wh === active) continue;
      const copy = { ...work };
      out.warehouseData[wh] = copy;
      for (const key of WAREHOUSE_LISTS) visit(copy, key, wh);
    }
  }
  return out;
}

/**
 * Кабинет → документ с метками и строки. Строка — `{ w, d, ref, pos, data }`:
 * склад, список, id записи, место в списке и сама запись.
 */
function splitRecords(data) {
  const items = [];
  const doc = eachList(data, (holder, key, wh) => {
    const list = holder[key];
    if (!rowable(list)) return;
    const from = NEWEST_FIRST.has(key) ? -list.length : 0;
    list.forEach((item, i) =>
      items.push({ w: wh, d: key, ref: item.id, pos: from + i, data: item }),
    );
    holder[key] = { [MARK]: list.length };
  });
  return { doc, items };
}

/** Документ с метками и строки базы → кабинет целиком. */
function assembleRecords(doc, rows) {
  const lists = new Map();
  for (const r of rows) {
    const k = `${r.w}\u0000${r.d}`;
    if (!lists.has(k)) lists.set(k, []);
    lists.get(k).push(r.data);
  }
  return eachList(doc, (holder, key, wh) => {
    if (isMark(holder[key])) holder[key] = lists.get(`${wh}\u0000${key}`) ?? [];
  });
}

/** Метки в присланном кабинете — не работа человека, а чужой формат: отказ. */
function hasMarks(data) {
  let found = false;
  eachList(data, (holder, key) => {
    if (isMark(holder[key])) found = true;
  });
  return found;
}

/** Документ из базы → кабинет целиком: списки со строк. */
async function loadRecords(c, doc) {
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, domain AS d, data FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL
     ORDER BY warehouse_ref, domain, position`,
  );
  return assembleRecords(doc, rows);
}

/**
 * Строки кабинета → база. Новое добавляется, изменённое переписывается (и
 * только оно), пропавшее уходит в корзину, вернувшееся — из неё.
 */
async function storeRecords(c, items) {
  await c.query(
    `INSERT INTO uklad.cabinet_records AS r (org_id, warehouse_ref, domain, ref, position, data)
     SELECT DISTINCT ON (w, d, ref) uklad.current_org(), w, d, ref, pos, data
     FROM jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text, pos integer, data jsonb)
     ORDER BY w, d, ref, pos
     ON CONFLICT (org_id, warehouse_ref, domain, ref) DO UPDATE SET
       position = excluded.position, data = excluded.data, deleted_at = NULL, updated_at = now()
     WHERE r.deleted_at IS NOT NULL
        OR (r.position, r.data) IS DISTINCT FROM (excluded.position, excluded.data)`,
    [JSON.stringify(items)],
  );
  await c.query(
    `WITH keep AS MATERIALIZED (
       SELECT w, d, ref FROM jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text))
     UPDATE uklad.cabinet_records r SET deleted_at = now(), updated_at = now()
     WHERE r.org_id = uklad.current_org() AND r.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM keep k
                       WHERE k.w = r.warehouse_ref AND k.d = r.domain AND k.ref = r.ref)`,
    [JSON.stringify(items.map(({ w, d, ref }) => ({ w, d, ref })))],
  );
}

module.exports = {
  WAREHOUSE_LISTS,
  COMPANY_LISTS,
  splitRecords,
  assembleRecords,
  hasMarks,
  isMark,
  loadRecords,
  storeRecords,
};
