/**
 * Рейс и решение старшего операциями (миграция 019, `deskOps.js`).
 *
 * `ship_run` — машина уехала: эти заявки, эти места погрузки, этот номер.
 * Сервер сам повторяет `shipRequests`: уезжает только собранное одного
 * назначения, а погруженный короб отгрузки — только свой (как
 * `classifyLoadScan`: чужой и смешанный короб в машину не кладут).
 *
 * `dispute_resolve` — решение старшего по спорному за столом. Сервер сам
 * повторяет `resolveDispute`: кто решает — тот, кто за столом, и только
 * старший; списание — с причиной, не тем, кто нашёл, и не больше, чем лежит
 * в таре (`writeOffProblem`). Списание снимает товар с тары тем же ходом.
 */

/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */

const { GOODS_DECIDE, may } = require("./deskPerms");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const code = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();
const LOAD_RE = /^UK-(BOX|PLT|OUT)-[A-Z0-9-]{1,40}$/;
const target = (r) => String(r.note ?? "").trim();

function applyShipRun(data, body, staffRef) {
  const shipments = list(data.shipments);
  if (shipments.some((s) => s.id === body.eventId)) return { data };
  const ids = Array.isArray(body.requestIds) ? body.requestIds : null;
  const units = Array.isArray(body.units) ? body.units.map(code) : null;
  if (!ids || !units || ids.length === 0 || ids.length > 200 || units.length === 0) {
    return { flag: "bad" };
  }
  if (!ids.every(isId) || units.length > 500 || !units.every((u) => LOAD_RE.test(u))) {
    return { flag: "bad" };
  }
  if (new Set(units).size !== units.length) return { flag: "bad" };
  const vehicle = typeof body.vehicle === "string" ? body.vehicle.trim().slice(0, 20) : "";
  if (!vehicle) return { flag: "bad" };

  const want = new Set(ids);
  const requests = list(data.requests);
  // Уезжает только собранное: «в работе» и «новые» ещё на полках.
  const ready = requests.filter((r) => want.has(r.id) && r.status === "done");
  if (ready.length === 0) return { flag: "stock" };
  // Одна машина — одно назначение.
  if (new Set(ready.map(target)).size > 1) return { flag: "mixed" };

  const outbound = list(data.outboundBoxes);
  const reqsOf = (b) => (Array.isArray(b.requestIds) ? b.requestIds : []);
  const open = outbound.filter((b) => !b.shipmentId);
  const loaded = new Set(units);
  // Тара на хранении (на полке или невскрытое место приёмки) в машину не
  // едет: по документам уехало бы то, что стоит на складе.
  const stored = [...list(data.boxes), ...list(data.pallets)].filter((x) => x.address || x.sealed);
  for (const u of units) {
    if (stored.some((x) => code(x.barcode) === u)) return { flag: "bad" };
    // Уехавший короб второй раз не грузят.
    const isOpen = open.some((b) => code(b.code) === u);
    if (!isOpen && outbound.some((b) => b.shipmentId && code(b.code) === u)) {
      return { flag: "mixed" };
    }
  }
  // Короб другого назначения или с несобранным заказом в машину не кладут.
  const readyIds = new Set(ready.map((r) => r.id));
  for (const b of open) {
    if (loaded.has(code(b.code)) && !reqsOf(b).every((r) => readyIds.has(r))) {
      return { flag: "mixed" };
    }
  }
  // Заявка уезжает, только если все её открытые короба отгрузки в машине
  // (`planLoad`): иначе продавец увидит «Уехало», а короб останется у стола.
  // Остальные ждут следующей машины.
  const leaving = ready.filter((r) =>
    open.every((b) => !reqsOf(b).includes(r.id) || loaded.has(code(b.code))),
  );
  const going = new Set(leaving.map((r) => r.id));
  if (going.size === 0) return { flag: "stock" };
  // Погруженный короб — только свой целиком: чужой и с остающимся заказом не
  // уедет. Короб без заявок — поставка без заказов (FBO), проверить нечем.
  for (const b of open) {
    if (!loaded.has(code(b.code))) continue;
    if (!reqsOf(b).every((r) => going.has(r))) return { flag: "mixed" };
  }

  const at = body.at;
  const shipment = {
    id: body.eventId,
    destination: target(ready[0]),
    requestIds: leaving.map((r) => r.id),
    vehicle,
    staffId: staffRef,
    shippedAt: at,
    units,
  };
  return {
    data: {
      ...data,
      shipments: [shipment, ...shipments],
      outboundBoxes: outbound.map((b) =>
        !b.shipmentId && loaded.has(code(b.code))
          ? { ...b, shipmentId: shipment.id, shippedAt: at, updatedAt: at }
          : b,
      ),
      requests: requests.map((r) =>
        going.has(r.id)
          ? { ...r, status: "shipped", shipmentId: shipment.id, shippedAt: at, updatedAt: at }
          : r,
      ),
    },
  };
}

const WRITES_OFF = new Set(["shortage", "not_packable", "receive_overage"]);
const RESOLUTIONS = new Set(["returned", "moved", "written_off", "accepted"]);

function applyDisputeResolve(data, body, staffRef, who) {
  if (!isId(body.disputeId) || !RESOLUTIONS.has(body.resolution)) return { flag: "bad" };
  const disputes = list(data.disputes);
  const d = disputes.find((x) => x.id === body.disputeId);
  if (!d) return { flag: "bad" };
  if (d.resolution) {
    // Уже решено (пришло снимком) — это то же решение.
    return d.resolution === body.resolution && d.resolvedBy === staffRef
      ? { data }
      : { flag: "bad" };
  }
  // Решение по товару — право роли (`goods.decide`), а не должность.
  if (!may(who, staffRef, GOODS_DECIDE)) return { flag: "not_yours" };
  const overage = d.kind === "receive_overage";
  const allowed = overage ? ["accepted", "written_off"] : ["returned", "moved", "written_off"];
  if (!allowed.includes(body.resolution)) return { flag: "bad" };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  let boxes = data.boxes;
  if (body.resolution === "written_off") {
    // Четыре глаза и причина.
    if (!note || d.raisedBy === staffRef) return { flag: "not_yours" };
    if (WRITES_OFF.has(d.kind)) {
      const box = list(data.boxes).find((b) => b.id === d.boxId);
      const have = list(box?.lines)
        .filter((l) => l.productId === d.productId)
        .reduce((n, l) => n + (Number(l.qty) || 0), 0);
      if (!box || have < (Number(d.qty) || 0)) return { flag: "stock" };
      boxes = list(data.boxes).map((b) =>
        b === box
          ? {
              ...b,
              lines: list(b.lines)
                .map((l) =>
                  l.productId === d.productId ? { ...l, qty: Number(l.qty) - Number(d.qty) } : l,
                )
                .filter((l) => Number(l.qty) > 0),
            }
          : b,
      );
    }
  }
  return {
    // Решение принимается от того, кто за столом сейчас, а не от ушедшего:
    // общие правила записи (`mergeDisputes`) его иначе не пропустят.
    check: (after) =>
      list(after.disputes).some((x) => x.id === d.id && x.resolution === body.resolution),
    data: {
      ...data,
      boxes,
      disputes: disputes.map((x) =>
        x === d
          ? {
              ...x,
              resolution: body.resolution,
              resolvedBy: staffRef,
              resolvedAt: body.at,
              ...(note ? { note } : {}),
            }
          : x,
      ),
    },
  };
}

module.exports = { applyShipRun, applyDisputeResolve };
