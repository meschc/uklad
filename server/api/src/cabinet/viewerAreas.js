/**
 * Что из кабинета открыто смотрящему по разделам прав (миграция 033, Кирилл
 * 14.11: «права должны быть настоящими, а не видом на экране»).
 *
 * Каждый ключ снимка, который смотрящий вообще может получить (`VIEWER_KEYS`),
 * привязан к разделам: ключ уходит, только если открыт хотя бы один из них.
 * Ключ без привязки — ошибка, её ловит тест `viewer.test.js`. Списки, где в
 * одном ключе работа разных разделов (задания, документы, спорное), режутся
 * построчно по виду строки.
 */
/* global module */

const DESK = ["receiving.view", "picking.view", "packing.view", "shipping.view"];

/** Ключ снимка → разделы, любой из которых его открывает. */
const AREA_KEYS = {
  products: ["products.view"],
  categories: ["products.view"],
  categoryFields: ["products.view"],
  fieldValues: ["products.view"],
  labelTemplates: ["products.view"],
  placements: ["stock.view"],
  boxes: ["stock.view"],
  pallets: ["stock.view"],
  boxSeq: ["stock.view"],
  palletSeq: ["stock.view"],
  templates: ["plan.view"],
  layoutTemplates: ["plan.view"],
  addressing: ["plan.view"],
  expectedShipments: ["receiving.view"],
  receivingEvents: ["receiving.view"],
  requests: ["picking.view", "packing.view", "shipping.view"],
  outboundBoxes: ["packing.view", "shipping.view"],
  shipments: ["shipping.view"],
  breakPolicy: ["goods.view"],
  // Построчно — ниже; ключ целиком открыт, если открыт хоть один вид строк.
  tasks: [...DESK, "inventory.view"],
  docRecords: ["receiving.view", "shipping.view"],
  disputes: ["goods.view", "inventory.view"],
};

/** Ключи без раздела: состояние экрана этого устройства, а не данные склада. */
const DEVICE_KEYS = ["activeFloorId"];

/** Вид задания → разделы. Вид не из списка (своя услуга склада) — любая работа стола. */
const TASK_AREAS = {
  cargo_pallet: ["receiving.view"],
  cargo_box: ["receiving.view"],
  item_receiving: ["receiving.view"],
  unloading: ["receiving.view"],
  quality_check: ["receiving.view"],
  marking: ["receiving.view"],
  honest_sign: ["receiving.view"],
  returns: ["receiving.view"],
  photo: ["receiving.view"],
  picking: ["picking.view"],
  kitting: ["picking.view"],
  packing: ["packing.view"],
  repacking: ["packing.view"],
  fbo_box: ["packing.view"],
  palletizing: ["packing.view"],
  ship_parcel: ["shipping.view"],
  ship_box: ["shipping.view"],
  ship_pallet: ["shipping.view"],
  loading: ["shipping.view"],
  inventory: ["inventory.view"],
};

const DOC_AREAS = { receiving: ["receiving.view"], shipment: ["shipping.view"] };

const INVENTORY_DISPUTES = new Set(["inventory_short", "inventory_over"]);

const any = (perms, can) => perms.some((p) => can(p));
const kindOf = (r) => (r && typeof r === "object" ? r.kind : undefined);

/** Построчные правила: строка уходит, если открыт её раздел. */
const ROW_AREAS = {
  tasks: (r) => TASK_AREAS[kindOf(r)] ?? DESK,
  docRecords: (r) => DOC_AREAS[kindOf(r)] ?? [],
  // Расхождение инвентаризации видит и тот, кто смотрит инвентаризацию.
  disputes: (r) =>
    INVENTORY_DISPUTES.has(kindOf(r)) ? ["goods.view", "inventory.view"] : ["goods.view"],
};

/** Закрытый раздел — пустое значение того же вида, а не пропуск ключа. */
const empty = (v) =>
  Array.isArray(v) ? [] : v && typeof v === "object" ? {} : typeof v === "number" ? 0 : null;

/** Оставить в снимке смотрящего только открытое ему. Меняет `out` на месте. */
function applyAreas(out, can) {
  for (const [key, perms] of Object.entries(AREA_KEYS)) {
    if (!(key in out)) continue;
    if (!any(perms, can)) out[key] = empty(out[key]);
    else if (ROW_AREAS[key] && Array.isArray(out[key]))
      out[key] = out[key].filter((r) => any(ROW_AREAS[key](r), can));
  }
  return out;
}

module.exports = { AREA_KEYS, DEVICE_KEYS, TASK_AREAS, applyAreas };
