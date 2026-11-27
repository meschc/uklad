/**
 * «Путь товара» (Кирилл 16.11): по коду отправления, коду маркировки, EAN,
 * артикулу или заказу — посылки, в которых это было, и лента одной посылки
 * от приёмки до рейса: тара → заказ → короб → место сортировки → рейс, с
 * сотрудником и временем каждого шага.
 *
 * Без миграции: всё уже лежит в операциях столов (`uklad.desk_ops`, склад и
 * тип скана — миграция 044). Посылка — операция `pack_done`: тара, заказы,
 * состав и код короба. От неё назад — сборка заказов в эту тару, ячейка, из
 * которой брали, и приёмка короба, положенного в эту ячейку; вперёд — место
 * сортировки посылки, закрытие отгрузки и рейс её заказов.
 *
 * Поиск по последним 4 знакам: у кода отправления и EAN — конец кода, у
 * DataMatrix — конец серийного номера (как выделяет `src/lib/codeTail.ts`).
 * Совпадений бывает много — отдаём список, кабинет сужает его датой и
 * направлением.
 *
 * Права — как у журнала действий: «Персонал: смотреть», только свой склад.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { journalPlace, mayRead } = require("./journal");

const REF_RE = /^[A-Za-z0-9_.:#/-]{1,200}$/;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Код со сканера: печатные знаки ASCII. Криптохвост после GS отрезается. */
const CODE_RE = /^[\x20-\x7E]{1,200}$/;
const MATCHES = 50;
const LIST_MAX = 50;
const DAY_MS = 86_400_000;

const given = (v) => v !== null && v !== "";
const msOrNull = (v) => {
  const n = Number(v);
  return given(v) && Number.isFinite(n) && n > 0 ? new Date(n) : null;
};
const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
/** «a,b,c» → список ссылок; не похоже — `null` (400). */
function refList(v) {
  if (!given(v)) return [];
  const out = v.split(",").filter(Boolean);
  return out.length <= LIST_MAX && out.every((x) => REF_RE.test(x)) ? out : null;
}

/** Что ищем. Не похоже на запрос — `null` (400), пустой запрос — тоже. */
function readSearch(url) {
  const p = url.searchParams;
  const raw = (p.get("q") ?? "").split("\u001d")[0].trim();
  const q = raw === "" ? null : CODE_RE.test(raw) ? raw : undefined;
  const orders = refList(p.get("orders"));
  const products = refList(p.get("products"));
  const out = {
    q,
    // Четыре знака — хвост кода: так ищут посылку по этикетке на глаз.
    tail: typeof q === "string" && /^[A-Za-z0-9]{4}$/.test(q),
    orders,
    products,
    since: msOrNull(p.get("since")),
    before: msOrNull(p.get("before")),
  };
  if (q === undefined || !orders || !products) return null;
  if (given(p.get("since")) && !out.since) return null;
  if (given(p.get("before")) && !out.before) return null;
  if (!q && !orders.length && !products.length) return null;
  return out;
}

// Код скана без криптохвоста: до GS. Хвост серийного номера DataMatrix
// (`01<GTIN>21<серийный>`) — его конец; у остальных кодов — конец кода.
// Хвост сравнивается без регистра: его набирают руками с этикетки.
const SCAN_CODE = `split_part(body->>'code', chr(29), 1)`;
const SERIAL = `substring(${SCAN_CODE} FROM '^01[0-9]{14}21([A-Za-z0-9._/-]{1,20})')`;
// Скан упаковки относится к посылке: та же тара, не позже и не раньше суток,
// заказ скана — среди заказов посылки (у FBO-тары заказа нет).
const HIT_OF_PARCEL = `h.tote = p.body->>'toteId' AND h.at <= p.at
  AND h.at >= p.at - interval '1 day'
  AND (h.order_id IS NULL OR p.body->'requestIds' ? h.order_id)`;

