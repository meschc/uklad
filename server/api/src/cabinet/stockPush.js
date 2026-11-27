/**
 * Выгрузка остатков на площадку (шаг 13 `docs/domain/fbs.md`).
 *
 * Остаток на площадке больше реального — площадка продаёт то, чего нет,
 * заказ отменяют, продавцу штраф. Поэтому считаем осторожно, только то, что
 * точно лежит на складе подключения:
 *
 *   на складе = строки коробов и тары (`boxes`) + открытые короба отгрузки
 *               + снятое в заявку без тары, пока заявка не уехала;
 *   свободно  = на складе − карантин тары (брак и излишек до решения старшего)
 *               − штуки открытых заявок (не уехали, не отменены).
 *
 * Это те же суммы, что книга остатков кабинета (`lib/store/__tests__/ledger.ts`),
 * без размещений «товар в ячейке» (`placements`): количество там не записано.
 * Такой товар не шлём вовсе — ни «одну штуку» (может быть больше или ноль),
 * ни ноль (снимет с продажи то, что лежит на полке).
 *
 * Свободный остаток — то, что ждёт площадка: Ozon «количество в наличии без
 * учёта зарезервированных» (`/v2/products/stocks`).
 *
 * Шлём только изменившееся с прошлой выгрузки (её числа — в `pull_result`
 * подключения) и всё заново раз в день. Ozon обновляет пару «товар — склад»
 * не чаще раза в 30 с; проход раз в 1,5 мин.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
/* global module, require */

const { freeInBox } = require("./overageHold");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const qtyOf = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Свободный остаток по товару (id → штук) на складе `view`. Чистое правило. */
function freeStock(view) {
  const unknown = new Set(isObject(view.placements) ? Object.keys(view.placements) : []);
  const have = new Map();
  const add = (id, n) => {
    if (typeof id === "string" && n) have.set(id, (have.get(id) ?? 0) + n);
  };
  // Карантин (`heldQty`): излишек с приёмки и брак до решения старшего
  // лежат в таре, но сборка их не возьмёт — площадке их не обещаем.
  const disputes = list(view.disputes);
  for (const b of list(view.boxes)) {
    if (!isObject(b)) continue;
    const box = { id: b.id, lines: list(b.lines).filter(isObject) };
    for (const id of new Set(box.lines.map((l) => l.productId))) {
      add(id, freeInBox(disputes, box, id));
    }
  }
  for (const b of list(view.outboundBoxes)) {
    if (!isObject(b) || b.shipmentId) continue;
    for (const l of list(b.lines)) add(l?.productId, qtyOf(l?.qty));
  }
  // Заказ отменили после упаковки (`orderCancel.js`): посылка запечатана и
  // лежит у старшего, в ячейках товара нет — резерв держим, пока посылка
  // в отгрузке. Иначе площадка продаст эти штуки снова.
  const sealed = new Set();
  for (const b of list(view.outboundBoxes)) {
    if (isObject(b) && !b.shipmentId) for (const id of list(b.requestIds)) sealed.add(id);
  }
  const reserved = new Map();
  for (const r of list(view.requests)) {
    if (!isObject(r) || r.status === "shipped") continue;
    if (r.status === "cancelled" && !(r.packedAt && sealed.has(r.id))) continue;
    // Снятое в заявку без тары лежит «у заявки», пока она не уехала.
    if (!r.toteId) add(r.productId, qtyOf(r.pickedQty));
    reserved.set(r.productId, (reserved.get(r.productId) ?? 0) + qtyOf(r.qty));
  }
  const out = new Map();
  for (const [id, n] of have) out.set(id, Math.max(0, n - (reserved.get(id) ?? 0)));
  // Количество в ячейке неизвестно — `undefined`, `stockBySku` такой не шлёт.
  for (const id of unknown) out.set(id, undefined);
  return out;
}

/**
 * Что отправить: `{ артикул: штук }` по товарам подключения с артикулом.
 * Товар без остатка — 0: площадка должна перестать его продавать. Один
 * артикул у двух товаров — не шлём ни один (не знаем, чей остаток); товар с
 * неизвестным количеством (`undefined` из `freeStock`) — тоже.
 */
function stockBySku(products, free) {
  const by = new Map();
  const twice = new Set();
  for (const p of list(products)) {
    const sku = typeof p?.sku === "string" ? p.sku.trim() : "";
    if (!sku || sku.length > 255) continue;
    if (by.has(sku)) twice.add(sku);
    by.set(sku, free.has(p.id) ? free.get(p.id) : 0);
  }
  for (const s of twice) by.delete(s);
  for (const [s, n] of by) if (n === undefined) by.delete(s);
  return Object.fromEntries(by);
}

