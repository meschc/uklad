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
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { withWarehouses } = require("./warehouses");

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
  "warehouseSettings",
];
/**
 * Списки, куда кабинет добавляет новое в начало. Место в списке у них
 * считается от конца (−1 — последняя запись): новая заявка сверху не
 * сдвигает остальные, и запись переписывает одну строку, а не все. Ошибка
 * здесь стоит лишних перезаписей, а не порядка: порядок верен в любом случае.
 */
const NEWEST_FIRST = new Set(["expectedShipments", "requests", "shipments", "tasks", "disputes"]);
/** Списки всей компании, без склада. */
const COMPANY_LISTS = [
  "staffEvents",
  "payAdjustments",
  "companySettings",
  "placements",
  "addressing",
  "categories",
  "categoryFields",
  "fieldValues",
  "templates",
  "layoutTemplates",
  "labelTemplates",
  "integrations",
  "chats",
];
/**
 * Справочники строками (миграции не нужно, план переноса снимка 21.11):
 * реквизиты, перерывы и номера тары компании, услуги с ценами и устройства
 * склада — не списки, а значения. Чтобы их не держал документ, каждое
 * значение становится записью `{ id: ключ, value }` списка-справочника и
 * дальше живёт строкой, как работа склада. При сборке значения
 * возвращаются на свои ключи: кабинет, права смотрящих и стол видят тот же
 * JSON. Чужой ключ в справочнике не разворачивается.
 */
const VALUES = {
  companySettings: [
    "account",
    "breakPolicy",
    "boxSeq",
    "palletSeq",
    "subscription",
    "activeFloorId",
  ],
  warehouseSettings: ["serviceSettings", "devices", "receiving"],
  // Своим списком, а не в справочнике компании: право «План: запись» пишет
  // адресацию строкой своего ключа (`writeScope.js`).
  addressing: ["addressing"],
};
/**
 * Словари «id → значение», которые лежат строками по записи на ключ:
 * размещения «товар → ячейка» (`placements`, план переноса 21.11). Каждая
 * пара — запись `{ id, value }` своего списка; при сборке — снова словарь.
 */
const MAPS = new Set(["placements", "fieldValues", "integrations", "chats"]);
/**
 * Что из кабинета ещё лежит в самом документе снимка (план «убрать снимок до
 * конца», Кирилл 21.11). Список только сокращается: перенесли ключ в строки
 * или таблицу — убрали отсюда. Новое сохраняемое поле сюда не добавляют —
 * тест `snapshotKeys.test.js` требует для него строки или таблицу.
 */
const SNAPSHOT_LEFT = [];
/** Склад для списков компании. */
const COMPANY = "";
const MARK = "$rows";
const MAX_REF = 200;
/** Сколько дней законченная работа остаётся в кабинете, прежде чем уйти в архив. */
const ARCHIVE_DAYS = 7;
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

/** Значения справочника — одним списком на месте `key` (есть хоть одно). */
function fold(holder, key) {
  if (MAPS.has(key)) {
    const map = holder[key];
    if (isObject(map) && !isMark(map)) {
      holder[key] = Object.entries(map).map(([id, value]) => ({ id, value }));
    }
    return;
  }
  // Список своего же ключа (адресация) уже свёрнут — метка или строки.
  if (VALUES[key]?.includes(key) && (isMark(holder[key]) || Array.isArray(holder[key]))) return;
  const keys = VALUES[key]?.filter((k) => holder[k] !== undefined) ?? [];
  if (keys.length === 0) return;
  const list = keys.map((k) => ({ id: k, value: holder[k] }));
  for (const k of keys) delete holder[k];
  holder[key] = list;
}

/** Справочник-список → значения на своих ключах. Метку не трогаем. */
function unfold(holder, key) {
  const list = holder[key];
  if (MAPS.has(key)) {
    if (!Array.isArray(list)) return;
    holder[key] = Object.fromEntries(
      list.filter((x) => isObject(x) && isRef(x.id)).map((x) => [x.id, x.value]),
    );
    return;
  }
  if (!VALUES[key] || list === undefined || isMark(list)) return;
  delete holder[key];
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (isObject(item) && VALUES[key].includes(item.id)) holder[item.id] = item.value;
  }
}

