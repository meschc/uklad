/**
 * Отмена заказа площадкой (шаг 7 `docs/domain/fbs.md`).
 *
 * Покупатель или площадка отменили заказ — склад должен узнать до упаковки,
 * иначе посылку соберут, упакуют и повезут, а площадка её не примет. Сервер в
 * проходе подкачки (`orderPull.js`) спрашивает площадку об отменённых и
 * переводит открытые заявки этих заказов в «отменена». Дальше работает то,
 * что уже есть: сборка такую заявку не показывает, а стол упаковки, если
 * товар уже в таре, пишет «заказ отменён — не упаковывайте, оставьте в таре»
 * (`cancelledInTote`, `packing.ts`).
 *
 * Упакованное (`packedAt`) и уехавшее не трогаем: посылку уже закрыли, её
 * снимает с отгрузки человек.
 *
 * Как спрашиваем (методы сверены по SDK из OpenAPI площадок, 21.11):
 *   · Ozon — `POST /v4/posting/fbs/list`, статус `cancelled`, сменившие статус
 *     за 3 дня (v3 — устаревший);
 *   · WB — `POST /api/v3/orders/status` по номерам открытых заявок:
 *     `supplierStatus: cancel` или `wbStatus` отмены;
 *   · Маркет — `GET /v2/campaigns/{id}/orders?status=CANCELLED`, обновлённые
 *     за 3 дня (`updatedAtFrom`).
 */
/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const norm = (v) =>
  (typeof v === "string" || typeof v === "number" ? String(v) : "").trim().toLowerCase();

/** Сколько назад смотрим отмены: проход раз в 1,5 мин, запас — на простой сервера. */
const LOOKBACK_MS = 3 * 864e5;
const MAX_PAGES = 5;
/** WB принимает до 1000 номеров за запрос. */
const WB_MAX = 1000;
const WB_CANCEL = new Set(["canceled", "canceled_by_client", "declined_by_client"]);

/** Время для Маркета: ISO со смещением Москвы, без миллисекунд. */
const ymTime = (ms) => new Date(ms + 3 * 36e5).toISOString().slice(0, 19) + "+03:00";

/**
 * Запросы об отменах: `first(now, open)` — первая страница или `null`,
 * `next(req, data)` — следующая или `null`, `pick(data)` — номера отменённых.
 */
const CANCELS = {
  ozon: {
    first: (now) => ({
      method: "POST",
      path: "/v4/posting/fbs/list",
      body: {
        filter: {
          since: new Date(now - 30 * 864e5).toISOString(),
          to: new Date(now).toISOString(),
          statuses: ["cancelled"],
          last_changed_status_date: {
            from: new Date(now - LOOKBACK_MS).toISOString(),
            to: new Date(now).toISOString(),
          },
        },
        limit: 100,
        sort_dir: "DESC",
      },
    }),
    next: (req, data) => {
      const d = isObject(data?.result) ? data.result : data;
      return d?.has_next && typeof d.cursor === "string" && d.cursor
        ? { ...req, body: { ...req.body, cursor: d.cursor } }
        : null;
    },
    pick: (data) =>
      list(data?.postings ?? data?.result?.postings)
        .filter((p) => isObject(p) && p.status === "cancelled")
        .map((p) => p.posting_number),
  },
  wildberries: {
    first: (_now, open) => {
      const ids = [...open].filter((x) => /^\d{1,15}$/.test(x)).slice(0, WB_MAX);
      return ids.length
        ? { method: "POST", path: "/api/v3/orders/status", body: { orders: ids.map(Number) } }
        : null;
    },
    next: () => null,
    pick: (data) =>
      list(data?.orders)
        .filter((o) => isObject(o) && (o.supplierStatus === "cancel" || WB_CANCEL.has(o.wbStatus)))
        .map((o) => o.id),
  },
  "yandex-market": {
    first: (now) => ({
      method: "GET",
      path: "/v2/campaigns/{campaignId}/orders",
      query: { status: "CANCELLED", updatedAtFrom: ymTime(now - LOOKBACK_MS), limit: 50 },
    }),
    next: (req, data) => {
      const token = data?.paging?.nextPageToken;
      return typeof token === "string" && token
        ? { ...req, query: { ...req.query, pageToken: token } }
        : null;
    },
    pick: (data) =>
      list(data?.orders)
        .filter((o) => isObject(o) && o.status === "CANCELLED")
        .map((o) => o.id),
  },
};

/**
 * Номера отменённых площадкой заказов среди `open` (нормализованные номера
 * открытых заявок). `ask(req)` — запрос к площадке через белый список.
 * Отказ площадки — `{ ok: false }`: отмен не знаем, заявки не трогаем.
 */
async function fetchCancelled(ask, system, now, open) {
  const spec = CANCELS[system];
  if (!spec || open.size === 0) return { ok: true, ids: new Set() };
  const ids = new Set();
  let req = spec.first(now, open);
  for (let page = 0; req && page < MAX_PAGES; page += 1) {
    const res = await ask(req);
    if (!res.ok) return res;
    for (const x of spec.pick(res.data)) {
      const k = norm(x);
      if (open.has(k)) ids.add(k);
    }
    req = spec.next(req, res.data);
  }
  return { ok: true, ids };
}

/** Заявка ещё может уйти в работу: не отменена, не упакована, не уехала. */
const isOpen = (r) =>
  isObject(r) && r.status !== "cancelled" && r.status !== "shipped" && !r.packedAt;

/**
 * Заявки подключения: та же площадка и товар того же партнёра (`partnerOf`
 * — партнёр товара заявки; `null` — свой товар склада), как у `productsFor`.
 */
const ofConnection = (r, source, partnerOf, partnerId) =>
  r.source === source && (partnerOf ? partnerOf(r.productId) === partnerId : true);

/** Нормализованные номера открытых заявок подключения. */
function openOrders(requests, source, partnerOf, partnerId = null) {
  const out = new Set();
  for (const r of list(requests)) {
    if (isOpen(r) && r.externalId && ofConnection(r, source, partnerOf, partnerId))
      out.add(norm(r.externalId));
  }
  return out;
}

/** Открытые заявки отменённых заказов подключения → «отменена». Чистое правило. */
function cancelRequests(requests, source, ids, at, partnerOf, partnerId = null) {
  let n = 0;
  const next = list(requests).map((r) => {
    if (!isOpen(r) || !ofConnection(r, source, partnerOf, partnerId)) return r;
    if (!ids.has(norm(r.externalId))) return r;
    n += 1;
    return { ...r, status: "cancelled", updatedAt: at };
  });
  return { requests: next, cancelled: n };
}

module.exports = { CANCELS, fetchCancelled, openOrders, cancelRequests, ymTime };
