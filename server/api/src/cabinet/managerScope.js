/**
 * Руководитель склада — только своего склада (Кирилл 22.11: «разные склады
 * связывает только владелец»).
 *
 * Раньше «Персонал» (`staff.manage`) открывал кабинет всей компании: начальник
 * склада Б видел людей, устройства и партнёров склада А и мог их переписать.
 * Теперь весь кабинет — только владельцу (`org.manage`). Руководитель склада
 * получает его вид (`focusWarehouse`), как смотрящий, но целиком, без
 * урезания, и пишет только свой склад: присланное ложится на место его
 * склада, остальные склады и их работа берутся из базы (`restoreManager`).
 * Заводить и удалять склады он не может.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { placeRef, focusWarehouse } = require("./viewerPlace");
const { restore } = require("./deskPlace");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Склад руководителя: `null` — владелец, видит всю компанию; строка — id
 * склада; `false` — склад не назначен, а складов несколько: отказ, пока
 * владелец не закрепит его за складом.
 */
function managerRef(ctx, place, data) {
  if (ctx.can("org.manage")) return null;
  const ref = placeRef(data, place?.warehouse_ref);
  return ref && focusWarehouse(data, ref) ? ref : false;
}

/**
 * Кабинет компании после записи руководителя склада `ref`: его склад
 * (карточка и работа) — из присланного, всё остальное о складах — из базы.
 * Чужие склады, прислал он их или нет, не меняются.
 */
function restoreManager(full, after, ref) {
  const out = restore(full, after, ref);
  const card = isObject(after?.warehouse) && after.warehouse.id === ref ? after.warehouse : null;
  if (!card) return out;
  if (isObject(out.warehouse) && out.warehouse.id === ref) return { ...out, warehouse: card };
  return {
    ...out,
    otherWarehouses: (Array.isArray(out.otherWarehouses) ? out.otherWarehouses : []).map((w) =>
      isObject(w) && w.id === ref ? card : w,
    ),
  };
}

/** Прислал склады, кроме своего: завёл новый или тронул чужой — отказ. */
function foreignWarehouses(after, ref) {
  // Заготовка (`placeholder`) тоже склад: ею прячут чужой.
  const all = [
    after?.warehouse,
    ...(Array.isArray(after?.otherWarehouses) ? after.otherWarehouses : []),
  ];
  return all.some((w) => isObject(w) && w.id !== ref);
}

/**
 * Списки компании, где каждая запись — чья-то со склада: журнал смен и
 * корректировки — человека (`staffId`), размещения «товар → ячейка» — этажа
 * склада (`floorId`). Руководитель видит и пишет только записи своего склада;
 * остальные общие списки (категории, шаблоны) — общие для компании.
 */
const PEOPLE = ["staffEvents", "payAdjustments"];
const PLACES = "placements";
const SCOPED = new Set([...PEOPLE, PLACES]);

/** Люди и этажи склада `ref` — по базе, а не по присланному. */
async function ownScope(c, ref) {
  const { rows } = await c.query(
    `SELECT
       ARRAY(SELECT s.ref FROM uklad.staff s
             WHERE s.org_id = uklad.current_org() AND s.warehouse_ref = $1
               AND s.deleted_at IS NULL
             UNION
             SELECT e->>'id' FROM uklad.warehouses w,
                    jsonb_array_elements(CASE jsonb_typeof(w.card->'staff')
                      WHEN 'array' THEN w.card->'staff' ELSE '[]' END) e
             WHERE w.org_id = uklad.current_org() AND w.ref = $1
               AND w.deleted_at IS NULL AND NOT w.staff_rows) AS staff,
       ARRAY(SELECT f->>'id' FROM uklad.warehouses w,
                    jsonb_array_elements(CASE jsonb_typeof(w.card->'floors')
                      WHEN 'array' THEN w.card->'floors' ELSE '[]' END) f
             WHERE w.org_id = uklad.current_org() AND w.ref = $1
               AND w.deleted_at IS NULL) AS floors`,
    [ref],
  );
  return { staff: new Set(rows[0].staff), floors: new Set(rows[0].floors) };
}

