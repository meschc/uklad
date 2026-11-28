/**
 * Поставка продавца «Везу товар» через сервер (п. 2.1б «До запуска»).
 *
 * Продавец предупреждает склад, что и сколько привезёт: на складе появляется
 * обычная ожидаемая поставка (`expectedShipments`, источник `manual`), которую
 * склад принимает построчно со сверкой план/факт. Здесь — разбор тела и сама
 * запись поставки; маршрут, продавец из сессии и блокировка снимка — общие с
 * заявкой (`sellerRequests.js`).
 *
 * Продавец задаёт только товар, количество и имя партии. Принятое, статус,
 * грузовая приёмка и кроссдокинг — работа склада, в теле их нет.
 */
/* global module */

const KEY_RE = /^[A-Za-z0-9-]{8,64}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
/** Строк в одной поставке. */
const MAX_LINES = 200;
/** Штук в строке — с запасом выше любой партии. */
const MAX_QTY = 1_000_000;
const MAX_TITLE = 120;
/** Ждущих поставок продавца на складе: дальше — 409, снимок не растёт без конца. */
const MAX_PENDING = 300;
/** Строк во всех ждущих поставках продавца вместе (разбор «Безопасности» к #330). */
const MAX_PENDING_LINES = 5000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Тело → `{ key, title, lines: [{ productId, qty }] }` или `null` (400). */
function readSupply(b) {
  if (!isObject(b) || typeof b.key !== "string" || !KEY_RE.test(b.key)) return null;
  const items = b.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_LINES) return null;
  const lines = [];
  for (const it of items) {
    if (!isObject(it) || typeof it.productId !== "string" || !ID_RE.test(it.productId)) {
      return null;
    }
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > MAX_QTY) return null;
    lines.push({ productId: it.productId, qty: it.qty });
  }
  let title;
  if (b.title !== undefined && b.title !== null) {
    if (typeof b.title !== "string" || b.title.trim().length > MAX_TITLE) return null;
    title = b.title.trim() || undefined;
  }
  return { key: b.key, title, lines };
}

/** id поставки из ключа повтора: повтор даёт ту же поставку. */
const supplyId = (key) => `ship_s${key}`;

/** Что не так до записи: `null` — можно, иначе отказ `{ status, error }`. */
function supplyRefusal(view, own, b) {
  if (b.lines.some((l) => !own.has(l.productId))) return { status: 404, error: "not_found" };
  const pending = list(view.expectedShipments).filter(
    (s) =>
      isObject(s) &&
      s.by === "seller" &&
      s.status === "pending" &&
      list(s.lines).some((l) => isObject(l) && own.has(l.productId)),
  );
  const lines = pending.reduce((n, s) => n + list(s.lines).length, 0);
  if (pending.length >= MAX_PENDING || lines + b.lines.length > MAX_PENDING_LINES) {
    return { status: 409, error: "too_many" };
  }
  return null;
}

/** Ожидаемая поставка из тела — в той же форме, что `createExpectedShipment`. */
function newSupply(b, at, memberId) {
  const id = supplyId(b.key);
  return {
    id,
    source: "manual",
    ...(b.title ? { title: b.title } : {}),
    createdAt: at,
    status: "pending",
    by: "seller",
    ...(memberId ? { byMember: memberId } : {}),
    lines: b.lines.map((l, i) => ({
      id: `${id}_l${i}`,
      productId: l.productId,
      expectedQty: l.qty,
      receivedQty: 0,
    })),
  };
}

/**
 * Поставка глазами продавца: только поля ожидания и свои строки. Кто
 * принимал и что решил склад — не продавцу, даже если в поставку это
 * когда-нибудь допишут.
 */
const SUPPLY_KEYS = ["id", "source", "title", "createdAt", "status", "closedAt", "by"];
const LINE_KEYS = ["id", "productId", "expectedQty", "receivedQty"];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
function toSellerSupply(s, own) {
  return {
    ...pick(s, SUPPLY_KEYS),
    lines: list(s.lines)
      .filter((l) => isObject(l) && own.has(l.productId))
      .map((l) => pick(l, LINE_KEYS)),
  };
}

module.exports = { readSupply, supplyId, supplyRefusal, newSupply, toSellerSupply };
