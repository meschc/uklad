/**
 * Карантин излишка с приёмки (Кирилл 17.11, тот же код, что `lib/disputes.ts`
 * в браузере). Лишнее сверх заявленной строки поставки, по которому старший
 * ещё не решил («Лишнее с приёмки» со строкой, `lineId`), лежит в своей таре, но из неё его не
 * собирают и в кроссдок не отдают: это может быть чужой товар или ошибка
 * поставщика, и продать его до решения нельзя. «Оставить» снимает карантин,
 * «убрать» уводит штуки из тары (`deskStock.js`).
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Сколько штук товара в таре держит открытое лишнее с приёмки. */
function heldQty(disputes, boxId, productId) {
  return list(disputes)
    .filter(
      (d) =>
        // Брак с приёмки или упаковки — тоже карантин до решения старшего.
        ((d.kind === "receive_overage" && typeof d.lineId === "string") ||
          d.kind === "not_packable") &&
        !d.resolution &&
        d.boxId === boxId &&
        d.productId === productId,
    )
    .reduce((n, d) => n + num(d.qty), 0);
}

/** Сколько товара в таре можно взять в работу: всё, кроме карантина. */
function freeInBox(disputes, box, productId) {
  const have = list(box.lines)
    .filter((l) => l.productId === productId)
    .reduce((n, l) => n + num(l.qty), 0);
  return Math.max(0, have - heldQty(disputes, box.id, productId));
}

/**
 * Сколько из принятого вышло за строку поставки — то же правило, что
 * `receivedOver` в `deskStock.js` для одного события: без строки — всё.
 */
function overReceived(line, qty) {
  if (!line) return qty;
  return Math.max(0, Math.min(qty, num(line.receivedQty) + qty - num(line.expectedQty)));
}

module.exports = { heldQty, freeInBox, overReceived };
