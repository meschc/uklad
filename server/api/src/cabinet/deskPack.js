/**
 * Упаковка операциями (миграция 015, `deskOps.js`).
 *
 * Стол присылает факты упаковки, а не снимок: «скан товара», «этикетка»,
 * «брак», «тара закрыта: в короб отгрузки легло вот это». Сервер сам
 * собирает из них правку текущего снимка — по тем же правилам, что стол в
 * браузере (`lib/packing.ts`, `lib/outbound.ts`), — и пропускает её через
 * общие правила записи стола (`mergeDeskWrite`: кто за столом, сверка
 * остатков). Поэтому стол не может положить в короб больше, чем было в
 * таре, а короб — смешать двух продавцов или два назначения.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);

/** Как `normalizeCode` в `lib/barcode.ts`. */
function normalizeCode(raw) {
  return String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^УК-/, "UK-")
    .replace(/^УK-/, "UK-")
    .replace(/^YK-/, "UK-")
    .replace(/^(UK-(?:BOX|PLT)-)0+(?=\d)/, "$1");
}

const PACK_EVENTS = new Set(["pack_scan", "pack_label", "pack_error", "pack_reject"]);
/** Спорное, которое приносит скан: «нет в таре», «лишнее» и брак. */
const SCAN_DISPUTES = new Set(["not_in_tote", "extra", "not_packable"]);
const MAX_QTY = 100_000;

const linesOf = (rows) => {
  const m = new Map();
  for (const l of list(rows)) {
    if (typeof l.productId === "string" && Number.isInteger(l.qty)) {
      m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
    }
  }
  return m;
};
const asLines = (m) =>
  [...m].filter(([, q]) => q > 0).map(([productId, qty]) => ({ productId, qty }));

/** Строки, которые прислал стол: товар, целое число штук. */
function cleanLines(raw) {
  if (!Array.isArray(raw) || raw.length > 500) return null;
  const m = new Map();
  for (const l of raw) {
    if (!isObject(l) || !isId(l.productId)) return null;
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > MAX_QTY) return null;
    m.set(l.productId, (m.get(l.productId) ?? 0) + l.qty);
  }
  return m;
}

/** Спорное, по которому старший может списать товар из тары. */
const WRITE_OFF = new Set(["shortage", "not_packable"]);

/**
 * Открытое спорное по скану или недостаче: новое или выросшее. Совпал id,
 * а вид, тара или товар другие — подлог или сбой: расти так спорному нельзя,
 * иначе недостача по одному товару увеличит списание по другому.
 */
function withDispute(disputes, d) {
  const same = disputes.find((x) => x.id === d.id);
  if (!same) return [d, ...disputes];
  if (
    same.resolution ||
    same.kind !== d.kind ||
    same.boxId !== d.boxId ||
    same.productId !== d.productId
  ) {
    return null;
  }
  // Можно ли ему расти, решит `mergeDisputes`.
  return disputes.map((x) => (x === same ? { ...x, qty: d.qty } : x));
}

/**
 * Сколько штук товара в таре уже ждут решения старшего (недостача и брак):
 * больше, чем лежит в таре, списать нельзя.
 */
function claimed(disputes, boxId, productId) {
  let n = 0;
  for (const d of disputes) {
    if (!d.resolution && d.boxId === boxId && d.productId === productId && WRITE_OFF.has(d.kind)) {
      n += Number(d.qty) || 0;
    }
  }
  return n;
}

const packEvent = (body, staffRef) => ({
  id: body.eventId,
  staffId: staffRef,
  type: body.type,
  at: body.at,
  station: "pack",
  ...(typeof body.code === "string" ? { code: body.code.slice(0, 200) } : {}),
  ...(isId(body.productId) ? { productId: body.productId } : {}),
  ...(isId(body.orderId) ? { orderId: body.orderId } : {}),
  ...(Number.isInteger(body.ms) && body.ms >= 0 ? { ms: body.ms } : {}),
});

/**
 * Скан, этикетка, брак или ошибка скана — запись в журнал сотрудника. Скан
 * «нет в таре» или «лишнее» приносит с собой спорное, брак — спорное «не
 * подлежит упаковке»: штука остаётся в таре на учёте, списывает её старший.
 * Возвращает правку снимка или причину пометки.
 */