/** Посылки (`pack_done`) склада, где был этот код, заказ или товар. Новые сверху. */
async function findParcels(c, wh, s) {
  const { rows } = await c.query(
    `WITH ops AS NOT MATERIALIZED (
       SELECT o.id, coalesce(o.happened_at, o.received_at) AS at, o.staff_ref, o.kind, o.body
       FROM uklad.desk_ops o
       WHERE o.org_id = uklad.current_org() AND o.warehouse_ref = $1 AND o.status = 'applied'
         AND ($2::timestamptz IS NULL OR coalesce(o.happened_at, o.received_at) >= $2)
         AND ($3::timestamptz IS NULL OR coalesce(o.happened_at, o.received_at) <= $3)
     ), hits AS (
       -- Сканы упаковки с этим кодом: штука или этикетка → тара и заказ.
       SELECT body->>'toteId' AS tote, body->>'orderId' AS order_id, at,
              left(${SCAN_CODE}, 64) AS code
       FROM ops
       WHERE $4::text IS NOT NULL AND kind = 'pack_event' AND body ? 'code'
         AND (${SCAN_CODE} = $4
              OR ($5 AND (upper(right(${SCAN_CODE}, 4)) = upper($4)
                      OR upper(right(${SERIAL}, 4)) = upper($4))))
     )
     SELECT p.id, p.at, p.staff_ref, p.body->>'outboundCode' AS outbound_code,
            p.body->>'toteId' AS tote_id, p.body->'requestIds' AS request_ids,
            p.body->'lines' AS lines,
            (SELECT h.code FROM hits h WHERE ${HIT_OF_PARCEL}
             ORDER BY h.at DESC LIMIT 1) AS code
     FROM ops p
     WHERE p.kind = 'pack_done' AND (
       ($4::text IS NOT NULL AND (p.body->>'outboundCode' = $4
                                  OR ($5 AND upper(right(p.body->>'outboundCode', 4)) = upper($4))))
       OR (jsonb_typeof(p.body->'requestIds') = 'array' AND p.body->'requestIds' ?| $6::text[])
       OR (jsonb_typeof(p.body->'lines') = 'array' AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(p.body->'lines') l
             WHERE l->>'productId' = ANY ($7::text[])))
       OR EXISTS (SELECT 1 FROM hits h WHERE ${HIT_OF_PARCEL})
     )
     ORDER BY p.at DESC, p.id DESC
     LIMIT ${MATCHES}`,
    [wh.id, s.since, s.before, s.q, s.tail, s.orders, s.products],
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).getTime(),
    staffRef: r.staff_ref,
    outboundCode: r.outbound_code,
    toteId: r.tote_id,
    requestIds: strings(r.request_ids),
    lines: (Array.isArray(r.lines) ? r.lines : [])
      .filter((l) => l && typeof l.productId === "string" && Number.isInteger(l.qty))
      .map((l) => ({ productId: l.productId, qty: l.qty })),
    ...(r.code ? { code: r.code } : {}),
  }));
}

/** Тело операции наружу — узкой выжимкой, как у журнала (миграция 044). */
function refsOf(body) {
  const out = {};
  for (const k of [
    "type",
    "productId",
    "toteId",
    "boxId",
    "palletId",
    "orderId",
    "requestId",
    "outboundCode",
    "sortCode",
    "vehicle",
  ]) {
    if (typeof body[k] === "string" && body[k]) out[k] = body[k].slice(0, 200);
  }
  // Код маркировки — без криптохвоста, как в журнале.
  if (typeof body.code === "string" && body.code) {
    out.code = body.code.split("\u001d")[0].slice(0, 64);
  }
  if (body.cell && typeof body.cell === "object") out.cell = body.cell;
  if (Number.isInteger(body.qty)) out.qty = body.qty;
  if (body.dispute && typeof body.dispute.kind === "string") out.dispute = body.dispute.kind;
  return out;
}

/**
 * Лента одной посылки (или заказа, ещё не упакованного): операции по порядку
 * времени. Связь шагов — по данным операций, а не по снимку: тара и заказы
 * посылки, ячейка сборки, короб приёмки в этой ячейке, код посылки.
 */
async function pathSteps(c, wh, seed) {
  const { rows } = await c.query(
    `WITH ops AS NOT MATERIALIZED (
       SELECT o.id, coalesce(o.happened_at, o.received_at) AS at, o.received_at, o.staff_ref,
              o.kind, o.step, o.counted, o.status, o.reason, o.body
       FROM uklad.desk_ops o
       WHERE o.org_id = uklad.current_org() AND o.warehouse_ref = $1
     ), picks AS (
       SELECT * FROM ops
       WHERE kind IN ('pick_unit', 'pick_done') AND body->>'requestId' = ANY ($2::text[])
         AND at <= $5
     ), tote AS (
       SELECT coalesce($3::text, (SELECT body->>'toteId' FROM picks
                                  WHERE kind = 'pick_unit' ORDER BY at DESC LIMIT 1)) AS id
     ), packs AS (
       SELECT o.* FROM ops o, tote t
       WHERE o.kind = 'pack_event' AND o.body->>'toteId' = t.id AND o.at <= $5
         AND o.at >= coalesce((SELECT min(at) FROM picks), $5 - interval '1 day')
         AND (NOT o.body ? 'orderId' OR o.body->>'orderId' = ANY ($2::text[]))
     ), sorted AS (
       -- Раскладка, которую потом не вынули (sort_undo).
       SELECT * FROM ops s
       WHERE s.kind = 'sort_place' AND s.body->>'outboundCode' = $4 AND s.at >= $5
         AND NOT EXISTS (SELECT 1 FROM ops u WHERE u.kind = 'sort_undo'
                         AND u.body->>'outboundCode' = $4 AND u.at >= s.at)
       ORDER BY s.at LIMIT 1
     ), closed AS (
       SELECT o.* FROM ops o, sorted s
       WHERE o.kind = 'sort_close' AND o.body->>'sortCode' = s.body->>'sortCode' AND o.at >= s.at
       ORDER BY o.at LIMIT 1
     ), shipped AS (
       SELECT * FROM ops
       WHERE kind = 'ship_run' AND at >= $6 AND jsonb_typeof(body->'requestIds') = 'array'
         AND body->'requestIds' ?| $2::text[]
       ORDER BY at LIMIT 1
     ), placed AS (
       -- Короб, положенный в ячейку до того, как из неё взяли товар заказа.
       SELECT DISTINCT ON (p.body->'cell') r.* FROM picks p
       JOIN ops r ON r.kind = 'recv_place' AND r.body->'cell' = p.body->'cell' AND r.at <= p.at
       WHERE p.kind = 'pick_unit' AND p.body ? 'cell'
       ORDER BY p.body->'cell', r.at DESC
     ), received AS (
       -- Приёмка этого товара в тот короб (или прямо в тару упаковки — кроссдок).
       SELECT DISTINCT ON (r.body->>'boxId', r.body->>'productId') r.* FROM ops r
       WHERE r.kind = 'recv_unit' AND r.at <= $5
         AND r.body->>'productId' IN (SELECT body->>'productId' FROM picks
                                      UNION SELECT unnest($7::text[]))
         AND r.body->>'boxId' IN (SELECT body->>'boxId' FROM placed UNION SELECT id FROM tote)
       ORDER BY r.body->>'boxId', r.body->>'productId', r.at DESC
     )
     SELECT * FROM (
       SELECT * FROM received UNION ALL SELECT * FROM placed UNION ALL SELECT * FROM picks
       UNION ALL SELECT * FROM packs UNION ALL SELECT * FROM ops WHERE id = $8
       UNION ALL SELECT * FROM sorted UNION ALL SELECT * FROM closed
       UNION ALL SELECT * FROM shipped
     ) x
     ORDER BY at, id
     LIMIT 500`,
    [
      wh.id,
      seed.requestIds,
      seed.toteId,
      seed.outboundCode,
      seed.until,
      seed.shipFrom,
      seed.products,
      seed.id,
    ],
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).getTime(),
    receivedAt: new Date(r.received_at).getTime(),
    source: "desk",
    staffRef: r.staff_ref,
    kind: r.kind,
    step: r.step,
    counted: r.counted,
    flagged: r.status === "flagged",
    ...(r.reason ? { reason: r.reason } : {}),
    refs: refsOf(r.body ?? {}),
  }));
}

