/**
 * Кабинет глазами продавца (миграция 039): человек склада, закреплённый за
 * партнёром (`members.partner_ref`). Видит только свой товар и работу по нему.
 *
 * Как и `viewer.js`, это разрешённый список, а не запретный: новое поле
 * кабинета продавцу закрыто, пока его сюда не впишут. И ещё строже: каждая
 * запись, где может лежать чужой товар, режется по строкам. Тара с товаром
 * двух продавцов приходит только со своими строками, рейс — только со своими
 * заявками. Чего у записи нет своего, той записи у продавца нет вовсе.
 *
 * Закрыто совсем: персонал и журнал смен, задания склада с исполнителями,
 * спорное (кроме лишнего с приёмки по своему товару — `ownOverage`),
 * документы склада, переписка, подключения, реквизиты, тариф, другие
 * склады и остальные продавцы. Цены услуг открыты: это цены продавцу.
 */
/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) if (isObject(obj) && k in obj) out[k] = obj[k];
  return out;
};

/** Ключи, которые продавцу не о чем резать: справочники склада без товара. */
const SELLER_KEYS = [
  "activeFloorId",
  "categories",
  "categoryFields",
  "addressing",
  "labelTemplates",
  "breakPolicy",
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
  "floors",
];

/** Строки записи (`lines`) только со своим товаром. */
const ownLines = (lines, mine) => list(lines).filter((l) => isObject(l) && mine.has(l.productId));

/** Запись со своими строками; без своих строк — `null`. */
function withOwnLines(x, mine, strip = []) {
  if (!isObject(x)) return null;
  const lines = ownLines(x.lines, mine);
  if (lines.length === 0) return null;
  const out = { ...x, lines };
  for (const k of strip) delete out[k];
  return out;
}

const present = (x) => x !== null;
const without = (x, keys) => {
  const out = { ...x };
  for (const k of keys) delete out[k];
  return out;
};

/** Тара, паллеты и короба отгрузки — только со своим товаром. */
function ownUnits(d, mine, requestIds) {
  // Кто тару принимал и пересчитывал — не продавцу.
  const boxes = list(d.boxes)
    .map((b) => withOwnLines(b, mine, ["countedBy"]))
    .filter(present);
  const boxIds = new Set(boxes.map((b) => b.id));
  const pallets = list(d.pallets)
    .filter(isObject)
    .map((p) => ({ ...p, boxIds: list(p.boxIds).filter((id) => boxIds.has(id)) }))
    .filter((p) => p.boxIds.length > 0);
  const outboundBoxes = list(d.outboundBoxes)
    .map((b) => withOwnLines(b, mine, ["packedBy"]))
    .filter(present)
    .map((b) => ({ ...b, requestIds: list(b.requestIds).filter((id) => requestIds.has(id)) }));
  return { boxes, pallets, outboundBoxes };
}

/**
 * Из спорного продавцу — только лишнее с приёмки по его товару (Кирилл 17.11):
 * в акте поставки он видит, что излишек ждёт решения склада, оставлен или
 * убран. Кто нашёл и кто решил, тара и заметки старшего — не продавцу.
 */
const OVERAGE_KEYS = [
  "id",
  "kind",
  "productId",
  "qty",
  "lineId",
  "raisedAt",
  "resolution",
  "resolvedAt",
];
const ownOverage = (disputes, mine) =>
  list(disputes)
    .filter((x) => isObject(x) && x.kind === "receive_overage" && mine.has(x.productId))
    // «Кто» у записи обязателен (`isDispute` в браузере): за склад — «склад».
    .map((x) => ({
      ...pick(x, OVERAGE_KEYS),
      raisedBy: "warehouse",
      ...(x.resolution ? { resolvedBy: "warehouse" } : {}),
    }));

/**
 * Снимок склада (уже собранный на складе продавца, `focusWarehouse`) →
 * то, что видит продавец `partnerRef`.
 */
function forSeller(data, partnerRef) {
  const d = isObject(data) ? data : {};
  const out = pick(d, SELLER_KEYS);
  const products = list(d.products).filter((p) => isObject(p) && p.partnerId === partnerRef);
  const mine = new Set(products.map((p) => p.id));
  out.products = products;

  const placements = isObject(d.placements) ? d.placements : {};
  out.placements = Object.fromEntries(Object.entries(placements).filter(([id]) => mine.has(id)));
  const values = isObject(d.fieldValues) ? d.fieldValues : {};
  out.fieldValues = Object.fromEntries(
    Object.entries(values).filter(([key]) => mine.has(key.split(":")[0])),
  );

  out.expectedShipments = list(d.expectedShipments)
    .map((s) => withOwnLines(s, mine))
    .filter(present);
  out.receivingEvents = list(d.receivingEvents)
    .filter((e) => isObject(e) && mine.has(e.productId))
    .map((e) => without(e, ["staffId"]));

  // Заявки — свои; кто упаковал — не продавцу. Рейс — только со своими заявками.
  out.requests = list(d.requests)
    .filter((r) => isObject(r) && mine.has(r.productId))
    .map((r) => without(r, ["packedBy"]));
  const requestIds = new Set(out.requests.map((r) => r.id));
  out.shipments = list(d.shipments)
    .filter(isObject)
    .map((s) => ({
      ...without(s, ["staffId", "units"]),
      requestIds: list(s.requestIds).filter((id) => requestIds.has(id)),
    }))
    .filter((s) => s.requestIds.length > 0);
  Object.assign(out, ownUnits(d, mine, requestIds));

  // Пустые значения вместо закрытого: браузер не подставит чужое из демо.
  const s = isObject(d.serviceSettings) ? d.serviceSettings : {};
  Object.assign(out, {
    tasks: [],
    disputes: ownOverage(d.disputes, mine),
    docRecords: [],
    staffEvents: [],
    chats: {},
    integrations: {},
    otherWarehouses: [],
    warehouseData: {},
    serviceSettings: {
      enabled: isObject(s.enabled) ? s.enabled : {},
      prices: isObject(s.prices) ? s.prices : {},
      ...pick(s, ["custom"]),
    },
  });
  const a = isObject(d.account) ? d.account : {};
  out.account = { type: "company", name: "", ...pick(a, ["org", "orgLogo"]) };
  if (isObject(d.warehouse)) {
    const w = d.warehouse;
    out.warehouse = {
      ...pick(w, WAREHOUSE_KEYS),
      staff: [],
      partners: list(w.partners)
        .filter((p) => isObject(p) && p.id === partnerRef)
        .map((p) => pick(p, ["id", "name"])),
    };
  }
  return out;
}

module.exports = { forSeller, SELLER_KEYS };
