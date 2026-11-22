/**
 * Заказ в двух тарах (миграция 047, `deskOps.js`, вид `pack_merge`).
 *
 * Тара переполнилась — сборщик доложил заказ площадки в другую. Пакуют такой
 * заказ одной посылкой: упаковщик сканирует вторую тару, и она пересыпается
 * в ту, что на столе (`pack_merge`). Сервер повторяет правку по правилам
 * браузера (`lib/toteMerge.ts`): пересыпать можно только тару, где лежат
 * одни части заказов этой тары, — чужой заказ так в посылку не попадёт.
 * Остальные переносы между тарами делает старший (`pack_move`).
 *
 * Тот же закон держит закрытие тары (`orderSplit`): заказ площадки,
 * часть которого ещё в другой таре или собирается, упакованным не станет.
 */

/* global module */
"use strict";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);

/** Как `orderKey` в `lib/packing.ts`. */
const orderKey = (r) =>
  r.externalId ? `${r.source ?? ""}:${String(r.externalId).trim().toLowerCase()}` : `#${r.id}`;
const isOpen = (r) => !r.packedAt && r.status !== "shipped" && r.status !== "cancelled";

/**
 * Закрытие тары оставило бы заказ площадки наполовину: среди закрываемых
 * заявок есть заказ, у которого открытая заявка вне их.
 */
function orderSplit(requests, closingIds) {
  const closing = new Set(closingIds);
  const keys = new Set(
    list(requests)
      .filter((r) => closing.has(r.id) && r.externalId)
      .map(orderKey),
  );
  return list(requests).some((r) => keys.has(orderKey(r)) && isOpen(r) && !closing.has(r.id));
}

/** Почему тару `from` нельзя пересыпать в `into` (`mergeProblem` в браузере): null — можно. */
function mergeProblem(requests, into, from) {
  if (!into || !from || into.id === from.id) return "bad";
  if (into.address || into.sealed || from.address || from.sealed) return "bad";
  const here = new Set(
    requests
      .filter((r) => r.externalId && r.toteId === into.id && r.status === "done" && isOpen(r))
      .map(orderKey),
  );
  const there = requests.filter((r) => r.toteId === from.id && isOpen(r));
  if (there.length === 0) return "mixed";
  // В той таре ещё собирают — пересыпать на ходу нельзя.
  if (there.some((r) => r.status !== "done")) return "mixed";
  if (there.some((r) => !r.externalId || !here.has(orderKey(r)))) return "mixed";
  return null;
}

/** Строки двух тар — одной: штуки одного товара складываются. */
function sumLines(a, b) {
  const lines = new Map();
  for (const l of [...list(a), ...list(b)]) {
    const q = Number(l.qty) || 0;
    if (q > 0 && isId(l.productId)) lines.set(l.productId, (lines.get(l.productId) ?? 0) + q);
  }
  return [...lines].map(([productId, qty]) => ({ productId, qty }));
}

/** Тара `from` пересыпана в `into`: строки сложены, открытые заявки той тары — в этой. */
function moveAll(data, into, from, event) {
  const boxes = list(data.boxes);
  return {
    ...data,
    boxes: boxes.map((b) =>
      b === into
        ? { ...b, lines: sumLines(into.lines, from.lines) }
        : b === from
          ? { ...b, lines: [] }
          : b,
    ),
    requests: list(data.requests).map((r) =>
      r.toteId === from.id && isOpen(r) ? { ...r, toteId: into.id, updatedAt: event.at } : r,
    ),
    staffEvents: [...list(data.staffEvents), event],
  };
}

const findBoxes = (data, body) => {
  const boxes = list(data.boxes);
  return {
    into: boxes.find((b) => b.id === body.toteId),
    from: boxes.find((b) => b.id === body.fromToteId),
  };
};

/**
 * Пересыпать тару `fromToteId` в `toteId`: строки складываются, заявки той
 * тары теперь числятся в этой. Сверку остатков проходит общая проверка:
 * сумма по коробам не меняется.
 */
function applyToteMerge(data, body, staffRef) {
  if (list(data.staffEvents).some((e) => e.id === body.eventId)) return { data };
  if (!isId(body.toteId) || !isId(body.fromToteId)) return { flag: "bad" };
  const { into, from } = findBoxes(data, body);
  const problem = mergeProblem(list(data.requests), into, from);
  if (problem) return { flag: problem };
  return {
    data: moveAll(data, into, from, {
      id: body.eventId,
      staffId: staffRef,
      type: "pack_merge",
      at: body.at,
      station: "pack",
      code: String(from.barcode ?? "").slice(0, 100),
      boxId: into.id,
    }),
  };
}

/**
 * Почему старший не может переложить тару `from` в `into` (`moveProblem` в
 * браузере): null — можно. Чужой заказ здесь не помеха — за это отвечает
 * старший; нельзя только полку, закрытую тару и тару, в которую ещё собирают.
 */
function moveProblem(requests, into, from) {
  if (!into || !from || into.id === from.id) return "bad";
  if (into.address || into.sealed || from.address || from.sealed) return "bad";
  if (!list(from.lines).some((l) => Number(l.qty) > 0)) return "empty";
  if (requests.some((r) => r.toteId === from.id && isOpen(r) && r.status !== "done")) return "busy";
  return null;
}

/**
 * Старший перекладывает тару целиком (`pack_move`, миграция 048): переполнена,
 * порвалась, недособранная тара освобождается. Право — решать по товару, и
 * только у того, кто сейчас за столом (`deskOps.js`). Заявки тары переезжают
 * вместе с товаром, поэтому упаковка увидит их в новой таре.
 */
function applyToteMove(data, body, staffRef) {
  if (list(data.staffEvents).some((e) => e.id === body.eventId)) return { data };
  if (!isId(body.toteId) || !isId(body.fromToteId)) return { flag: "bad" };
  const { into, from } = findBoxes(data, body);
  const problem = moveProblem(list(data.requests), into, from);
  if (problem) return { flag: problem };
  return {
    data: moveAll(data, into, from, {
      id: body.eventId,
      staffId: staffRef,
      type: "pack_move",
      at: body.at,
      code: String(from.barcode ?? "").slice(0, 100),
      boxId: into.id,
    }),
  };
}

module.exports = { applyToteMerge, applyToteMove, orderSplit };
