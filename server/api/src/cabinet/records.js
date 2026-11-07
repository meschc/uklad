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
 *
 * Законченная работа старше `ARCHIVE_DAYS` уходит в архив (миграция 022,
 * `archiveRecords`): кабинет её не получает, запись её не трогает, отчёты
 * читают её отдельно (`loadArchive`). Все проверки и счёт строк ниже — по
 * живым неархивным строкам.
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
/** Сколько дней законченная работа остаётся в кабинете, прежде чем уйти в архив. */
const ARCHIVE_DAYS = 45;
/** Строк архива за один ответ. */
const ARCHIVE_PAGE = 2000;

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
 * Кабинет → документ с метками, строки и разложенные списки. Строка —
 * `{ w, d, ref, pos, data }`: склад, список, id записи, место в списке и сама
 * запись; список (`slots`) — `{ w, d }`. Корзина работает только внутри
 * разложенных списков: список, оставшийся документом, своих строк не теряет.
 */
function splitRecords(data) {
  const items = [];
  const slots = [];
  const doc = eachList(data, (holder, key, wh) => {
    const list = holder[key];
    if (!rowable(list)) return;
    slots.push({ w: wh, d: key });
    const from = NEWEST_FIRST.has(key) ? -list.length : 0;
    list.forEach((item, i) =>
      items.push({ w: wh, d: key, ref: item.id, pos: from + i, data: item }),
    );
    holder[key] = { [MARK]: list.length };
  });
  return { doc, items, slots };
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

/** Списки-метки документа: «склад\0список» → сколько записей в нём. */
function marksOf(doc) {
  const out = new Map();
  eachList(doc, (holder, key, wh) => {
    if (isMark(holder[key])) out.set(`${wh}\u0000${key}`, holder[key][MARK]);
  });
  return out;
}

/**
 * Списки, которые в прежнем документе лежали строками, а в новом кабинете
 * пропали, хотя их склад на месте: `missing` — ключа нет или там не список,
 * `inline` — список лежит в документе (`{ w, d, list }`). Удалённый склад
 * сюда не попадает.
 * Пропавший список при чтении показал бы пустоту мимо защиты от массового
 * удаления — такую запись сервер не принимает.
 */
function lostLists(prevDoc, next) {
  const was = marksOf(prevDoc);
  const now = new Map();
  eachList(next, (holder, key, wh) => now.set(`${wh}\u0000${key}`, holder[key]));
  const missing = [];
  const inline = [];
  for (const k of was.keys()) {
    if (!now.has(k)) continue;
    const v = now.get(k);
    if (isMark(v)) continue;
    if (!Array.isArray(v)) missing.push(k);
    else {
      const [w, d] = k.split("\u0000");
      inline.push({ w, d, list: v });
    }
  }
  return { missing, inline };
}

/**
 * Документ из базы → кабинет целиком: списки со строк. `domains` — собрать
 * только эти списки (журналу движений нужна одна тара), остальные метки
 * станут пустыми списками.
 */
async function loadRecords(c, doc, domains = null) {
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, domain AS d, data FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL AND archived_at IS NULL
       AND ($1::text[] IS NULL OR domain = ANY($1::text[]))
     ORDER BY warehouse_ref, domain, position`,
    [domains],
  );
  return assembleRecords(doc, rows);
}

/** Сколько живых строк в каждом из списков: «склад\0список» → число. */
async function liveCounts(c, slots) {
  const { rows } = await c.query(
    `SELECT s.w, s.d, count(r.ref)::int AS n
     FROM jsonb_to_recordset($1::jsonb) AS s(w text, d text)
     LEFT JOIN uklad.cabinet_records r ON r.org_id = uklad.current_org()
       AND r.deleted_at IS NULL AND r.archived_at IS NULL
       AND r.warehouse_ref = s.w AND r.domain = s.d
     GROUP BY s.w, s.d`,
    [JSON.stringify(slots)],
  );
  return new Map(rows.map((r) => [`${r.w}\u0000${r.d}`, r.n]));
}

/** Списки, которые не теряют записи в ходе работы: заявка отменяется, а не удаляется. */
const GUARDED = ["requests", "shipments", "receivingEvents", "staffEvents", "disputes"];

/**
 * Уводит ли запись в корзину больше половины живого списка (и не меньше
 * трёх записей). Так выглядит сбой — пустой стор после ошибки, — а не работа
 * человека: из корзины в кабинете не вернуть, поэтому такую запись сервер не
 * принимает, как массовое удаление товаров.
 */
async function massGone(c, items, slots) {
  if (slots.length === 0) return false;
  const { rows } = await c.query(
    `WITH keep AS MATERIALIZED (
       SELECT w, d, ref FROM jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text)),
     slot AS (SELECT w, d FROM jsonb_to_recordset($2::jsonb) AS t(w text, d text))
     SELECT count(*)::int AS live,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM keep k
              WHERE k.w = r.warehouse_ref AND k.d = r.domain AND k.ref = r.ref))::int AS gone
     FROM uklad.cabinet_records r
     JOIN slot s ON s.w = r.warehouse_ref AND s.d = r.domain
     WHERE r.org_id = uklad.current_org() AND r.deleted_at IS NULL AND r.archived_at IS NULL
       AND r.domain = ANY($3::text[])
     GROUP BY r.warehouse_ref, r.domain`,
    [JSON.stringify(items.map(({ w, d, ref }) => ({ w, d, ref }))), JSON.stringify(slots), GUARDED],
  );
  return rows.some(({ live, gone }) => gone >= 3 && gone * 2 > live);
}

/**
 * Список, оставшийся документом (повтор id), вместо разложенного: принять
 * можно, только если в нём есть все живые записи — иначе это тот же способ
 * стереть заявки мимо защиты от массового удаления.
 */
async function inlineDrops(c, inline) {
  for (const { w, d, list } of inline) {
    const { rows } = await c.query(
      `SELECT ref FROM uklad.cabinet_records
       WHERE org_id = uklad.current_org() AND deleted_at IS NULL AND archived_at IS NULL
         AND warehouse_ref = $1 AND domain = $2`,
      [w, d],
    );
    const ids = new Set(list.map((x) => (isObject(x) ? x.id : undefined)));
    if (rows.some((r) => !ids.has(r.ref))) return true;
  }
  return false;
}

/**
 * Уводит ли правка (`remove` — `{ w, d, ref }`) в корзину больше половины
 * живого списка — то же правило, что у записи целиком.
 */
async function massRemoved(c, remove) {
  const by = new Map();
  for (const r of remove) {
    if (!GUARDED.includes(r.d)) continue;
    const k = `${r.w}\u0000${r.d}`;
    by.set(k, { w: r.w, d: r.d, n: (by.get(k)?.n ?? 0) + 1 });
  }
  const heavy = [...by.values()].filter((x) => x.n >= 3);
  if (heavy.length === 0) return false;
  const live = await liveCounts(c, heavy);
  return heavy.some((x) => x.n * 2 > (live.get(`${x.w}\u0000${x.d}`) ?? 0));
}

/**
 * Новое и изменённое — в строки; неизменное не переписывается, корзина и
 * архив — назад. Архивная строка приходит, когда копию на другом устройстве
 * открыли до архивации: иначе её счёт строк не сходился бы с сервером, и
 * каждая её правка уходила бы кабинетом целиком.
 */
async function upsertRecords(c, items) {
  await c.query(
    `INSERT INTO uklad.cabinet_records AS r (org_id, warehouse_ref, domain, ref, position, data)
     SELECT DISTINCT ON (w, d, ref) uklad.current_org(), w, d, ref, pos, data
     FROM jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text, pos integer, data jsonb)
     ORDER BY w, d, ref, pos
     ON CONFLICT (org_id, warehouse_ref, domain, ref) DO UPDATE SET
       position = excluded.position, data = excluded.data, deleted_at = NULL,
       archived_at = NULL, updated_at = now()
     WHERE r.deleted_at IS NOT NULL OR r.archived_at IS NOT NULL
        OR (r.position, r.data) IS DISTINCT FROM (excluded.position, excluded.data)`,
    [JSON.stringify(items)],
  );
}

/** Убранное из списков — в корзину. */
async function removeRecords(c, remove) {
  if (remove.length === 0) return;
  await c.query(
    `UPDATE uklad.cabinet_records r SET deleted_at = now(), updated_at = now()
     FROM jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text)
     WHERE r.org_id = uklad.current_org() AND r.deleted_at IS NULL
       AND r.warehouse_ref = t.w AND r.domain = t.d AND r.ref = t.ref`,
    [JSON.stringify(remove.map(({ w, d, ref }) => ({ w, d, ref })))],
  );
}

/**
 * Строки кабинета → база. Новое добавляется, изменённое переписывается (и
 * только оно), пропавшее из разложенного списка уходит в корзину,
 * вернувшееся — из неё. Архив кабинет не получает — и его не теряет.
 */
async function storeRecords(c, items, slots) {
  await upsertRecords(c, items);
  await c.query(
    `WITH keep AS MATERIALIZED (
       SELECT w, d, ref FROM jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text)),
     slot AS (SELECT w, d FROM jsonb_to_recordset($2::jsonb) AS t(w text, d text))
     UPDATE uklad.cabinet_records r SET deleted_at = now(), updated_at = now()
     FROM slot s
     WHERE r.org_id = uklad.current_org() AND r.deleted_at IS NULL AND r.archived_at IS NULL
       AND s.w = r.warehouse_ref AND s.d = r.domain
       AND NOT EXISTS (SELECT 1 FROM keep k
                       WHERE k.w = r.warehouse_ref AND k.d = r.domain AND k.ref = r.ref)`,
    [JSON.stringify(items.map(({ w, d, ref }) => ({ w, d, ref }))), JSON.stringify(slots)],
  );
}

/**
 * Законченная работа старше `days` дней → в архив. Законченная — значит,
 * склад к ней больше не вернётся: заявка уехала или отменена, поставка
 * закрыта, задание сделано, спорное решено, короб уехал, документ
 * подтверждён. Рейсы и журнал смен — факты, они законченные сразу. Приёмка
 * ждёт, пока закроется её поставка: по ней собирается лист приёмки. Тара и
 * паллеты в архив не уходят — это вещи склада, их используют снова.
 * Возвращает, сколько строк ушло.
 */
async function archiveRecords(c, days = ARCHIVE_DAYS) {
  const { rowCount } = await c.query(
    `UPDATE uklad.cabinet_records r SET archived_at = now()
     WHERE r.org_id = uklad.current_org() AND r.deleted_at IS NULL AND r.archived_at IS NULL
       AND r.updated_at < now() - make_interval(days => $1::int)
       AND CASE r.domain
         WHEN 'requests' THEN r.data->>'status' IN ('shipped', 'cancelled')
         WHEN 'expectedShipments' THEN r.data->>'status' = 'closed'
         WHEN 'tasks' THEN r.data->>'status' IN ('done', 'cancelled')
         WHEN 'disputes' THEN r.data ? 'resolvedAt'
         WHEN 'outboundBoxes' THEN r.data ? 'shippedAt'
         WHEN 'docRecords' THEN r.data->>'status' = 'confirmed'
         WHEN 'shipments' THEN true
         WHEN 'staffEvents' THEN true
         WHEN 'receivingEvents' THEN NOT EXISTS (
           SELECT 1 FROM uklad.cabinet_records s,
             jsonb_array_elements(CASE WHEN jsonb_typeof(s.data->'lines') = 'array'
                                       THEN s.data->'lines' ELSE '[]'::jsonb END) AS l
           WHERE s.org_id = r.org_id AND s.warehouse_ref = r.warehouse_ref
             AND s.domain = 'expectedShipments' AND s.deleted_at IS NULL
             AND s.archived_at IS NULL AND s.data->>'status' IS DISTINCT FROM 'closed'
             AND l->>'id' = r.data->>'expectedShipmentLineId')
         ELSE false
       END`,
    [days],
  );
  return rowCount;
}

/**
 * Пополнить архив, если сегодня этого ещё не делали. Чаще раза в сутки
 * незачем: окно меряется днями, а каждое пополнение заставляет открытые на
 * других устройствах копии один раз записаться целиком.
 */
async function archiveDaily(c, days = ARCHIVE_DAYS) {
  const { rows } = await c.query(
    `UPDATE uklad.cabinet_snapshots SET archive_checked_at = now()
     WHERE org_id = uklad.current_org()
       AND (archive_checked_at IS NULL OR archive_checked_at < now() - interval '1 day')
     RETURNING 1`,
  );
  return rows[0] ? archiveRecords(c, days) : 0;
}

/**
 * Архив — страницей по `ARCHIVE_PAGE` строк: `{ w, d, ref, pos, data }`.
 * `after` — ключ последней строки прошлой страницы (`{ w, d, ref }`).
 * Возвращает строки и ключ для следующей страницы (`null` — всё).
 */
async function loadArchive(c, after = null, limit = ARCHIVE_PAGE) {
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, domain AS d, ref, position AS pos, data
     FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL AND archived_at IS NOT NULL
       AND ($1::text IS NULL OR (warehouse_ref, domain, ref) > ($1, $2, $3))
     ORDER BY warehouse_ref, domain, ref
     LIMIT $4`,
    [after?.w ?? null, after?.d ?? null, after?.ref ?? null, limit + 1],
  );
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return { rows: page, next: more ? { w: last.w, d: last.d, ref: last.ref } : null };
}

module.exports = {
  ARCHIVE_DAYS,
  archiveRecords,
  archiveDaily,
  loadArchive,
  WAREHOUSE_LISTS,
  COMPANY_LISTS,
  splitRecords,
  assembleRecords,
  hasMarks,
  isMark,
  loadRecords,
  storeRecords,
  massGone,
  massRemoved,
  lostLists,
  inlineDrops,
  marksOf,
  liveCounts,
  upsertRecords,
  removeRecords,
  isRef,
};
