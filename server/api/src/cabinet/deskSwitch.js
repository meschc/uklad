/**
 * Смена процесса за столом с подтверждением старшего (миграция 042).
 * Кирилл 15–16.11: на складе в 50 человек сотрудник не должен бесконтрольно
 * переходить с процесса на процесс. Он просит переход на ТСД, старший
 * разрешает у себя в кабинете на странице «Подтверждения», процесс меняет
 * сервер.
 *
 *   POST /api/desk/switch            — стол: { station, from } → { id } заявка
 *   GET  /api/desk/switch?id=        — стол: { status, station, decidedBy }
 *   POST /api/desk/switch/apply      — стол: { id, at } разрешённую — применить
 *   POST /api/desk/switch/cancel     — стол: { id } передумал
 *   GET  /api/cabinet/switch-requests        — кабинет: заявки, ждущие решения
 *        ?status=decided                       — решённые за смену (разрешена, применена, отклонена)
 *   POST /api/cabinet/switch-requests/decide — кабинет: { id, approve }
 *
 * Переход ложится строкой журнала операций стола `station_switch` (кто,
 * откуда, куда, кто разрешил) только при применении. В пачке операций
 * (`/api/desk/ops`) такого вида нет: подделать переход столом нельзя.
 * Последний применённый переход — процесс человека у стола (`stationAt`
 * в `deskOps.js`).
 */

/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */

const { GOODS_DECIDE, may } = require("./deskPerms");

/** Какое право роли открывает процесс — то же, что у операций процесса (`OP_PERM`). */
const STATION_PERM = new Map([
  ["receiving", "receiving.do"],
  ["picking", "picking.do"],
  ["pack", "packing.do"],
  // Сортировка — часть отгрузки: отдельного права у роли нет.
  ["sorting", "shipping.do"],
  ["shipping", "shipping.do"],
  ["inventory", "inventory.count"],
]);

/** Расхождение часов стола и сервера для времени перехода, как `SKEW_MS`. */
const SKEW_MS = 2 * 60 * 1000;
/** Заявка живёт смену: старый «просил вчера» решать незачем. */
const OPEN_FOR = "12 hours";
const UUID_RE = /^[0-9a-f-]{36}$/;

