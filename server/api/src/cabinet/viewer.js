/**
 * Кабинет глазами смотрящего (роль с «Остатками», но без «Персонала»):
 * кладовщик, приёмщик и т.п. входят по почте только посмотреть.
 *
 * Разрешённый список, а не запретный: новое поле кабинета смотрящему
 * закрыто, пока его сюда не впишут (тест `viewer.test.js` сверяет список с
 * сохраняемыми ключами браузера). Закрыто намеренно: реквизиты и владелец
 * (`account`), тариф и копии (`subscription`), цены услуг, ставка хранения,
 * контакты продавцов и руководителя, ставки и телефоны персонала, журнал
 * смен (часы и простои коллег), переписка, подключения, другие склады и
 * служебное состояние устройства руководителя.
 */
/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Ключи снимка, которые смотрящий получает как есть. */
const VIEWER_KEYS = [
  "activeFloorId",
  "products",
  "placements",
  "categories",
  "categoryFields",
  "fieldValues",
  "templates",
  "layoutTemplates",
  "addressing",
  "labelTemplates",
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "boxSeq",
  "palletSeq",
  "requests",
  "shipments",
  "outboundBoxes",
  "tasks",
  "disputes",
  "docRecords",
  "breakPolicy",
];

/** Ключи, закрытые смотрящему осознанно (см. шапку). */
const VIEWER_HIDDEN = [
  "account",
  "subscription",
  "serviceSettings",
  "staffEvents",
  "chats",
  "integrations",
  "otherWarehouses",
  "warehouseData",
  "profile",
  "session",
  "stationSession",
  "packSession",
  "devices",
  "thisDeviceId",
  "seenHints",
  "receiving",
];

const WAREHOUSE_KEYS = [
  "id",
  "ownCatalog",
  "name",
  "kind",
  "address",
  "lat",
  "lng",
  "phone",
  "email",
  "contactPerson",
  "spec",
  "showOnMarket",
  "floors",
  "placeholder",
];

/**
 * Работа склада по разделам (миграция 033): ключ снимка уходит смотрящему,
 * только если ему открыт хотя бы один из разделов. Товары, остатки и план —
 * справочник для любой работы (сборщику нужны название товара и адрес
 * ячейки), поэтому их ключей здесь нет: они уходят всем, кто вообще смотрит.
 * Закрыт раздел — его экран кабинет прячет (`navItems.ts`).
 */
const AREA_KEYS = {
  expectedShipments: ["receiving.view"],
  receivingEvents: ["receiving.view"],
  requests: ["picking.view", "packing.view", "shipping.view"],
  outboundBoxes: ["packing.view", "shipping.view"],
  shipments: ["shipping.view"],
  disputes: ["goods.view"],
  breakPolicy: ["goods.view"],
};

/** Права «смотреть», любое из которых открывает кабинет на просмотр. */
const VIEW_PERMS = [
  "products.view",
  "stock.view",
  "plan.view",
  "receiving.view",
  "picking.view",
  "packing.view",
  "shipping.view",
  "inventory.view",
  "goods.view",
  "staff.view",
];

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
};

const person = (m) => (isObject(m) ? pick(m, ["id", "name", "role", "photoUrl"]) : m);

/** Закрытый раздел — пустое значение того же вида, а не пропуск ключа. */
const empty = (v) => (Array.isArray(v) ? [] : isObject(v) ? {} : null);

/**
 * Снимок смотрящему. `can` — право роли; без него (старые вызовы и тесты) —
 * все разделы открыты.
 */
function forViewer(data, can = () => true) {
  const out = pick(isObject(data) ? data : {}, VIEWER_KEYS);
  for (const [key, perms] of Object.entries(AREA_KEYS))
    if (key in out && !perms.some((p) => can(p))) out[key] = empty(out[key]);
  // Пустые значения вместо закрытого: браузер не подставит чужое из демо.
  Object.assign(out, {
    chats: {},
    integrations: {},
    otherWarehouses: [],
    warehouseData: {},
    staffEvents: [],
    serviceSettings: {
      enabled: {},
      prices: {},
      ...(data?.serviceSettings?.twoStageReceiving ? { twoStageReceiving: true } : {}),
    },
  });
  const a = isObject(data?.account) ? data.account : {};
  out.account = { type: "company", name: "", ...pick(a, ["org", "orgLogo"]) };
  if (isObject(data?.warehouse)) {
    const w = data.warehouse;
    out.warehouse = {
      ...pick(w, WAREHOUSE_KEYS),
      staff: list(w.staff).map(person),
      partners: list(w.partners).map((p) => (isObject(p) ? pick(p, ["id", "name"]) : p)),
      ...(isObject(w.manager) ? { manager: person(w.manager) } : {}),
    };
  }
  return out;
}

module.exports = { forViewer, VIEWER_KEYS, VIEWER_HIDDEN, AREA_KEYS, VIEW_PERMS };
