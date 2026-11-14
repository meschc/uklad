/**
 * Кабинет смотрящего — на ЕГО складе, а не на том, что открыт у руководителя.
 *
 * В снимке компании «активный» склад один на всех (`warehouse`, его работа —
 * в корне), остальные — в `otherWarehouses`, их работа — в
 * `warehouseData[id]`. Руководитель переключает склад — снимок меняется. Без
 * этого модуля приглашённый на «Складскую 5» видел «Логопарк Шереметьево»,
 * стоило начальнику его открыть (Кирилл 14.11, миграция 034).
 *
 * `focusWarehouse` делает с копией снимка то же, что кабинет при открытии
 * склада (`openWarehouse`, `store/warehouseData.ts`): нужный склад — в
 * `warehouse`, его работа — в корень, прочие склады и их работа смотрящему
 * не отдаются вовсе. Нет склада в компании — `null`: сервер отвечает отказом,
 * а не подставляет первый попавшийся.
 */
/* global module */

/** Работа склада, у каждого своя. Тот же список, что `WAREHOUSE_DOMAINS` в кабинете. */
const WAREHOUSE_DOMAINS = [
  "expectedShipments",
  "receivingEvents",
  "boxes",
  "pallets",
  "receiving",
  "requests",
  "shipments",
  "tasks",
  "disputes",
  "serviceSettings",
  "devices",
  "docRecords",
  "outboundBoxes",
];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Все настоящие склады компании (без места под первый склад). */
function warehousesOf(data) {
  const all = [data?.warehouse, ...list(data?.otherWarehouses)];
  return all.filter((w) => isObject(w) && typeof w.id === "string" && w.placeholder !== true);
}

/** Склад и (если назван) карточка сотрудника в нём. `null` — такого нет. */
function findPlace(data, warehouseRef, staffRef) {
  const wh = warehousesOf(data).find((w) => w.id === warehouseRef);
  if (!wh) return null;
  if (staffRef == null) return { warehouse: wh, staff: null };
  const staff = list(wh.staff).find((m) => isObject(m) && m.id === staffRef);
  return staff ? { warehouse: wh, staff } : null;
}

/**
 * Склад человека: назначенный, а если не назначен и склад в компании один —
 * он. Иначе `null`.
 */
function placeRef(data, warehouseRef) {
  if (warehouseRef) return warehouseRef;
  const all = warehousesOf(data);
  return all.length === 1 ? all[0].id : null;
}

/** Пустая работа склада, у которого своей ещё нет. */
const EMPTY = { serviceSettings: () => ({ enabled: {}, prices: {} }) };

/** Снимок, где склад `ref` — активный, а других складов нет. `null` — склада нет. */
function focusWarehouse(data, ref) {
  if (!isObject(data) || !ref) return null;
  const wh = warehousesOf(data).find((w) => w.id === ref);
  if (!wh) return null;
  const out = { ...data, otherWarehouses: [], warehouseData: {} };
  if (isObject(data.warehouse) && data.warehouse.id === ref) return out;
  const saved = isObject(data.warehouseData) ? data.warehouseData[ref] : undefined;
  for (const key of WAREHOUSE_DOMAINS) {
    // Своей работы у склада ещё нет — пусто, а не работа чужого склада.
    if (isObject(saved) && key in saved) out[key] = saved[key];
    else if (EMPTY[key]) out[key] = EMPTY[key]();
    else if (key === "receiving") delete out[key];
    else out[key] = [];
  }
  out.warehouse = wh;
  out.activeFloorId = list(wh.floors)[0]?.id ?? "";
  return out;
}

module.exports = { WAREHOUSE_DOMAINS, warehousesOf, findPlace, placeRef, focusWarehouse };