function createSwitchRoutes({
  withDesk,
  withSession,
  readJson,
  send,
  gone,
  limited,
  deskHash,
  checks,
  companyDoc,
}) {
  const { deskPlace } = require("./deskPlace");
  const { loadDeskPerms } = require("./deskPerms");

  /** Кто за столом сейчас и склад стола. */
  async function deskWho(c, req, d) {
    const { rows } = await c.query(`SELECT * FROM auth.desk_staff_times($1)`, [deskHash(req)]);
    const place = deskPlace(await companyDoc(c), d.deviceRef);
    return { worker: rows[0]?.staff_ref ?? null, place };
  }

  /** Сотрудник просит переход: прежняя его заявка с этого стола снимается. */
  async function request(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    const need = STATION_PERM.get(b.station);
    if (!need) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withDesk(req, async (c, d) => {
      if (!checks.take(d.orgId)) return { limited: true };
      const { worker, place } = await deskWho(c, req, d);
      if (!worker) return { error: "nobody" };
      if (!place) return { error: "desk_warehouse" };
      const perms = await loadDeskPerms(c, [worker]);
      if (!may({ perms }, worker, need)) return { error: "not_allowed" };
      await c.query(
        `UPDATE uklad.desk_switch_requests SET status = 'cancelled', decided_at = now()
         WHERE org_id = uklad.current_org() AND desk_id = $1 AND status IN ('pending', 'approved')`,
        [d.deskId],
      );
      const { rows } = await c.query(
        `INSERT INTO uklad.desk_switch_requests
           (org_id, desk_id, warehouse_ref, staff_ref, station, from_station)
         VALUES (uklad.current_org(), $1, $2, $3, $4, $5) RETURNING id`,
        [
          d.deskId,
          place.ref,
          worker,
          b.station,
          typeof b.from === "string" ? b.from.slice(0, 20) : null,
        ],
      );
      return { id: rows[0].id };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (out.error) return send(res, out.error === "not_allowed" ? 403 : 409, out);
    return send(res, 200, { ok: true, id: out.id });
  }

  /** Стол спрашивает, решили ли его заявку. */
  async function status(req, res, url) {
    const id = String(url.searchParams.get("id") ?? "");
    if (!UUID_RE.test(id)) return send(res, 400, { ok: false, error: "bad_request" });
    const out = await withDesk(req, async (c, d) => {
      const { rows } = await c.query(
        `SELECT status, station, decided_by FROM uklad.desk_switch_requests
         WHERE org_id = uklad.current_org() AND desk_id = $1 AND id = $2`,
        [d.deskId, id],
      );
      return { row: rows[0] ?? null };
    });
    if (!out) return gone(res);
    if (!out.row) return send(res, 404, { ok: false });
    return send(res, 200, {
      ok: true,
      status: out.row.status,
      station: out.row.station,
      decidedBy: out.row.decided_by,
    });
  }

  /**
   * Разрешённую заявку стол применяет: с этого момента (по часам стола, как у
   * операций) человек в новом процессе. Только тот же человек за тем же столом.
   */
  async function apply(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (typeof b.id !== "string" || !UUID_RE.test(b.id)) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const out = await withDesk(req, async (c, d) => {
      const { rows: who } = await c.query(`SELECT * FROM auth.desk_staff_times($1)`, [
        deskHash(req),
      ]);
      const worker = who[0]?.staff_ref ?? null;
      const { rows } = await c.query(
        `UPDATE uklad.desk_switch_requests SET status = 'applied', applied_at = now()
         WHERE org_id = uklad.current_org() AND desk_id = $1 AND id = $2
           AND status = 'approved' AND staff_ref = $3
         RETURNING station, from_station, decided_by`,
        [d.deskId, b.id, worker],
      );
      const r = rows[0];
      if (!r) return { error: "not_approved" };
      const now = Date.now();
      const at = Number.isFinite(b.at) && Math.abs(b.at - now) <= SKEW_MS ? b.at : now;
      const body = {
        eventId: b.id,
        at,
        station: r.station,
        ...(r.from_station ? { from: r.from_station } : {}),
        approvedBy: r.decided_by,
      };
      await c.query(
        `INSERT INTO uklad.desk_ops (org_id, op_key, desk_id, staff_ref, kind, body, status,
           happened_at)
         VALUES (uklad.current_org(), $1, $2, $3, 'station_switch', $4::jsonb, 'applied', now())
         ON CONFLICT DO NOTHING`,
        [`switch-${b.id}`, d.deskId, worker, JSON.stringify(body)],
      );
      return { station: r.station, approvedBy: r.decided_by };
    });
    if (!out) return gone(res);
    if (out.error) return send(res, 409, { ok: false, error: out.error });
    return send(res, 200, { ok: true, ...out });
  }

  async function cancel(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (typeof b.id !== "string" || !UUID_RE.test(b.id)) {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const out = await withDesk(req, async (c, d) => {
      await c.query(
        `UPDATE uklad.desk_switch_requests SET status = 'cancelled', decided_at = now()
         WHERE org_id = uklad.current_org() AND desk_id = $1 AND id = $2
           AND status IN ('pending', 'approved')`,
        [d.deskId, b.id],
      );
      return {};
    });
    if (!out) return gone(res);
    return send(res, 200, { ok: true });
  }

  /**
   * Склад и сотрудник того, кто вошёл в кабинет: человек склада видит заявки
   * только своего склада, владелец без склада — все.
   */
  async function memberPlace(c, ctx) {
    const { rows } = await c.query(
      `SELECT warehouse_ref, staff_ref FROM uklad.members
       WHERE org_id = uklad.current_org() AND id = $1`,
      [ctx.memberId],
    );
    return rows[0] ?? { warehouse_ref: null, staff_ref: null };
  }

  /**
   * Заявки, ждущие решения старшего, — страница «Подтверждения». С
   * `?status=decided` — решённые за смену: разрешённая уходила из списка без
   * следа, и старший не видел, применил ли её стол (разбор 27.11).
   */
  async function list(req, res, url) {
    const decided = url?.searchParams?.get("status") === "decided";
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.can(GOODS_DECIDE)) return { status: 403 };
      const me = await memberPlace(c, ctx);
      const { rows } = await c.query(
        decided
          ? `SELECT id, warehouse_ref, staff_ref, station, from_station, requested_at,
                    status, decided_at, decided_by
             FROM uklad.desk_switch_requests
             WHERE org_id = uklad.current_org()
               AND status IN ('approved', 'declined', 'applied')
               AND decided_at > now() - interval '${OPEN_FOR}'
               AND ($1::text IS NULL OR warehouse_ref = $1)
             ORDER BY decided_at DESC
             LIMIT 100`
          : `SELECT id, warehouse_ref, staff_ref, station, from_station, requested_at
             FROM uklad.desk_switch_requests
             WHERE org_id = uklad.current_org() AND status = 'pending'
               AND requested_at > now() - interval '${OPEN_FOR}'
               AND ($1::text IS NULL OR warehouse_ref = $1)
             ORDER BY requested_at`,
        [me.warehouse_ref],
      );
      return { status: 200, rows };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false });
    return send(res, 200, {
      ok: true,
      requests: out.rows.map((r) => ({
        id: r.id,
        warehouseRef: r.warehouse_ref,
        staffRef: r.staff_ref,
        station: r.station,
        from: r.from_station,
        at: new Date(r.requested_at).getTime(),
        ...(decided
          ? {
              status: r.status,
              decidedAt: new Date(r.decided_at).getTime(),
              ...(r.decided_by ? { decidedBy: r.decided_by } : {}),
            }
          : {}),
      })),
    });
  }

  /** Старший разрешает или отклоняет. Решивший — его сотрудник склада или вход. */
  async function decide(req, res) {
    const b = await readJson(req, res);
    if (!b) return;
    if (typeof b.id !== "string" || !UUID_RE.test(b.id) || typeof b.approve !== "boolean") {
      return send(res, 400, { ok: false, error: "bad_request" });
    }
    const out = await withSession(req, async (c, ctx) => {
      if (!ctx.can(GOODS_DECIDE)) return { status: 403 };
      const me = await memberPlace(c, ctx);
      const by = me.staff_ref ?? `member:${ctx.memberId}`;
      const { rows } = await c.query(
        `UPDATE uklad.desk_switch_requests
         SET status = $3, decided_at = now(), decided_by = $4
         WHERE org_id = uklad.current_org() AND id = $1 AND status = 'pending'
           AND requested_at > now() - interval '${OPEN_FOR}'
           AND ($2::text IS NULL OR warehouse_ref = $2)
         RETURNING id`,
        [b.id, me.warehouse_ref, b.approve ? "approved" : "declined", by],
      );
      return { status: rows[0] ? 200 : 404 };
    });
    if (out === null) return send(res, 401, { ok: false });
    if (out.status !== 200) return send(res, out.status, { ok: false });
    return send(res, 200, { ok: true });
  }

  return {
    desk: {
      "POST /api/desk/switch": request,
      "GET /api/desk/switch": status,
      "POST /api/desk/switch/apply": apply,
      "POST /api/desk/switch/cancel": cancel,
    },
    manager: {
      "GET /api/cabinet/switch-requests": list,
      "POST /api/cabinet/switch-requests/decide": decide,
    },
  };
}

module.exports = { createSwitchRoutes, STATION_PERM };