/** Запись списка `key` — со склада руководителя. */
function owns(scope, key, item) {
  if (!isObject(item)) return false;
  if (key === PLACES) return isObject(item.value) && scope.floors.has(item.value.floorId);
  return scope.staff.has(item.staffId);
}

const ownAddr = (scope, addr) => isObject(addr) && scope.floors.has(addr.floorId);

/** Вид руководителя: из списков людей и размещений — только своё. */
function scopeRoot(data, scope) {
  const out = { ...data };
  for (const key of PEOPLE) {
    if (Array.isArray(data[key])) out[key] = data[key].filter((x) => owns(scope, key, x));
  }
  if (isObject(data[PLACES])) {
    out[PLACES] = Object.fromEntries(
      Object.entries(data[PLACES]).filter(([, addr]) => ownAddr(scope, addr)),
    );
  }
  return out;
}

/** Запись руководителя: своё — из присланного, чужое — из базы. */
function mergeRoot(full, after, scope) {
  const out = { ...after };
  for (const key of PEOPLE) {
    const base = Array.isArray(full?.[key]) ? full[key] : [];
    const sent = Array.isArray(after?.[key]) ? after[key] : null;
    if (!sent) {
      if (key in (full ?? {})) out[key] = full[key];
      continue;
    }
    out[key] = [
      ...base.filter((x) => !owns(scope, key, x)),
      ...sent.filter((x) => owns(scope, key, x)),
    ];
  }
  const base = isObject(full?.[PLACES]) ? full[PLACES] : {};
  const sent = isObject(after?.[PLACES]) ? after[PLACES] : null;
  if (!sent) {
    if (PLACES in (full ?? {})) out[PLACES] = full[PLACES];
  } else {
    out[PLACES] = {
      ...Object.fromEntries(Object.entries(base).filter(([, a]) => !ownAddr(scope, a))),
      ...Object.fromEntries(Object.entries(sent).filter(([, a]) => ownAddr(scope, a))),
    };
  }
  return out;
}

/**
 * «Только изменённое» от руководителя: строки чужого склада — отказ; строки
 * общих списков компании (`w = ""`) можно, но из журнала смен, корректировок
 * и размещений — только записи своего склада, и новая, и та, что была.
 */
async function rowsAllowed(c, ref, scope, upsert, remove) {
  const all = [...upsert, ...remove];
  if (!all.every((r) => isObject(r) && (r.w === ref || r.w === ""))) return false;
  if (!upsert.every((r) => r.w !== "" || !SCOPED.has(r.d) || owns(scope, r.d, r.data))) {
    return false;
  }
  const touched = all.filter((r) => r.w === "" && SCOPED.has(r.d));
  if (touched.length === 0) return true;
  const { rows } = await c.query(
    `SELECT r.domain AS d, r.data FROM uklad.cabinet_records r
     JOIN jsonb_to_recordset($1::jsonb) AS t(d text, ref text)
       ON r.domain = t.d AND r.ref = t.ref
     WHERE r.org_id = uklad.current_org() AND r.warehouse_ref = ''`,
    [JSON.stringify(touched.map(({ d, ref: k }) => ({ d, ref: k })))],
  );
  return rows.every((r) => owns(scope, r.d, r.data));
}

/**
 * Метки этих списков в документе руководителя — число его строк. В базе их
 * больше на чужие: прибавляем чужие живые, иначе сверка меток не сойдётся.
 */
async function foreignCounts(c, doc, scope) {
  const out = { ...doc };
  for (const key of SCOPED) {
    const mark = doc?.[key];
    if (!isObject(mark) || !Number.isInteger(mark.$rows)) continue;
    const { rows } = await c.query(
      `SELECT r.data FROM uklad.cabinet_records r
       WHERE r.org_id = uklad.current_org() AND r.warehouse_ref = '' AND r.domain = $1
         AND r.deleted_at IS NULL AND r.archived_at IS NULL`,
      [key],
    );
    const foreign = rows.filter((r) => !owns(scope, key, r.data)).length;
    out[key] = { $rows: mark.$rows + foreign };
  }
  return out;
}

module.exports = {
  managerRef,
  restoreManager,
  foreignWarehouses,
  ownScope,
  scopeRoot,
  mergeRoot,
  rowsAllowed,
  foreignCounts,
};
