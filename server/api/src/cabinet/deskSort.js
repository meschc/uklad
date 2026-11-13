/**
 * Сортировка операцией (миграция 027, `deskOps.js`).
 *
 * `sort_place` — короб отгрузки (посылка) лёг на паллету сортировки. Сервер
 * сам повторяет правила стола (`src/lib/sorting.ts`): короб открыт и ещё ни
 * на какой паллете, у него одно назначение, а паллета либо пуста, либо уже
 * этого назначения. Товар не двигается — меняется только место короба.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const code = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();
const OUT_RE = /^UK-OUT-[A-Z0-9-]{1,40}$/;
const PLT_RE = /^UK-PLT-[A-Z0-9-]{1,40}$/;

/** Назначение короба: одно на все его заявки, иначе `null`. */
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

function applySortPlace(data, body) {
  const boxCode = code(body.outboundCode);
  const pallet = code(body.pallet);
  if (!OUT_RE.test(boxCode) || !PLT_RE.test(pallet)) return { flag: "bad" };
  const outbound = list(data.outboundBoxes);
  const requests = list(data.requests);
  const open = outbound.filter((b) => !b.shipmentId);
  const box = open.find((b) => code(b.code) === boxCode);
  if (!box) return { flag: "bad" };
  // Повтор той же операции (ключ другой, суть та же) — ничего не меняем.
  if (box.palletCode && code(box.palletCode) === pallet) return { data };
  if (box.palletCode) return { flag: "mixed" };
  const dest = destinationOf(box, requests);
  if (!dest) return { flag: "bad" };
  const onPallet = open.filter((b) => b.palletCode && code(b.palletCode) === pallet);
  if (onPallet.some((b) => destinationOf(b, requests) !== dest)) return { flag: "mixed" };
  const at = Number.isFinite(body.at) ? body.at : Date.now();
  return {
    data: {
      ...data,
      outboundBoxes: outbound.map((b) =>
        b === box ? { ...b, palletCode: pallet, updatedAt: at } : b,
      ),
    },
  };
}

module.exports = { applySortPlace };