/** С чего начать ленту: посылка по id операции или заказ, ещё без посылки. */
async function seedOf(c, wh, url) {
  const p = url.searchParams;
  const parcel = p.get("parcel");
  const order = p.get("order");
  if (given(parcel) && ID_RE.test(parcel)) {
    const { rows } = await c.query(
      `SELECT id, coalesce(happened_at, received_at) AS at, body FROM uklad.desk_ops
       WHERE org_id = uklad.current_org() AND warehouse_ref = $1 AND id = $2
         AND kind = 'pack_done'`,
      [wh.id, parcel],
    );
    const r = rows[0];
    if (!r) return null;
    const lines = Array.isArray(r.body.lines) ? r.body.lines : [];
    return {
      id: r.id,
      requestIds: strings(r.body.requestIds).slice(0, LIST_MAX),
      toteId: typeof r.body.toteId === "string" ? r.body.toteId : null,
      outboundCode: typeof r.body.outboundCode === "string" ? r.body.outboundCode : null,
      until: r.at,
      shipFrom: r.at,
      products: strings(lines.map((l) => l?.productId)),
    };
  }
  if (given(order) && REF_RE.test(order)) {
    return {
      id: null,
      requestIds: [order],
      toteId: null,
      outboundCode: null,
      until: new Date(Date.now() + DAY_MS),
      shipFrom: new Date(0),
      products: [],
    };
  }
  return undefined;
}

function createGoodsPath({ auth, send, log }) {
  const { withSession } = auth;

  const guarded = (body) => async (req, res, url) => {
    const asked = url.searchParams.get("warehouse");
    if (given(asked) && !REF_RE.test(asked)) return send(res, 400, { ok: false });
    const out = await withSession(req, async (c, ctx) => {
      if (!mayRead(ctx)) return { status: 403 };
      const wh = await journalPlace(c, ctx, given(asked) ? asked : null);
      if (!wh) return { status: 403, error: "no_warehouse" };
      return body(c, wh, url);
    });
    if (out === null) return send(res, 401, { ok: false });
    const { status, error, ...rest } = out;
    if (status !== 200) return send(res, status, { ok: false, ...(error ? { error } : {}) });
    return send(res, 200, { ok: true, ...rest });
  };

  const routes = {
    "GET /api/cabinet/goods-path": guarded(async (c, wh, url) => {
      const s = readSearch(url);
      if (!s) return { status: 400, error: "bad_request" };
      return { status: 200, warehouse: wh.id, matches: await findParcels(c, wh, s) };
    }),
    "GET /api/cabinet/goods-path/steps": guarded(async (c, wh, url) => {
      const seed = await seedOf(c, wh, url);
      if (seed === undefined) return { status: 400, error: "bad_request" };
      if (seed === null) return { status: 404 };
      return { status: 200, warehouse: wh.id, events: await pathSteps(c, wh, seed) };
    }),
  };

  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой пути товара:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createGoodsPath, readSearch };
