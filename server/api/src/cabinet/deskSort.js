/**
 * Сортировка операциями (миграции 027 и 031, `deskOps.js`).
 *
 * `sort_place` — посылка (этикетка заказа или короб поставки) легла в место
 * сортировки `UK-SORT-…`: одна отгрузка в одно направление. `sort_close` —
 * отгрузку закрыли: заведены грузовые места `UK-OUT-…` (паллеты, коробки).
 * Сервер сам повторяет правила стола (`src/lib/sorting.ts`): посылка открыта и
 * ещё ни в каком месте, у неё одно направление, место этого направления и
 * его отгрузка не закрыта. Товар не двигается — меняется только место
 * посылки, а у грузовых мест товара нет вовсе.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const code = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();
const PARCEL_RE = /^UK-(OUT|LBL|ORD)-[A-Z0-9-]{1,60}$/;
const SORT_RE = /^UK-SORT-([A-Z0-9]{6})-(\d{1,5})$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const MAX_PLACES = 200;

/** Хеш направления — как `targetCode` в `src/lib/packing.ts`. */
function destKey(destination) {
  let h = 5381;
  for (const ch of destination.trim().toLowerCase())
    h = (Math.imul(h, 33) + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

/** Направление посылки: одно на все её заявки, иначе `null`. */
function destinationOf(box, requests) {
  const ids = new Set(Array.isArray(box.requestIds) ? box.requestIds : []);
  const dests = new Set(
    requests
      .filter((r) => ids.has(r.id))
      .map((r) => String(r.note ?? "").trim())
      .filter(Boolean),
  );
  return dests.size === 1 ? [...dests][0] : null;
}

const isClosed = (outbound, sortCode) =>
  outbound.some((b) => b.place && code(b.sortCode) === sortCode);

function applySortPlace(data, body) {
  const parcelCode = code(body.outboundCode);
  const sortCode = code(body.sortCode);
  const m = SORT_RE.exec(sortCode);
  if (!PARCEL_RE.test(parcelCode) || !m) return { flag: "bad" };
  const outbound = list(data.outboundBoxes);
  const box = outbound.find((b) => !b.shipmentId && !b.place && code(b.code) === parcelCode);
  if (!box) return { flag: "bad" };
  // Повтор той же операции (ключ другой, суть та же) — ничего не меняем.
  if (box.sortCode && code(box.sortCode) === sortCode) return { data };
  if (box.sortCode) return { flag: "mixed" };
  const dest = destinationOf(box, list(data.requests));
  if (!dest) return { flag: "bad" };
  if (destKey(dest) !== m[1] || isClosed(outbound, sortCode)) return { flag: "mixed" };
  const at = Number.isFinite(body.at) ? body.at : Date.now();
  return {
    data: {
      ...data,
      outboundBoxes: outbound.map((b) => (b === box ? { ...b, sortCode, updatedAt: at } : b)),
    },
  };
}

function applySortClose(data, body) {
  const sortCode = code(body.sortCode);
  const pallets = body.pallets;
  const boxes = body.boxes;
  const ids = Array.isArray(body.placeIds) ? body.placeIds : null;
  if (!SORT_RE.test(sortCode) || !Number.isInteger(pallets) || !Number.isInteger(boxes)) {
    return { flag: "bad" };
  }
  const n = pallets + boxes;
  if (pallets < 0 || boxes < 0 || n < 1 || n > MAX_PLACES || !ids || ids.length !== n) {
    return { flag: "bad" };
  }
  if (!ids.every((id) => typeof id === "string" && ID_RE.test(id))) return { flag: "bad" };
  const outbound = list(data.outboundBoxes);
  // Повтор той же операции — места уже заведены под этими id.
  if (ids.every((id) => outbound.some((b) => b.id === id))) return { data };
  if (ids.some((id) => outbound.some((b) => b.id === id))) return { flag: "bad" };
  if (isClosed(outbound, sortCode)) return { flag: "mixed" };
  const parcels = outbound.filter(
    (b) => !b.shipmentId && !b.place && code(b.sortCode) === sortCode,
  );
  if (parcels.length === 0) return { flag: "bad" };
  const at = Number.isFinite(body.at) ? body.at : Date.now();
  const base = sortCode.replace("UK-SORT-", "UK-OUT-");
  const places = ids.map((id, i) => ({
    id,
    code: `${base}-${i + 1}`,
    lines: [],
    requestIds: [],
    packedBy: [],
    createdAt: at,
    updatedAt: at,
    sortCode,
    place: i < pallets ? "pallet" : "box",
  }));
  return { data: { ...data, outboundBoxes: [...outbound, ...places] } };
}

module.exports = { applySortClose, applySortPlace };