function applyPackEvent(data, body, staffRef) {
  if (!PACK_EVENTS.has(body.type)) return { flag: "bad" };
  const events = list(data.staffEvents);
  if (events.some((e) => e.id === body.eventId)) return { data };
  const out = { ...data, staffEvents: [...events, packEvent(body, staffRef)] };
  const d = body.dispute;
  if (d !== undefined) {
    const tote = list(data.boxes).find((b) => b.id === body.toteId);
    if (
      !isObject(d) ||
      !isId(d.id) ||
      !SCAN_DISPUTES.has(d.kind) ||
      !isId(body.productId) ||
      !tote ||
      !Number.isInteger(d.qty) ||
      d.qty < 1 ||
      d.qty > MAX_QTY
    ) {
      return { flag: "bad" };
    }
    const was = list(data.disputes).find((x) => x.id === d.id);
    const grow = d.qty - (Number(was?.qty) || 0);
    // Один скан — одна штука. Меньше — то же уже пришло снимком.
    if (grow > 1) return { flag: "bad" };
    if (grow <= 0) return { data: out };
    const disputes = withDispute(list(data.disputes), {
      id: d.id,
      kind: d.kind,
      boxId: tote.id,
      toteCode: tote.barcode,
      productId: body.productId,
      qty: d.qty,
      raisedBy: staffRef,
      raisedAt: body.at,
    });
    if (!disputes) return { flag: "bad" };
    // Брака не бывает больше, чем этого товара лежит в таре.
    if (
      claimed(disputes, tote.id, body.productId) > (linesOf(tote.lines).get(body.productId) ?? 0)
    ) {
      return { flag: "stock" };
    }
    out.disputes = disputes;
  }
  return { data: out };
}

/** Один короб — один продавец и одно назначение (`packTargetProblem`). */
function targetProblem(data, toteLines, closing, open) {
  const partner = new Map(list(data.products).map((p) => [p.id, p.partnerId ?? ""]));
  const sellers = (lines) =>
    new Set(
      [...lines].filter(([, q]) => q > 0).map(([p]) => (partner.has(p) ? partner.get(p) : `?${p}`)),
    );
  const tote = sellers(toteLines);
  if (tote.size > 1) return true;
  if (!open) return false;
  const inBox = sellers(linesOf(open.lines));
  if ([...tote].some((s) => inBox.size > 0 && !inBox.has(s))) return true;
  const openIds = new Set(Array.isArray(open.requestIds) ? open.requestIds : []);
  const target = (r) => String(r.note ?? "").trim();
  const boxTargets = new Set(
    list(data.requests)
      .filter((r) => openIds.has(r.id))
      .map(target),
  );
  const boxFbo = openIds.size === 0 && linesOf(open.lines).size > 0;
  const toteFbo = closing.length === 0;
  if (boxFbo !== toteFbo && (boxFbo || boxTargets.size > 0)) return true;
  return boxTargets.size > 0 && closing.some((r) => !boxTargets.has(target(r)));
}

/**
 * Тара закрыта: подтверждённое этикетками ложится в короб отгрузки,
 * недостача остаётся в таре и уходит старшему спорным, закрытые заказы
 * помечаются упакованными.
 */
