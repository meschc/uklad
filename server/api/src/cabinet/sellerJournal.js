/**
 * История своего товара для продавца (п. 2.1г «До запуска», 28.11).
 *
 *   GET /api/seller/journal?product=<id>&before=<мс>
 *
 * Тот же журнал, что у склада (`journal.js`): операции столов
 * (`auth.warehouse_journal`) и правки остатка в кабинете (`stock_moves`), но
 * только по одному своему товару и без людей:
 *   · товар — свой и на своём складе (`forSeller`); чужой и несуществующий
 *     отвечают одинаково (`not_found`), чтобы не угадывать;
 *   · кто делал — нет: ни сотрудника, ни устройства, ни человека кабинета
 *     (вопрос 1 треда 28.11 — рекомендация: продавцу «Склад»);
 *   · отклонённые сервером сканы — нет: учёта они не коснулись;
 *   · штуки и ячейка — только если операция про этот товар, а не про тару
 *     с ним: в общей таре чужие строки продавцу не видны;
 *   · правка остатка складом — да, только движения этого товара (вопрос 2).
 *
 * Сессия продавца пускается сюда явно (`auth.js`, `sellerMay`).
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { loadCabinet } = require("./snapshot");
const { placeRef, focusWarehouse } = require("./viewerPlace");
const { forSeller } = require("./seller");
const { deskRows, cabinetRows } = require("./journal");
const { createRateLimit } = require("../rateLimit");
const { createHmac, randomBytes } = require("node:crypto");

const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const PAGE = 100;
/** Запросов в минуту на человека: каждый читает снимок компании целиком. */
const PER_MINUTE = 60;
/** Шаги склада, которые двигают товар или говорят о нём. */
const STEPS = ["receive", "place", "pick", "pack", "label", "sort", "ship", "inventory", "dispute"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/** Фильтры из адреса или `null` (400). */
function readQuery(url) {
  const product = url.searchParams.get("product") ?? "";
  const raw = url.searchParams.get("before");
  if (!ID_RE.test(product)) return null;
  if (raw === null || raw === "") return { product, before: null };
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? { product, before: new Date(n) } : null;
}

/**
 * Строка в форме журнала склада (`ActivityEntry` кабинета), чтобы экран
 * подписывал её теми же словами, — но без людей и устройств.
 */
const entry = (r, source, rest) => ({
  id: r.id,
  at: r.at,
  receivedAt: r.at,
  source,
  staffRef: null,
  counted: false,
  flagged: false,
  ...rest,
});

/** Операция стола глазами продавца. */
function deskEntry(r, product) {
  const refs = isObject(r.refs) ? r.refs : {};
  const about = refs.productId === product;
  const qty = Number(refs.qty);
  return entry(r, "desk", {
    kind: r.kind,
    step: r.step,
    refs: {
      ...(typeof refs.type === "string" ? { type: refs.type } : {}),
      productId: product,
      ...(about && Number.isFinite(qty) ? { qty } : {}),
      ...(about && isObject(refs.cell) ? { cell: refs.cell } : {}),
    },
  });
}

/**
 * Соль id правок на время жизни сервера (разбор «Безопасности продукта»
 * 28.11): id строки журнала склада — `v<версия>-<id человека>`, и продавцу он
 * выдал бы постоянную метку человека склада. Хэш с солью сервера стабилен
 * между страницами одной сессии, но человека по нему не узнать.
 */
const SALT = randomBytes(32);
const cabinetId = (id) =>
  `c${createHmac("sha256", SALT).update(String(id)).digest("base64url").slice(0, 22)}`;

/** Правка остатка складом: только движения этого товара, без человека. */
function cabinetEntry(r, product) {
  const moves = list(r.moves)
    .filter((m) => isObject(m) && m.productId === product)
    .map((m) => ({ kind: m.kind, ref: m.ref, productId: product, delta: m.delta }));
  return entry({ ...r, id: cabinetId(r.id) }, "cabinet", {
    kind: "cabinet_edit",
    step: "cabinet",
    moves,
  });
}

/** Ленты новых сверху → одна страница и граница следующей. */
function page(desk, cabinet, product) {
  const merged = [
    ...desk.filter((r) => !r.flagged).map((r) => deskEntry(r, product)),
    ...cabinet.map((r) => cabinetEntry(r, product)).filter((e) => e.moves.length > 0),
  ].sort((a, b) => b.at - a.at);
  const entries = merged.slice(0, PAGE);
  const more = desk.length === PAGE || cabinet.length === PAGE || merged.length > PAGE;
  return { entries, next: more && entries.length ? entries.at(-1).at : null };
}

function createSellerJournal({ auth, send, log, now = () => Date.now() }) {
  const { withSession } = auth;
  const limiter = createRateLimit({ capacity: PER_MINUTE, refillPerMinute: PER_MINUTE, now });

  async function read(req, res, url) {
    const q = readQuery(url);
    if (!q) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      const p = ctx.accountId ? (await c.query(`SELECT * FROM auth.actor_place()`)).rows[0] : null;
      const seller = typeof p?.partner_ref === "string" ? p.partner_ref : null;
      if (!seller) return { status: 403 };
      if (!limiter.take(`${ctx.orgId}:${ctx.memberId}`)) return { status: 429, error: "rate" };
      const { rows } = await c.query(
        `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
      );
      if (!rows[0]) return { status: 403, error: "no_warehouse" };
      const full = await loadCabinet(c, rows[0].data);
      const ref = placeRef(full, p.warehouse_ref);
      const view = ref ? focusWarehouse(full, ref) : null;
      if (!view) return { status: 403, error: "no_warehouse" };
      const mine = forSeller(view, seller);
      if (!list(mine.products).some((x) => isObject(x) && x.id === q.product)) {
        return { status: 404, error: "not_found" };
      }
      const wh = view.warehouse;
      const f = {
        before: q.before,
        since: null,
        staff: null,
        steps: STEPS,
        product: q.product,
        place: null,
        errors: false,
      };
      const desk = await deskRows(c, wh, f, PAGE);
      const cabinet = await cabinetRows(c, wh, { ...f, steps: null }, PAGE);
      return { status: 200, ...page(desk, cabinet, q.product) };
    });
    if (out === null) return send(res, 401, { ok: false });
    const { status, ...rest } = out;
    return send(res, status, { ok: status === 200, ...rest });
  }

  async function handle(req, res, url) {
    if (req.method !== "GET" || url.pathname !== "/api/seller/journal") return false;
    try {
      await read(req, res, url);
    } catch (err) {
      if (err.httpStatus) {
        if (!res.headersSent) send(res, err.httpStatus, { ok: false });
        return true;
      }
      log.error("[uklad] история товара продавца:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createSellerJournal, readQuery, deskEntry, cabinetEntry, page };
