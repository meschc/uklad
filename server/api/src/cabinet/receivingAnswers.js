/**
 * Ответ продавца на акт расхождений приёмки (миграция 048, Кирилл 17.11).
 *
 *   GET  /api/receiving/answers          — ответы по складу (продавцу — свои)
 *   POST /api/receiving/answers          — продавец: { shipmentId, answer, comment }
 *   POST /api/receiving/answers/resolve  — старший: { shipmentId, partnerId, resolution, reply }
 *
 * Продавец отвечает один раз и только на свою закрытую поставку, пока не
 * вышли трое суток после закрытия: дальше молчание — согласие. Свою ли
 * поставку, сервер проверяет по тому же виду кабинета, что отдаёт продавцу
 * (`forSeller`): поставка без его строк для него не существует.
 * Возражение решает старший склада поставки (`goods.decide`): «учёт верный»
 * с ответом или «пересчитаем».
 */
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { loadCabinet } = require("./snapshot");
const { placeRef, focusWarehouse } = require("./viewerPlace");
const { withWarehouses } = require("./warehouses");
const { forSeller } = require("./seller");
const { GOODS_DECIDE } = require("./deskPerms");

const DAY_MS = 24 * 3_600_000;
/** Сколько суток после закрытия поставки продавец может ответить. */
const ANSWER_DAYS = 3;
const MAX_TEXT = 1000;
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const ANSWERS = new Set(["agree", "dispute"]);
const RESOLUTIONS = new Set(["kept", "recount"]);
const READ_PERMS = ["goods.view", GOODS_DECIDE, "staff.manage"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Можно ли ещё отвечать на поставку: `null` — можно, иначе ключ отказа.
 * Поставку уже нашли среди своих (`forSeller`), здесь — только срок.
 */
function answerProblem(shipment, now) {
  if (!isObject(shipment)) return "not_found";
  if (shipment.status !== "closed") return "not_closed";
  const closedAt = Number(shipment.closedAt ?? shipment.createdAt) || 0;
  if (now > closedAt + ANSWER_DAYS * DAY_MS) return "late";
  return null;
}

/** Тело ответа продавца → запись или `null` (400). */
function readAnswer(b) {
  if (!isObject(b) || typeof b.shipmentId !== "string" || !ID_RE.test(b.shipmentId)) return null;
  if (!ANSWERS.has(b.answer)) return null;
  const comment = text(b.comment);
  if (comment.length > MAX_TEXT) return null;
  if (b.answer === "dispute" && !comment) return null;
  return { shipmentId: b.shipmentId, answer: b.answer, comment: comment || null };
}

/** Тело решения старшего → запись или `null` (400). */
function readResolve(b) {
  if (!isObject(b) || typeof b.shipmentId !== "string" || !ID_RE.test(b.shipmentId)) return null;
  if (typeof b.partnerId !== "string" || !ID_RE.test(b.partnerId)) return null;
  if (!RESOLUTIONS.has(b.resolution)) return null;
  const reply = text(b.reply);
  if (!reply || reply.length > MAX_TEXT) return null;
  return { shipmentId: b.shipmentId, partnerId: b.partnerId, resolution: b.resolution, reply };
}

const ms = (v) => (v ? new Date(v).getTime() : undefined);

/** Строка таблицы → ответ для браузера. Кто ответил — не нужно: продавец партнёра. */
function toAnswer(r) {
  return {
    shipmentId: r.shipment_ref,
    partnerId: r.partner_ref,
    answer: r.answer,
    ...(r.comment ? { comment: r.comment } : {}),
    answeredAt: ms(r.answered_at),
    ...(r.resolution
      ? { resolution: r.resolution, reply: r.reply, resolvedAt: ms(r.resolved_at) }
      : {}),
  };
}

function createReceivingAnswers({ auth, send, log, now = () => Date.now() }) {
  const { withSession, readJson } = auth;

  const place = async (c) => (await c.query(`SELECT * FROM auth.actor_place()`)).rows[0] ?? null;
  const snapshotDoc = async (c) => {
    const { rows } = await c.query(
      `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
    );
    return rows[0] ? withWarehouses(c, rows[0].data) : null;
  };
  const sellerOf = (p) => (typeof p?.partner_ref === "string" ? p.partner_ref : null);

  async function list(req, res) {
    const out = await withSession(req, async (c, ctx) => {
      const p = ctx.accountId ? await place(c) : null;
      const seller = sellerOf(p);
      if (!seller && !READ_PERMS.some((x) => ctx.can(x))) return { status: 403 };
      // Продавец и человек склада — только свой склад (без закрепления — единственный
      // склад компании); все склады — только тому, кто ведёт персонал всей компании.
      const all = !seller && ctx.can("staff.manage") && !p?.warehouse_ref;
      const wh = all ? null : placeRef(await snapshotDoc(c), p?.warehouse_ref);
      if (!all && !wh) return { status: 200, rows: [] };
      const { rows } = await c.query(
        `SELECT * FROM uklad.receiving_answers
         WHERE org_id = uklad.current_org()
           AND ($1::text IS NULL OR warehouse_ref = $1)
           AND ($2::text IS NULL OR partner_ref = $2)
         ORDER BY answered_at DESC
         LIMIT 500`,
        [wh ?? null, seller],
      );
      return { status: 200, rows };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false });
    return send(res, 200, { ok: true, answers: out.rows.map(toAnswer) });
  }

  async function answer(req, res) {
    const raw = await readJson(req, res);
    if (!raw) return;
    const b = readAnswer(raw);
    if (!b) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      const p = ctx.accountId ? await place(c) : null;
      const seller = sellerOf(p);
      if (!seller) return { status: 403 };
      const doc = await snapshotDoc(c);
      const wh = doc ? placeRef(doc, p.warehouse_ref) : null;
      const focused = wh ? focusWarehouse(await loadCabinet(c, doc), wh) : null;
      if (!focused) return { status: 404, error: "not_found" };
      const mine = forSeller(focused, seller).expectedShipments.find((s) => s.id === b.shipmentId);
      const problem = answerProblem(mine, now());
      if (problem) return { status: problem === "not_found" ? 404 : 409, error: problem };
      const { rows } = await c.query(
        `INSERT INTO uklad.receiving_answers
           (org_id, warehouse_ref, shipment_ref, partner_ref, answer, comment, answered_by)
         VALUES (uklad.current_org(), $1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [wh, b.shipmentId, seller, b.answer, b.comment, ctx.memberId],
      );
      if (!rows[0]) return { status: 409, error: "answered" };
      return { status: 200, row: rows[0] };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false, error: out.error });
    return send(res, 200, { ok: true, answer: toAnswer(out.row) });
  }

  async function resolve(req, res) {
    const raw = await readJson(req, res);
    if (!raw) return;
    const b = readResolve(raw);
    if (!b) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.can(GOODS_DECIDE)) return { status: 403 };
      const p = ctx.accountId ? await place(c) : null;
      if (sellerOf(p)) return { status: 403 };
      const { rows: me } = await c.query(
        `SELECT warehouse_ref, staff_ref FROM uklad.members
         WHERE org_id = uklad.current_org() AND id = $1`,
        [ctx.memberId],
      );
      const by = me[0]?.staff_ref ?? `member:${ctx.memberId}`;
      const { rows } = await c.query(
        `UPDATE uklad.receiving_answers
         SET resolution = $3, reply = $4, resolved_by = $5, resolved_at = now()
         WHERE org_id = uklad.current_org() AND shipment_ref = $1 AND partner_ref = $6
           AND ($2::text IS NULL OR warehouse_ref = $2)
           AND answer = 'dispute' AND resolved_at IS NULL
         RETURNING *`,
        [b.shipmentId, me[0]?.warehouse_ref ?? null, b.resolution, b.reply, by, b.partnerId],
      );
      if (!rows[0]) return { status: 409, error: "resolved" };
      return { status: 200, row: rows[0] };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false, error: out.error });
    return send(res, 200, { ok: true, answer: toAnswer(out.row) });
  }

  const routes = {
    "GET /api/receiving/answers": list,
    "POST /api/receiving/answers": answer,
    "POST /api/receiving/answers/resolve": resolve,
  };

  async function handle(req, res, url) {
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return false;
    try {
      await route(req, res, url);
    } catch (err) {
      // Отказ продавцу на чужой маршрут (`SellerForbidden`, #167) — 403, а не сбой.
      if (err.httpStatus) {
        if (!res.headersSent) send(res, err.httpStatus, { ok: false });
        return true;
      }
      log.error("[uklad] сбой ответа на акт приёмки:", err.message);
      if (!res.headersSent) send(res, 500, { ok: false });
    }
    return true;
  }

  return { handle };
}

module.exports = { createReceivingAnswers, answerProblem, readAnswer, readResolve, ANSWER_DAYS };