/**
 * Пройти по всем местам, где лежат списки: корень (активный склад и
 * компания) и `warehouseData` остальных складов. `visit(holder, key, wh)`
 * получает копию объекта, которую можно править.
 */
function eachList(data, visit) {
  const out = { ...data };
  const active = isRef(data.warehouse?.id) ? data.warehouse.id : null;
  const step = (holder, key, wh) => {
    fold(holder, key);
    visit(holder, key, wh);
  };
  if (active) for (const key of WAREHOUSE_LISTS) step(out, key, active);
  for (const key of COMPANY_LISTS) step(out, key, COMPANY);
  if (isObject(data.warehouseData)) {
    out.warehouseData = { ...data.warehouseData };
    for (const [wh, work] of Object.entries(data.warehouseData)) {
      // Стопка активного склада рядом с ним самим — его строки уже взяты
      // из корня. Такую оставляем документом, иначе два списка слились бы.
      if (!isObject(work) || !isRef(wh) || wh === active) continue;
      const copy = { ...work };
      out.warehouseData[wh] = copy;
      for (const key of WAREHOUSE_LISTS) step(copy, key, wh);
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

/**
 * Документ с метками и строки базы → кабинет целиком. `only` — собрать
 * только эти списки, остальные метки оставить как есть.
 */
function assembleRecords(doc, rows, only = null) {
  const lists = new Map();
  for (const r of rows) {
    const k = `${r.w}\u0000${r.d}`;
    if (!lists.has(k)) lists.set(k, []);
    lists.get(k).push(r.data);
  }
  return eachList(doc, (holder, key, wh) => {
    if (isMark(holder[key]) && (!only || only.includes(key))) {
      holder[key] = lists.get(`${wh}\u0000${key}`) ?? [];
    }
    unfold(holder, key);
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
 * Оглавление из базы (миграция 056) → метки в документе: «список лежит
 * строками, в нём n записей». Метки в документе больше не хранятся — их
 * снимает триггер при записи. Ставится только туда, где ключа нет: свой
 * список в документе (повтор id) и метки присланного кабинета главнее.
 */
async function withSlots(c, doc) {
  if (!isObject(doc)) return doc;
  const { rows } = await c.query(
    `SELECT place, domain, n FROM uklad.cabinet_slots WHERE org_id = uklad.current_org()`,
  );
  if (rows.length === 0) return doc;
  const out = { ...doc };
  if (isObject(doc.warehouseData)) out.warehouseData = { ...doc.warehouseData };
  for (const { place, domain, n } of rows) {
    if (place === "") {
      if (!(domain in out)) out[domain] = { [MARK]: n };
      continue;
    }
    const work = out.warehouseData?.[place];
    if (!isObject(work) || domain in work) continue;
    out.warehouseData[place] = { ...work, [domain]: { [MARK]: n } };
  }
  return out;
}

/** Документ снимка из базы: склады и оглавление на месте, работа — метками. */
async function storedDoc(c, doc) {
  return withWarehouses(c, await withSlots(c, doc));
}

/**
 * Документ из базы → кабинет целиком: списки со строк. `domains` — собрать
 * только эти списки (журналу движений нужна одна тара), остальные метки
 * станут пустыми списками.
 */
async function loadRecords(c, doc, domains = null) {
  // Склады — строками (миграция 051): без них не понять, чьи списки в корне.
  doc = await storedDoc(c, doc);
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, domain AS d, data FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL AND archived_at IS NULL
       AND ($1::text[] IS NULL OR domain = ANY($1::text[]))
     ORDER BY warehouse_ref, domain, position`,
    [domains],
  );
  return assembleRecords(doc, rows);
}

/**
 * Документ из базы с одними справочниками: склады, реквизиты, устройства,
 * цены — на своих ключах, метки работы склада остаются метками. Для тех, кто
 * читает документ компании, не собирая работу (стол ищет своё устройство).
 */
async function withSettings(c, doc) {
  doc = await storedDoc(c, doc);
  if (!isObject(doc)) return doc;
  const domains = Object.keys(VALUES);
  const { rows } = await c.query(
    `SELECT warehouse_ref AS w, domain AS d, data FROM uklad.cabinet_records
     WHERE org_id = uklad.current_org() AND deleted_at IS NULL AND archived_at IS NULL
       AND domain = ANY($1::text[])
     ORDER BY warehouse_ref, domain, position`,
    [domains],
  );
  return assembleRecords(doc, rows, domains);
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
 * Есть ли среди присланных строк архивная, но с другим содержимым. История
 * не переписывается: архивная отметка смены — это часы и деньги, решённое
 * спорное не открывается снова. Такую запись сервер не принимает (409), а
 * копия забирает свежие данные.
 */
async function archivedChanged(c, items) {
  if (items.length === 0) return false;
  const { rows } = await c.query(
    `SELECT 1 FROM uklad.cabinet_records r
     JOIN jsonb_to_recordset($1::jsonb) AS t(w text, d text, ref text, data jsonb)
       ON r.warehouse_ref = t.w AND r.domain = t.d AND r.ref = t.ref
     WHERE r.org_id = uklad.current_org() AND r.deleted_at IS NULL
       AND r.archived_at IS NOT NULL AND r.data IS DISTINCT FROM t.data
     LIMIT 1`,
    [JSON.stringify(items.map(({ w, d, ref, data }) => ({ w, d, ref, data })))],
  );
  return rows.length > 0;
}

/**
 * Новое и изменённое — в строки; неизменное не переписывается, корзина —
 * назад. Архивная строка возвращается из архива, только если пришла такой
 * же, как лежит (копию на другом устройстве открыли до архивации: иначе её
 * счёт строк не сходился бы с сервером, и каждая правка уходила бы целиком).
 * Изменённая архивная строка не трогается вовсе — её отсекает
 * `archivedChanged` до записи, а здесь страховка.
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
     WHERE (r.archived_at IS NULL AND (r.deleted_at IS NOT NULL
             OR (r.position, r.data) IS DISTINCT FROM (excluded.position, excluded.data)))
        OR (r.archived_at IS NOT NULL AND r.data IS NOT DISTINCT FROM excluded.data)`,
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
 * Строки «до» и «после» одной правки → только разница: новые и изменённые
 * (`upsert`) и пропавшие (`remove`). Стол меняет одну-две записи, а кабинет
 * держит тысячи: писать все строки на каждый скан — главная цена операции
 * (прогон `bench/desk-load.mjs`). Неизменная запись — тот же объект, что
 * пришёл из базы, поэтому сначала сравнивается ссылка, текст — только у
 * пересобранных. Строки «до» — ровно то, что лежит в базе живым и не в
 * архиве (`loadRecords`), так что разница равна тому, что сделал бы
 * `storeRecords` целиком.
 */
function recordChanges(before, after) {
  const key = (r) => `${r.w}\u0000${r.d}\u0000${r.ref}`;
  const prev = new Map(before.map((r) => [key(r), r]));
  const upsert = [];
  for (const r of after) {
    const k = key(r);
    const was = prev.get(k);
    prev.delete(k);
    if (
      !was ||
      was.pos !== r.pos ||
      (was.data !== r.data && JSON.stringify(was.data) !== JSON.stringify(r.data))
    ) {
      upsert.push(r);
    }
  }
  return { upsert, remove: [...prev.values()] };
}

/** Записать только разницу между строками «до» и «после» (`recordChanges`). */
async function storeChanges(c, before, after) {
  const { upsert, remove } = recordChanges(before, after);
  if (upsert.length > 0) await upsertRecords(c, upsert);
  await removeRecords(c, remove);
  return { upserted: upsert.length, removed: remove.length };
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
  archivedChanged,
  archiveRecords,
  archiveDaily,
  loadArchive,
  WAREHOUSE_LISTS,
  COMPANY_LISTS,
  VALUES,
  MAPS,
  SNAPSHOT_LEFT,
  splitRecords,
  assembleRecords,
  hasMarks,
  isMark,
  loadRecords,
  withSettings,
  storedDoc,
  storeRecords,
  recordChanges,
  storeChanges,
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
