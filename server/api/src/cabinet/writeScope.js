/**
 * Запись кабинета по правам роли, а не «всё или ничего».
 *
 * Кто держит «Персонал» (`staff.manage`), видит кабинет целиком и пишет его
 * целиком, как раньше. Остальные члены команды получают кабинет на просмотр
 * (`viewer.js`) и пишут только то, на что у роли есть право: товары — с
 * `products.edit`, план — с `plan.edit`, приёмку — с `receiving.do` и т.д.
 *
 * Разрешённый список, а не запретный: поле, которого здесь нет, такой
 * человек не меняет вовсе. Закрытое смотрящему (`VIEWER_HIDDEN`: реквизиты,
 * цены, ставки, журнал смен) он не получает, значит и записать не может —
 * сервер берёт эти поля из того, что уже лежит в базе. Иначе урезанная
 * копия в браузере затёрла бы цены и ставки пустыми.
 *
 * Строки работы склада (`cabinet_records`) проверяются по списку: строка
 * чужого модуля — отказ всей записи, а не тихий пропуск, чтобы копия в
 * браузере не разошлась с базой.
 */
/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const RECEIVE = ["receiving.do"];
const ORDERS = ["picking.do", "packing.do", "shipping.do"];
const CELLS = [
  "stock.move",
  "receiving.do",
  "picking.do",
  "packing.do",
  "shipping.do",
  "inventory.count",
];

/**
 * Поле кабинета → права, любое из которых даёт его менять. Списки работы
 * склада лежат строками, но называются так же, поэтому одна таблица на оба
 * пути: поле документа и строку.
 */
const KEY_PERMS = {
  products: ["products.edit"],
  categories: ["products.edit"],
  categoryFields: ["products.edit"],
  fieldValues: ["products.edit"],
  labelTemplates: ["products.edit"],
  templates: ["plan.edit"],
  layoutTemplates: ["plan.edit"],
  addressing: ["plan.edit"],
  placements: CELLS,
  expectedShipments: RECEIVE,
  receivingEvents: RECEIVE,
  boxes: ["receiving.do", "packing.do", "stock.move"],
  pallets: ["receiving.do", "shipping.do", "stock.move"],
  boxSeq: ["receiving.do", "packing.do", "stock.move"],
  palletSeq: ["receiving.do", "shipping.do", "stock.move"],
  requests: ORDERS,
  shipments: ["shipping.do"],
  outboundBoxes: ["packing.do", "shipping.do"],
  tasks: [...ORDERS, "receiving.do", "stock.move", "inventory.count"],
  disputes: ["receiving.do", "packing.do", "goods.decide", "inventory.count"],
  docRecords: ["receiving.do", "shipping.do", "goods.decide"],
};

/** Поля склада, которые меняет план (`plan.edit`); остальное — у «Персонала». */
const WAREHOUSE_PLAN = ["floors"];

const allowed = (key, can) => (KEY_PERMS[key] ?? []).some((p) => can(p));

/** Какие поля кабинета этот человек вправе менять. Пусто — только просмотр. */
function writableKeys(can) {
  const keys = Object.keys(KEY_PERMS).filter((k) => allowed(k, can));
  if (can("plan.edit")) keys.push("warehouse");
  return keys;
}

/** Есть строка, которую роль менять не вправе: запись не принимаем целиком. */
function foreignRows(rows, can) {
  return (Array.isArray(rows) ? rows : []).some((r) => !isObject(r) || !allowed(r.d, can));
}

/**
 * Документ, который ляжет в базу: разрешённые поля — из присланного,
 * остальные — из того, что уже лежит. Метки строк (`{"$rows": n}`) идут из
 * присланного: их сверяет со строками сама запись. Товары лежат своей
 * таблицей и пишутся отдельно.
 */
function mergeScoped(cur, next, can) {
  const base = isObject(cur) ? cur : {};
  const sent = isObject(next) ? next : {};
  const out = { ...base };
  for (const key of Object.keys(KEY_PERMS)) {
    if (key === "products" || !allowed(key, can)) continue;
    if (key in sent) out[key] = sent[key];
    else delete out[key];
  }
  if (can("plan.edit") && isObject(base.warehouse) && isObject(sent.warehouse)) {
    const w = { ...base.warehouse };
    for (const f of WAREHOUSE_PLAN) if (f in sent.warehouse) w[f] = sent.warehouse[f];
    out.warehouse = w;
  }
  return out;
}

module.exports = { KEY_PERMS, writableKeys, foreignRows, mergeScoped };
