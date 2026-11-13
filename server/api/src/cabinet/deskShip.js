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

const { GOODS_DECIDE, GOODS_WRITEOFF, may } = require("./deskPerms");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const code = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();
// Посылки FBS (этикетки `UK-LBL-`/`UK-ORD-`) грузятся вместе с грузовым
// местом сортировки (`UK-OUT-`), а не по одной.
const LOAD_RE = /^UK-(BOX|PLT|OUT|LBL|ORD)-[A-Z0-9-]{1,40}$/;
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

const WRITES_OFF = new Set(["shortage", "not_packable", "receive_overage", "inventory_short"]);
/**
 * Переложить найденное в другую тару — то же правило, что в браузере
 * (`src/lib/disputes.ts`, `moveInto`). Нечего или некуда — `null`.
 */
function moveInto(boxes, d, toId) {
  const from = boxes.find((b) => b.id === d.boxId);
  const to = boxes.find((b) => b.id === toId);
  if (!from || !to || to === from || to.sealed || !isId(d.productId)) return null;
  const qty = Number(d.qty);
  const lines = list(from.lines);
  const have = lines
    .filter((l) => l.productId === d.productId)
    .reduce((n, l) => n + Number(l.qty), 0);
  if (!(qty > 0) || have < qty) return null;
  let left = qty;
  return boxes.map((b) => {
    if (b === from) {
      return {
        ...b,
        lines: lines
          .map((l) => {
            if (l.productId !== d.productId || left <= 0) return l;
            const take = Math.min(Number(l.qty), left);
            left -= take;
            return { ...l, qty: Number(l.qty) - take };
          })
          .filter((l) => Number(l.qty) > 0),
      };
    }
    if (b !== to) return b;
    const toLines = list(b.lines);
    return {
      ...b,
      lines: toLines.some((l) => l.productId === d.productId)
        ? toLines.map((l) => (l.productId === d.productId ? { ...l, qty: Number(l.qty) + qty } : l))
        : [...toLines, { productId: d.productId, qty }],
    };
  });
}

const RESOLUTIONS = new Set(["returned", "moved", "written_off", "accepted"]);
/** Решения по видам спорного: у остальных — вернуть, переложить, списать. */
const RESOLUTIONS_BY_KIND = {
  receive_overage: ["accepted", "written_off"],
  inventory_short: ["returned", "written_off"],
  inventory_over: ["returned", "accepted"],
};

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
  const allowed = RESOLUTIONS_BY_KIND[d.kind] ?? ["returned", "moved", "written_off"];
  if (!allowed.includes(body.resolution)) return { flag: "bad" };
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  let boxes = data.boxes;
  if (body.resolution === "moved") {
    // Переложить — найденное из своей тары в выбранную (Кирилл 13.11): итог
    // по товару тот же, сверка остатков (`deskStock.js`) это и проверит.
    boxes = moveInto(list(data.boxes), d, body.toBoxId);
    if (!boxes) return { flag: "stock" };
  }
  // Оприходование излишка по инвентаризации — товар из ничего: те же четыре
  // глаза и причина, что у списания.
  const adopting = body.resolution === "accepted" && d.kind === "inventory_over";
  if (adopting) {
    if (!note || d.raisedBy === staffRef) return { flag: "not_yours" };
    if (!d.boxId || !isId(d.productId) || !list(data.boxes).some((b) => b.id === d.boxId)) {
      return { flag: "stock" };
    }
    boxes = list(data.boxes).map((b) =>
      b.id !== d.boxId
        ? b
        : {
            ...b,
            lines: list(b.lines).some((l) => l.productId === d.productId)
              ? list(b.lines).map((l) =>
                  l.productId === d.productId ? { ...l, qty: Number(l.qty) + Number(d.qty) } : l,
                )
              : [...list(b.lines), { productId: d.productId, qty: Number(d.qty) }],
          },
    );
  }
  if (body.resolution === "written_off" && !may(who, staffRef, GOODS_WRITEOFF)) {
    // Без права начальника списание только просят (Кирилл 13.11, миграция
    // 030): спорное остаётся открытым с просьбой, товар не трогаем.
    if (!note) return { flag: "not_yours" };
    const request = { by: staffRef, at: body.at, note };
    return {
      check: (after) =>
        list(after.disputes).some((x) => x.id === d.id && x.writeOffRequest?.by === staffRef),
      data: {
        ...data,
        disputes: disputes.map((x) => (x === d ? { ...x, writeOffRequest: request } : x)),
      },
    };
  }
  if (body.resolution === "written_off") {
    // Четыре глаза и причина: подтверждает не тот, кто нашёл и не тот, кто
    // просил. Причина — своя или из просьбы.
    const asked = d.writeOffRequest;
    const reason = note || (typeof asked?.note === "string" ? asked.note : "");
    if (!reason || d.raisedBy === staffRef || asked?.by === staffRef) return { flag: "not_yours" };
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
              ...(note || x.writeOffRequest?.note ? { note: note || x.writeOffRequest.note } : {}),
              ...(body.resolution === "moved" ? { movedTo: body.toBoxId } : {}),
            }
          : x,
      ),
    },
  };
}

module.exports = { applyShipRun, applyDisputeResolve };
