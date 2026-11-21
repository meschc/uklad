/**
 * Ярлык площадки на столе упаковки (шаг 6 `docs/domain/fbs.md`).
 *
 *   POST /api/desk/platform-label — { requestId } → { mime, file } (PDF, base64)
 *
 * Без ярлыка площадки посылку FBS не примут. Ярлык дают только после
 * «собран» (#222): Ozon — для «Ожидает отгрузки», Маркет — для
 * `READY_TO_SHIP`, WB — для задания в поставке (`confirm`). Стол сам ключ площадки не видит: сервер находит
 * подключение заявки (площадка, партнёр товара, склад стола), расшифровывает
 * ключ и спрашивает ярлык. Запрос к площадке — вне транзакции.
 *
 * Чужое не отдаётся: заявка — со склада этого стола (`deskPlace`), собранная,
 * не отменённая, заказ площадки; подключение — этой компании (RLS) и того же
 * партнёра. Номер заказа в путь не подставляется — только в тело (Ozon) или
 * цифрами (Маркет). На ярлыке имя получателя и город, поэтому его дают только
 * при человеке за столом с правом на упаковку — как операции упаковки
 * (`deskOps.js`); стол без человека получает 409 `no_staff`.
 */
/* global require, module */
/* eslint-disable @typescript-eslint/no-require-imports */
const { allowed, askPlatform, createSealer } = require("./connectors");
const { deskPlace } = require("./deskPlace");
const { may, loadDeskPerms } = require("./deskPerms");
const { loadCabinet } = require("./snapshot");
const { createRateLimit } = require("../rateLimit");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

/**
 * Запрос ярлыка к площадке для номера заказа или `null`. `file(data)` достаёт
 * ярлык из ответа, `mime` — что это: Ozon и Маркет отдают PDF, WB — картинку
 * (PDF у WB нет; PNG 58×40 мм — лента стола).
 */
const pdfFile = (data) => data?.file;
const LABEL = {
  ozon: (externalId) => ({
    method: "POST",
    path: "/v2/posting/fbs/package-label",
    body: { posting_number: [externalId] },
  }),
  // Стикер WB — только для задания в поставке (`confirm`), см. `assembleWb`.
  wildberries: (externalId) =>
    /^\d{1,20}$/.test(externalId)
      ? {
          method: "POST",
          path: "/api/v3/orders/stickers",
          qs: "?type=png&width=58&height=40",
          body: { orders: [Number(externalId)] },
          mime: "image/png",
          file: (data) => {
            const st = list(data?.stickers).find((x) => String(x?.orderId) === externalId);
            return st?.file;
          },
        }
      : null,
  "yandex-market": (externalId) =>
    /^\d{1,20}$/.test(externalId)
      ? { method: "GET", path: `/v2/campaigns/{campaignId}/orders/${externalId}/delivery/labels` }
      : null,
};

/** Подключение заявки: та же площадка, тот же партнёр, склад стола или любой. */
function connectionFor(rows, partnerId, warehouseRef) {
  const fit = rows.filter((r) => {
    const p = isObject(r.params) ? r.params : {};
    return (
      (p.partnerId ?? null) === partnerId && (!p.warehouseId || p.warehouseId === warehouseRef)
    );
  });
  return fit.length === 1 ? fit[0] : null;
}

// То же право, что у операций упаковки (`OP_PERM` в `deskOps.js`).
const PACK_PERM = "packing.do";

function createLabelRoutes({
  withDesk,
  deskHash,
  readJson,
  send,
  gone,
  limited,
  log,
  secretKey,
  fetchImpl,
}) {
  const sealer = createSealer(secretKey);
  // Ярлык — раз на посылку; перепечатка и «ещё не готов» — с запасом.
  const perDesk = createRateLimit({ capacity: 20, refillPerMinute: 20 });

  async function platformLabel(req, res) {
    const b = await readJson(req, res, 1024);
    if (!b) return;
    if (typeof b.requestId !== "string" || b.requestId.length > 100)
      return send(res, 400, { ok: false, error: "bad_input" });
    if (!sealer) return send(res, 503, { ok: false, error: "not_configured" });
    const out = await withDesk(req, async (c, d) => {
      if (!perDesk.take(d.deskId)) return { limited: true };
      // Кто за столом сейчас (смена не истекла) и может ли он упаковывать.
      const { rows: at } = await c.query(`SELECT staff_ref FROM auth.desk_staff_times($1)`, [
        deskHash(req),
      ]);
      const staffRef = at[0]?.staff_ref;
      if (!may({ perms: await loadDeskPerms(c, [staffRef]) }, staffRef, PACK_PERM))
        return { error: "no_staff", status: 409 };
      // Заявки лежат строками (ADR 0010) — снимок целиком, как у стола.
      const { rows: snap } = await c.query(
        `SELECT data FROM uklad.cabinet_snapshots WHERE org_id = uklad.current_org()`,
      );
      const place = snap[0] ? deskPlace(await loadCabinet(c, snap[0].data), d.deviceRef) : null;
      if (!place) return { error: "desk_warehouse", status: 409 };
      const r = list(place.data.requests).find((x) => isObject(x) && x.id === b.requestId);
      const make = r && LABEL[r.source];
      if (!make || !r.externalId) return { error: "not_marketplace", status: 404 };
      if (r.status !== "done" && r.status !== "shipped")
        return { error: "not_picked", status: 409 };
      const product = list(place.data.products).find((p) => isObject(p) && p.id === r.productId);
      const partnerId = typeof product?.partnerId === "string" ? product.partnerId : null;
      const { rows } = await c.query(
        `SELECT id, params, secret FROM uklad.connector_accounts
         WHERE system = $1 AND deleted_at IS NULL`,
        [r.source],
      );
      const account = connectionFor(rows, partnerId, place.ref);
      if (!account) return { error: "no_connection", status: 404 };
      return { orgId: d.orgId, system: r.source, externalId: String(r.externalId), account };
    });
    if (!out) return gone(res);
    if (out.limited) return limited(res);
    if (out.error) return send(res, out.status, { ok: false, error: out.error });
    const ask = LABEL[out.system](out.externalId);
    if (!ask || !allowed(out.system, ask.method, ask.path, "server"))
      return send(res, 404, { ok: false, error: "not_marketplace" });
    let key;
    try {
      key = sealer.open(out.account.secret, `${out.orgId}:${out.account.id}`);
    } catch {
      log.error("[uklad] ярлык: ключ не расшифровался", out.account.id);
      return send(res, 500, { ok: false, error: "key" });
    }
    const params = isObject(out.account.params) ? out.account.params : {};
    const { mime = "application/pdf", file: fileOf = pdfFile, ...call } = ask;
    const got = await askPlatform(
      { system: out.system, key, params, log, fetchImpl },
      { ...call, qs: call.qs ?? "" },
    );
    if (!got.ok) {
      // Чаще всего — «ещё не собран» на площадке: стол предложит повторить.
      return send(res, 502, { ok: false, error: got.error, detail: got.detail ?? "" });
    }
    const file = fileOf(got.data);
    // Стикера нет — чаще всего задание ещё не в поставке WB: повторить позже.
    if (typeof file !== "string" || !file) return send(res, 502, { ok: false, error: "upstream" });
    return send(res, 200, { ok: true, mime, file });
  }

  return { "POST /api/desk/platform-label": platformLabel };
}

module.exports = { createLabelRoutes, connectionFor, LABEL };
