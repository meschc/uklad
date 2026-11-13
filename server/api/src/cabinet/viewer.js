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

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
};

const person = (m) => (isObject(m) ? pick(m, ["id", "name", "role", "photoUrl", "number"]) : m);

function forViewer(data) {
  const out = pick(isObject(data) ? data : {}, VIEWER_KEYS);
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

module.exports = { forViewer, VIEWER_KEYS, VIEWER_HIDDEN };