/** Изменившееся с прошлой выгрузки `prev` (тот же день) или всё (новый день). */
function changed(now, prev, day) {
  const same = isObject(prev) && prev.day === day && isObject(prev.sent);
  return Object.fromEntries(
    Object.entries(now).filter(([sku, n]) => !same || prev.sent[sku] !== n),
  );
}

/** Запросы выгрузки Ozon: по 100 пар «товар — склад» за запрос. */
function ozonStockRequests(items, warehouseId) {
  const rows = Object.entries(items).map(([offer_id, stock]) => ({
    offer_id,
    stock,
    warehouse_id: warehouseId,
  }));
  const out = [];
  for (let i = 0; i < rows.length; i += 100) {
    out.push({
      method: "POST",
      path: "/v2/products/stocks",
      body: { stocks: rows.slice(i, i + 100) },
    });
  }
  return out;
}

/** Склады FBS магазина Ozon из `/v2/warehouse/list` (без rFBS). */
function ozonWarehouses(data) {
  return list(data?.warehouses ?? data?.result?.warehouses)
    .filter(
      (w) =>
        isObject(w) &&
        Number.isSafeInteger(w.warehouse_id) &&
        !w.is_rfbs &&
        w.status !== "disabled",
    )
    .map((w) => ({ id: w.warehouse_id, name: String(w.name ?? "").slice(0, 100) }));
}

/** Ответ Ozon по строкам: артикулы, которые Ozon не принял, и его причина. */
function ozonRejected(data) {
  const bad = list(data?.result).filter((r) => isObject(r) && r.updated === false);
  const why = bad.map((r) => list(r.errors)[0]?.code ?? list(r.errors)[0]?.message).find(Boolean);
  return { skus: bad.map((r) => String(r.offer_id ?? "")), detail: why ? String(why) : "" };
}

// --- Маркет -------------------------------------------------------------------
//
// Кабинет Маркета бывает с группами складов и без. С группами остаток шлют
// по кампании (`PUT /v2/campaigns/{id}/offers/stocks`, склад не указывают —
// группа обновится сама), без групп — по складу бизнеса
// (`POST /v3/businesses/{id}/offers/stocks/update`, `partnerWarehouseId`).
// Справка Маркета, 21.11: updateStocks, updateStocksOnPartnerWarehouses,
// getPagedWarehouses, getPartnerWarehouses.

/** Не больше 2000 строк за запрос (справка); берём с запасом. */
const YM_CHUNK = 500;

/** Бизнес кампании из `GET /v2/campaigns/{id}`: `campaign.business.id`. */
function ymBusinessId(data) {
  const id = data?.campaign?.business?.id;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Склады кампании в группах (`POST /v2/businesses/{id}/warehouses`): есть ли группа. */
function ymGrouped(data) {
  return list(data?.result?.warehouses).some((w) => isObject(w) && isObject(w.groupInfo));
}

/** Склады бизнеса без групп (`POST /v3/businesses/{id}/warehouses`) этой кампании. */
function ymWarehouses(data, campaignId) {
  return list(data?.result?.warehouses)
    .filter(
      (w) =>
        isObject(w) &&
        Number.isSafeInteger(w.id) &&
        list(w.models).some((m) => String(m?.campaignId) === String(campaignId)),
    )
    .map((w) => ({ id: w.id, name: String(w.name ?? "").slice(0, 100) }));
}

/** Запросы выгрузки Маркета: `mode` — "group" (v2, по кампании) или "warehouse" (v3). */
function ymStockRequests(items, mode, { businessId, warehouseId }) {
  const rows = Object.entries(items);
  const out = [];
  for (let i = 0; i < rows.length; i += YM_CHUNK) {
    const part = rows.slice(i, i + YM_CHUNK);
    out.push(
      mode === "group"
        ? {
            method: "PUT",
            path: "/v2/campaigns/{campaignId}/offers/stocks",
            body: { skus: part.map(([sku, count]) => ({ sku, items: [{ count }] })) },
            skus: part.map(([sku]) => sku),
          }
        : {
            method: "POST",
            path: `/v3/businesses/${businessId}/offers/stocks/update`,
            body: {
              skuItems: part.map(([sku, count]) => ({
                sku,
                partnerWarehouseId: warehouseId,
                count,
              })),
            },
            skus: part.map(([sku]) => sku),
          },
    );
  }
  return out;
}

module.exports = {
  ymBusinessId,
  ymGrouped,
  ymWarehouses,
  ymStockRequests,
  freeStock,
  stockBySku,
  changed,
  ozonStockRequests,
  ozonWarehouses,
  ozonRejected,
};
