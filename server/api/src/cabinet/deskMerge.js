/**
 * Заказ в двух тарах (миграция 047, `deskOps.js`, вид `pack_merge`).
 *
 * Тара переполнилась — сборщик доложил заказ площадки в другую. Пакуют такой
 * заказ одной посылкой: упаковщик сканирует вторую тару, и она пересыпается
 * в ту, что на столе (`pack_merge`). Сервер повторяет правку по правилам
 * браузера (`lib/toteMerge.ts`): пересыпать можно только тару, где лежат
 * одни части заказов этой тары, — чужой заказ так в посылку не попадёт.
 * Остальные переносы между тарами делает старший.
 *
 * Тот же закон держит закрытие тары (`orderSplit`): заказ площадки,
 * часть которого ещё в другой таре или собирается, упакованным не станет.
 */

/* global module */

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

/**
 * Пересыпать тару `fromToteId` в `toteId`: строки складываются, заявки той
 * тары теперь числятся в этой. Сверку остатков проходит общая проверка:
 * сумма по коробам не меняется.
 */
function applyToteMerge(data, body, staffRef) {
  const events = list(data.staffEvents);
  if (events.some((e) => e.id === body.eventId)) return { data };
  if (!isId(body.toteId) || !isId(body.fromToteId)) return { flag: "bad" };
  const boxes = list(data.boxes);
  const into = boxes.find((b) => b.id === body.toteId);
  const from = boxes.find((b) => b.id === body.fromToteId);
  const requests = list(data.requests);
  const problem = mergeProblem(requests, into, from);
  if (problem) return { flag: problem };
  const lines = new Map();
  for (const l of [...list(into.lines), ...list(from.lines)]) {
    const q = Number(l.qty) || 0;
    if (q > 0 && isId(l.productId)) lines.set(l.productId, (lines.get(l.productId) ?? 0) + q);
  }
  const at = body.at;
  return {
    data: {
      ...data,
      boxes: boxes.map((b) =>
        b === into
          ? { ...b, lines: [...lines].map(([productId, qty]) => ({ productId, qty })) }
          : b === from
            ? { ...b, lines: [] }
            : b,
      ),
      requests: requests.map((r) =>
        r.toteId === from.id && isOpen(r) ? { ...r, toteId: into.id, updatedAt: at } : r,
      ),
      staffEvents: [
        ...events,
        {
          id: body.eventId,
          staffId: staffRef,
          type: "pack_merge",
          at,
          station: "pack",
          code: String(from.barcode ?? "").slice(0, 100),
          boxId: into.id,
        },
      ],
    },
  };
}

module.exports = { applyToteMerge, orderSplit };