function applyPackDone(data, body, staffRef) {
  // Та же тара уже закрыта записью снимка (после обрыва она могла уйти
  // раньше операции): повторять правку нельзя — товар ушёл бы дважды.
  if (list(data.staffEvents).some((e) => e.id === body.eventId)) return { data };
  const boxes = list(data.boxes);
  const tote = boxes.find((b) => b.id === body.toteId);
  const packed = cleanLines(body.lines);
  const code = typeof body.outboundCode === "string" ? normalizeCode(body.outboundCode) : "";
  if (!tote || !packed || !code || code.length > 100) {
    return { flag: "bad" };
  }
  if (code === normalizeCode(String(tote.barcode ?? ""))) return { flag: "bad" };
  const have = linesOf(tote.lines);
  for (const [p, q] of packed) if ((have.get(p) ?? 0) < q) return { flag: "stock" };

  const requests = list(data.requests);
  const ids = Array.isArray(body.requestIds) ? body.requestIds.filter(isId) : [];
  if (ids.length > 500) return { flag: "bad" };
  const closing = requests.filter(
    (r) => ids.includes(r.id) && r.toteId === tote.id && r.status === "done" && !r.packedAt,
  );
  // Заказ упакован, только если его товар лёг в короб: иначе продавец увидит
  // отгрузку пустого короба. Частичный — по собранному (`toteOrders`).
  const need = new Map();
  for (const r of closing) {
    const n = r.partial ? Number(r.pickedQty) || 0 : Number(r.qty) || 0;
    if (n > 0) need.set(r.productId, (need.get(r.productId) ?? 0) + n);
  }
  for (const [p, n] of need) if ((packed.get(p) ?? 0) < n) return { flag: "stock" };
  const outs = list(data.outboundBoxes);
  const open = outs.find((b) => !b.shipmentId && normalizeCode(String(b.code ?? "")) === code);
  if (targetProblem(data, have, closing, open)) return { flag: "mixed" };

  const at = body.at;
  const remaining = new Map(have);
  for (const [p, q] of packed) remaining.set(p, remaining.get(p) - q);
  const requestIds = closing.map((r) => r.id);
  let outboundBoxes = outs;
  if (packed.size > 0 || requestIds.length > 0) {
    if (open) {
      const lines = linesOf(open.lines);
      for (const [p, q] of packed) lines.set(p, (lines.get(p) ?? 0) + q);
      const packedBy = Array.isArray(open.packedBy) ? open.packedBy : [];
      outboundBoxes = outs.map((b) =>
        b === open
          ? {
              ...b,
              lines: asLines(lines),
              requestIds: [...new Set([...(open.requestIds ?? []), ...requestIds])],
              packedBy: packedBy.includes(staffRef) ? packedBy : [...packedBy, staffRef],
              updatedAt: at,
            }
          : b,
      );
    } else {
      if (!isId(body.outboundId) || outs.some((b) => b.id === body.outboundId)) {
        return { flag: "bad" };
      }
      outboundBoxes = [
        ...outs,
        {
          id: body.outboundId,
          code,
          lines: asLines(packed),
          requestIds,
          packedBy: [staffRef],
          createdAt: at,
          updatedAt: at,
        },
      ];
    }
  }

  let disputes = list(data.disputes);
  const shortages = Array.isArray(body.shortages) ? body.shortages : [];
  if (shortages.length > 200) return { flag: "bad" };
  for (const s of shortages) {
    if (!isObject(s) || !isId(s.id) || !isId(s.productId)) return { flag: "bad" };
    if (!Number.isInteger(s.qty) || s.qty < 1 || s.qty > MAX_QTY) return { flag: "bad" };
    // Та же недостача в той же таре копится в одном спорном: стол присылает
    // итог, а прирост — не больше того, что осталось в таре.
    const was = disputes.find((d) => d.id === s.id);
    const grow = s.qty - (Number(was?.qty) || 0);
    if (grow <= 0) continue;
    disputes = withDispute(disputes, {
      id: s.id,
      kind: "shortage",
      boxId: tote.id,
      toteCode: tote.barcode,
      productId: s.productId,
      qty: s.qty,
      raisedBy: staffRef,
      raisedAt: at,
    });
    if (!disputes) return { flag: "bad" };
  }
  // Недостача и брак вместе — не больше того, что осталось в таре: одну
  // штуку нельзя списать дважды.
  for (const p of new Set(shortages.map((s) => s.productId))) {
    if (claimed(disputes, tote.id, p) > (remaining.get(p) ?? 0)) return { flag: "stock" };
  }

  const closed = new Set(requestIds);
  const done = { id: body.eventId, staffId: staffRef, type: "pack_done", at, station: "pack" };
  return {
    data: {
      ...data,
      boxes: boxes.map((b) => (b === tote ? { ...b, lines: asLines(remaining) } : b)),
      outboundBoxes,
      requests: requests.map((r) =>
        closed.has(r.id) ? { ...r, packedAt: at, packedBy: staffRef, updatedAt: at } : r,
      ),
      disputes,
      staffEvents: [...list(data.staffEvents), { ...done, code: tote.barcode }],
    },
  };
}

module.exports = { applyPackEvent, applyPackDone, normalizeCode };
