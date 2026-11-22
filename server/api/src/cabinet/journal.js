/**
 * Журнал действий склада (миграция 044): всё, что делали на складе, по
 * секундам — для разбора спорного и, позже, для сверки с камерами.
 *
 * Два источника, одна лента новых сверху:
 *   · операции столов склада (`uklad.desk_ops`): каждый скан, этикетка,
 *     отметка смены, отказ сервера — с сотрудником, устройством, типом скана
 *     (`step`) и признаком «пик за единицу работы» (`counted`);
 *   · правки руководителя в кабинете (`uklad.stock_moves` с `member_id`):
 *     одна запись снимка — одно действие со списком движений товара;
 *   · действия руководителей помимо товара (`uklad.audit_events`, 062):
 *     роли, люди, подключения, удаление товаров — процесс `admin`.
 *
 * Смотреть — право «Персонал: смотреть» (`staff.view`) или «Персонал»
 * (`staff.manage`): по журналу видно, кто когда и как работал. Склад — только
 * свой: смотрящему — его склад (миграция 034), руководителю — тот, что он
 * назвал, если он есть в компании. Просмотр экранов в журнал не пишется: это
 * шум, а не действие.
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { warehousesOf, placeRef } = require("./viewerPlace");
const { withWarehouses } = require("./warehouses");
const { auditRows } = require("./audit");

const REF_RE = /^[A-Za-z0-9_.:#/-]{1,200}$/;
const STEPS = new Set([
  "receive",
  "place",
  "pick",
  "pack",
  "label",
  "sort",
  "ship",
  "inventory",
  "dispute",
  "shift",
  "cabinet",
  // Действия руководителей (`audit.js`, миграция 062): только по прямому
  // запросу, пока экран журнала их не показывает.
  "admin",
]);
const PAGE = 100;
/** Движений в одной правке наружу: первое создание кабинета их тысячи. */
const MOVES_PER_EDIT = 50;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const given = (v) => v !== null && v !== "";
const refOrNull = (v) => (typeof v === "string" && REF_RE.test(v) ? v : null);
const msOrNull = (v) => {
  const n = Number(v);
  return given(v) && Number.isFinite(n) && n > 0 ? new Date(n) : null;
};

/** Фильтры из адреса. Не похоже на фильтр — `null` (400), а не молчаливое «без фильтра». */
function readFilters(url) {
  const p = url.searchParams;
  const raw = Object.fromEntries(
    ["warehouse", "before", "since", "staff", "product", "place"].map((k) => [k, p.get(k)]),
  );
  const out = {
    warehouse: refOrNull(raw.warehouse),
    before: msOrNull(raw.before),
    since: msOrNull(raw.since),
    staff: refOrNull(raw.staff),
    product: refOrNull(raw.product),
    place: refOrNull(raw.place),
    errors: p.get("errors") === "1",
    steps: null,
  };
  for (const k of Object.keys(raw)) {
    if (given(raw[k]) && out[k] === null) return null;
  }
  const steps = (p.get("steps") ?? "").split(",").filter(Boolean);
  if (steps.some((s) => !STEPS.has(s))) return null;
  if (steps.length) out.steps = steps;
  return out;
}

/** Склад, чей журнал отдаём, или `null` — нельзя. */
async function journalPlace(c, ctx, asked) {
  const { rows } = await c.query(
    `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
  );
  if (!rows[0]) return null;
  // Склады — строками (миграция 051), в старом документе — в нём самом.
  const full = await withWarehouses(c, rows[0].data);
  const doc = { warehouse: full.warehouse, otherWarehouses: list(full.otherWarehouses) };
  const all = warehousesOf(doc);
  // Весь журнал компании — владельцу; остальные, и руководитель тоже, —
  // только свой склад (Кирилл 22.11).
  if (ctx.can("org.manage")) {
    const ref = asked ?? (all.length === 1 ? all[0].id : null);
    return all.find((w) => w.id === ref) ?? null;
  }
  // Смотрящий — только на своём складе: чужой склад компании не открыть,
  // даже назвав его.
  const place = (await c.query(`SELECT * FROM auth.actor_place()`)).rows[0] ?? null;
  const own = placeRef(doc, place?.warehouse_ref);
  if (!own || (asked && asked !== own)) return null;
  return all.find((w) => w.id === own) ?? null;
}

async function deskRows(c, wh, f, limit) {
  const { rows } = await c.query(
    `SELECT * FROM auth.warehouse_journal($1, $2, $3, $4, $5::text[], $6, $7, $8, $9)`,
    [wh.id, f.before, f.since, f.staff, f.steps, f.product, f.place, f.errors, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    at: new Date(r.at).getTime(),
    // Время сервера — рядом: часы ТСД могут врать, а для камер нужна правда.
    receivedAt: new Date(r.received_at).getTime(),
    source: "desk",
    staffRef: r.staff_ref,
    device: { ref: r.device_ref, name: r.device_name },
    kind: r.kind,
    step: r.step,
    counted: r.counted,
    flagged: r.status === "flagged",
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.refs && Object.keys(r.refs).length ? { refs: r.refs } : {}),
  }));
}

/**
 * Правки руководителя: движения одной записи снимка — одна строка. Ячейка
 * своего склада не знает (`placements` общие), её склад — по этажу адреса.
 */
async function cabinetRows(c, wh, f, limit) {
  if (f.errors) return [];
  if (f.steps && !f.steps.includes("cabinet")) return [];
  const floors = list(wh.floors)
    .map((x) => (isObject(x) && typeof x.id === "string" ? x.id : null))
    .filter(Boolean);
  const { rows } = await c.query(
    `SELECT max(m.at) AS at, m.member_id, m.snapshot_version,
            max(mem.display_name) AS name, max(mem.staff_ref) AS staff_ref,
            count(*)::int AS n,
            jsonb_agg(jsonb_build_object('kind', m.place_kind, 'ref', m.place_ref,
                                         'productId', m.product_ref, 'delta', m.delta)
                      ORDER BY m.place_kind, m.place_ref, m.product_ref) AS moves
     FROM uklad.stock_moves m
     LEFT JOIN uklad.members mem ON mem.org_id = m.org_id AND mem.id = m.member_id
     WHERE m.org_id = uklad.current_org() AND m.member_id IS NOT NULL
       AND (m.warehouse_ref = $1
            OR (m.warehouse_ref IS NULL AND m.place_kind = 'cell'
                AND split_part(m.place_ref, '/', 1) = ANY ($2::text[])))
       AND ($3::timestamptz IS NULL OR m.at <= $3)
       AND ($4::timestamptz IS NULL OR m.at >= $4)
       AND ($5::text IS NULL OR m.product_ref = $5)
       AND ($6::text IS NULL OR m.place_ref = $6 OR m.place_ref LIKE '%#' || $6)
       AND ($7::text IS NULL OR mem.staff_ref = $7)
     GROUP BY m.member_id, m.snapshot_version
     ORDER BY 1 DESC
     LIMIT $8`,
    [wh.id, floors, f.before, f.since, f.product, f.place, f.staff, limit],
  );
  return rows.map((r) => ({
    id: `v${r.snapshot_version}-${r.member_id}`,
    at: new Date(r.at).getTime(),
    receivedAt: new Date(r.at).getTime(),
    source: "cabinet",
    staffRef: r.staff_ref ?? null,
    member: { id: r.member_id, name: r.name ?? null },
    kind: "cabinet_edit",
    step: "cabinet",
    counted: false,
    flagged: false,
    moves: list(r.moves).slice(0, MOVES_PER_EDIT),
    movesTotal: r.n,
  }));
}

/**
 * Действия руководителей склада. Действия компании без склада (реквизиты,
 * роли компании) — только владельцу. Фильтры по товару, месту и сотруднику
 * у стола к ним не относятся: с ними — пусто, как у правок кабинета с ошибкой.
 */
async function adminRows(c, ctx, wh, f, limit) {
  if (!f.steps?.includes("admin")) return [];
  if (f.errors || f.product || f.place || f.staff) return [];
  const company = ctx.can("org.manage");
  return auditRows(c, wh.id, { before: f.before, since: f.since, company, limit });
}

// Владелец держит все права, в том числе продавца, — поэтому «Персонал»
// открывает журнал сам, а продавцу без него журнал склада не положен.
const mayRead = (ctx) =>
  Boolean(ctx.accountId) &&
  (ctx.can("staff.manage") || (ctx.can("staff.view") && !ctx.can("seller.requests")));

function createJournal({ auth, send, log }) {
  const { withSession } = auth;

  async function read(req, res, url) {
    const f = readFilters(url);
    if (!f) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!mayRead(ctx)) return { status: 403 };
      const wh = await journalPlace(c, ctx, f.warehouse);
      if (!wh) return { status: 403, error: "no_warehouse" };
      const desk = await deskRows(c, wh, f, PAGE);
      const cabinet = await cabinetRows(c, wh, f, PAGE);
      const admin = await adminRows(c, ctx, wh, f, PAGE);
      // Ленты по `PAGE` новых сверху — слить и отрезать `PAGE`: всё, что
      // старше последней отданной, придёт следующей страницей.
      const merged = [...desk, ...cabinet, ...admin].sort((a, b) => b.at - a.at);
      const entries = merged.slice(0, PAGE);
      const more = [desk, cabinet, admin].some((x) => x.length === PAGE) || merged.length > PAGE;
      return { status: 200, entries, warehouse: wh.id, more };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) {
      return send(res, out.status, { ok: false, ...(out.error ? { error: out.error } : {}) });
    }
    return send(res, 200, {
      ok: true,
      warehouse: out.warehouse,
      entries: out.entries,
      // Следующая страница — `before` = время последней строки (включительно:
      // строки той же миллисекунды не теряются, повтор отсеивается по id).
      next: out.more && out.entries.length ? out.entries.at(-1).at : null,
    });
  }

  const routes = { "GET /api/cabinet/journal": read };

  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      log.error("[uklad] сбой журнала действий:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createJournal, readFilters, journalPlace, mayRead };
