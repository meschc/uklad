/**
 * Приёмка операциями (миграция 018, `deskOps.js`).
 *
 * Стол присылает факты приёмки, а не снимок: «место вскрыто», «столько-то
 * этого товара легло в эту тару», «тара поставлена в ячейку», «тара на
 * паллете», «поставка закрыта». Сервер сам повторяет правку снимка по
 * правилам браузера (`receiveProduct`, `applyCrossDock`, `placeBox`,
 * `attachBoxToPallet`, `openUnit`, `closeShipment`) и пропускает её через
 * общие правила записи стола (`mergeDeskWrite`: кто за столом, точная
 * сверка остатков).
 *
 * Новых тар и паллет стол не заводит: ярлыки печатаются заранее, приёмка их
 * только сканирует. Места грузовой приёмки (`recv_cargo`) заводит сервер сам
 * и сам выдаёт им номера — стол печатает ярлыки по его ответу.
 */

/* global module */

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v.filter(isObject) : []);
const ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const isId = (v) => typeof v === "string" && ID_RE.test(v);
const MAX_QTY = 100_000;
const DISCREPANCY = new Set(["shortage", "overage"]);
const OPEN = new Set(["new", "in_progress"]);

/** Тара, в которую сейчас собирают открытые заявки: принимать в неё нельзя. */
const collecting = (data, boxId) =>
  list(data.requests).some(
    (r) => r.toteId === boxId && !r.packedAt && r.status !== "shipped" && r.status !== "cancelled",
  );

/**
 * Кроссдок (`applyCrossDock`): принятое сразу закрывает ждущие заявки —
 * сначала забронированные под эту поставку, потом по старшинству. Ушедшее в
 * заявки снимается с тары приёмки: оно едет с заявкой, как снятое с полки.
 * Бронь, как и при сборке, снимает кабинет.
 */
function crossDock(data, productId, qty, shipmentId, boxId, at) {
  let left = qty;
  const order = list(data.requests)
    .filter((r) => r.productId === productId && OPEN.has(r.status))
    .sort((a, b) => {
      const mine = (r) => (r.reservedShipmentId === shipmentId ? 0 : 1);
      return mine(a) - mine(b) || (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    });
  const took = new Map();
  for (const r of order) {
    if (!left) break;
    const need = (Number(r.qty) || 0) - (Number(r.pickedQty) || 0);
    if (need <= 0) continue;
    const take = Math.min(need, left);
    left -= take;
    took.set(r.id, take);
  }
  const used = qty - left;
  if (!used) return data;
  return {
    ...data,
    requests: list(data.requests).map((r) => {
      const take = took.get(r.id);
      if (!take) return r;
      const picked = (Number(r.pickedQty) || 0) + take;
      return {
        ...r,
        pickedQty: picked,
        status: picked >= (Number(r.qty) || 0) ? "done" : "in_progress",
        startedAt: r.startedAt ?? at,
        updatedAt: at,
      };
    }),
    boxes: list(data.boxes).map((b) =>
      b.id === boxId
        ? {
            ...b,
            lines: list(b.lines)
              .map((l) => (l.productId === productId ? { ...l, qty: Number(l.qty) - used } : l))
              .filter((l) => Number(l.qty) > 0),
          }
        : b,
    ),
  };
}

/**
 * Принятое в тару: строка в коробе, прирост строки поставки и событие
 * приёмки за того, кто за столом. Повтор (то же событие уже пришло снимком)
 * ничего не меняет.
 */
function applyRecvUnit(data, body, staffRef) {
  const events = list(data.receivingEvents);
  if (events.some((e) => e.id === body.eventId)) return { data };
  const qty = body.qty;
  if (!isId(body.productId) || !isId(body.boxId) || !Number.isInteger(qty)) return { flag: "bad" };
  if (qty < 1 || qty > MAX_QTY) return { flag: "bad" };
  if (body.discrepancy !== undefined && !DISCREPANCY.has(body.discrepancy)) return { flag: "bad" };
  // Само расхождение ставит сервер при записи (`markReceived` в
  // `deskStock.js`): со стола принимается только отметка недостачи.
  if (!list(data.products).some((p) => p.id === body.productId)) return { flag: "bad" };
  const boxes = list(data.boxes);
  const box = boxes.find((b) => b.id === body.boxId);
  if (!box) return { flag: "bad" };
  // Невскрытое место, тара на полке или тара сборки — не тара приёмки.
  if (box.sealed || box.address || collecting(data, box.id)) return { flag: "tote" };

  const shipments = list(data.expectedShipments);
  let shipment = null;
  if (body.shipmentId !== undefined) {
    shipment = shipments.find((s) => s.id === body.shipmentId);
    if (!shipment || shipment.status === "closed") return { flag: "bad" };
  }
  if (body.lineId !== undefined) {
    const line = shipment && list(shipment.lines).find((l) => l.id === body.lineId);
    if (!line || line.productId !== body.productId) return { flag: "bad" };
  }
  // Один продавец: в поставке — товар её продавца, в таре приёмки — как в
  // таре сборки (`pickToteProblem`). Иначе товар одного продавца уехал бы
  // на полку под ярлыком другого.
  const partner = new Map(list(data.products).map((p) => [p.id, p.partnerId ?? ""]));
  const seller = (id) => (partner.has(id) ? partner.get(id) : `?${id}`);
  const own = seller(body.productId);
  const sellers = new Set(list(shipment?.lines).map((l) => seller(l.productId)));
  if (sellers.size > 0 && !sellers.has(own)) return { flag: "mixed" };
  if (list(box.lines).some((l) => Number(l.qty) > 0 && seller(l.productId) !== own)) {
    return { flag: "mixed" };
  }

  const at = body.at;
  const lines = list(box.lines);
  const nextLines = lines.some((l) => l.productId === body.productId)
    ? lines.map((l) => (l.productId === body.productId ? { ...l, qty: Number(l.qty) + qty } : l))
    : [...lines, { productId: body.productId, qty }];
  let out = {
    ...data,
    boxes: boxes.map((b) => (b === box ? { ...b, lines: nextLines } : b)),
    expectedShipments: shipment
      ? shipments.map((s) =>
          s === shipment
            ? {
                ...s,
                status: s.status === "pending" ? "receiving" : s.status,
                lines: list(s.lines).map((l) =>
                  l.id === body.lineId
                    ? { ...l, receivedQty: (Number(l.receivedQty) || 0) + qty }
                    : l,
                ),
              }
            : s,
        )
      : data.expectedShipments,
    receivingEvents: [
      ...events,
      {
        id: body.eventId,
        productId: body.productId,
        qty,
        boxId: box.id,
        staffId: staffRef,
        timestamp: at,
        ...(body.lineId !== undefined ? { expectedShipmentLineId: body.lineId } : {}),
        ...(body.discrepancy !== undefined ? { discrepancy: body.discrepancy } : {}),
      },
    ],
  };
  // Кроссдок решает поставка на сервере, а не стол.
  if (shipment?.crossDock) out = crossDock(out, body.productId, qty, shipment.id, box.id, at);
  return { data: out };
}

/** Вскрыть невскрытое место (паллету или короб). Уже вскрытое — то же самое. */
function applyRecvOpen(data, body) {
  if (!isId(body.unitId)) return { flag: "bad" };
  const pallet = list(data.pallets).find((p) => p.id === body.unitId);
  const box = list(data.boxes).find((b) => b.id === body.unitId);
  if (!pallet && !box) return { flag: "bad" };
  if (!(pallet ?? box).sealed) return { data };
  const open = (x) => {
    if (x.id !== body.unitId || !x.sealed) return x;
    const rest = { ...x };
    delete rest.sealed;
    return rest;
  };
  return pallet
    ? { data: { ...data, pallets: list(data.pallets).map(open) } }
    : { data: { ...data, boxes: list(data.boxes).map(open) } };
}

/**
 * Есть ли такая ячейка на плане: модуль на указанном этаже, а у этажа-алиаса
 * — на этаже-источнике (`Floor.aliasOf`).
 */
function cellExists(data, cell) {
  if (!isObject(cell) || !isId(cell.floorId) || !isId(cell.moduleId)) return false;
  if (!Number.isInteger(cell.shelfIndex) || !Number.isInteger(cell.cellIndex)) return false;
  if (cell.shelfIndex < 0 || cell.cellIndex < 0 || cell.shelfIndex > 999 || cell.cellIndex > 999) {
    return false;
  }
  const floors = isObject(data.warehouse) ? list(data.warehouse.floors) : [];
  const floor = floors.find((f) => f.id === cell.floorId);
  if (!floor) return false;
  // Этаж-алиас зеркалит раскладку источника: модули ищем у источника.
  const own = floor.aliasOf ? (floors.find((f) => f.id === floor.aliasOf) ?? floor) : floor;
  return list(own.modules).some((m) => m.id === cell.moduleId);
}

const sameCell = (a, b) =>
  isObject(a) &&
  isObject(b) &&
  a.moduleId === b.moduleId &&
  a.shelfIndex === b.shelfIndex &&
  a.cellIndex === b.cellIndex;

/**
 * Занята ли ячейка другим товаром (`buildOccupancy` + `onScanPlace`): в ней
 * лежит товар, которого нет в этой таре, — напрямую или в другой таре. Тот же
 * товар рядом — не конфликт, это докладка.
 */
function cellBusy(data, box, cell) {
  const mine = new Set(list(box.lines).map((l) => l.productId));
  const placements = isObject(data.placements) ? data.placements : {};
  for (const [productId, addr] of Object.entries(placements)) {
    if (sameCell(addr, cell) && !mine.has(productId)) return true;
  }
  return list(data.boxes).some(
    (b) =>
      b.id !== box.id &&
      sameCell(b.address, cell) &&
      list(b.lines).some((l) => Number(l.qty) > 0 && !mine.has(l.productId)),
  );
}

/**
 * Закрытая тара встаёт в ячейку. Переставить уже стоящую тару стол не
 * может: это перемещение, и решает его не приёмка.
 */
function applyRecvPlace(data, body) {
  if (!isId(body.boxId) || !cellExists(data, body.cell)) return { flag: "bad" };
  const boxes = list(data.boxes);
  const box = boxes.find((b) => b.id === body.boxId);
  if (!box) return { flag: "bad" };
  if (box.address) return sameCell(box.address, body.cell) ? { data } : { flag: "tote" };
  if (box.sealed || collecting(data, box.id)) return { flag: "tote" };
  if (cellBusy(data, box, body.cell)) return { flag: "busy" };
  const c = body.cell;
  const address = {
    floorId: c.floorId,
    moduleId: c.moduleId,
    shelfIndex: c.shelfIndex,
    cellIndex: c.cellIndex,
  };
  return { data: { ...data, boxes: boxes.map((b) => (b === box ? { ...b, address } : b)) } };
}

/** Тара на паллете. Уже на этой — то же самое, на другой — нельзя. */
function applyRecvAttach(data, body) {
  if (!isId(body.boxId) || !isId(body.palletId)) return { flag: "bad" };
  const boxes = list(data.boxes);
  const pallets = list(data.pallets);
  const box = boxes.find((b) => b.id === body.boxId);
  const pallet = pallets.find((p) => p.id === body.palletId);
  if (!box || !pallet || pallet.sealed) return { flag: "bad" };
  const ids = Array.isArray(pallet.boxIds) ? pallet.boxIds : [];
  if (box.palletId === pallet.id && ids.includes(box.id)) return { data };
  if (box.palletId && box.palletId !== pallet.id) return { flag: "bad" };
  return {
    data: {
      ...data,
      boxes: boxes.map((b) => (b === box ? { ...b, palletId: pallet.id } : b)),
      pallets: pallets.map((p) =>
        p === pallet && !ids.includes(box.id) ? { ...p, boxIds: [...ids, box.id] } : p,
      ),
    },
  };
}

/** Поставка принята. Уже закрытая — то же самое. */
function applyRecvClose(data, body) {
  if (!isId(body.shipmentId)) return { flag: "bad" };
  const shipments = list(data.expectedShipments);
  const shipment = shipments.find((s) => s.id === body.shipmentId);
  if (!shipment) return { flag: "bad" };
  if (shipment.status === "closed") return { data };
  return {
    data: {
      ...data,
      expectedShipments: shipments.map((s) =>
        s === shipment ? { ...s, status: "closed", closedAt: body.at } : s,
      ),
    },
  };
}

const MAX_UNITS = 200;
/** Мест на поставку без накладной; по накладной — до двух её объёмов. */
const MAX_PER_SHIPMENT = 300;
const count = (v) => (Number.isInteger(v) && v >= 0 && v <= MAX_UNITS ? v : null);
const declared = (v) =>
  v === undefined ? undefined : Number.isInteger(v) && v >= 0 && v <= 100_000 ? v : null;

/** Номера мест: `<событие>-p0…`, `<событие>-b0…` — повтор находит те же. */
const cargoIds = (eventId, n, tag) => Array.from({ length: n }, (_, i) => `${eventId}-${tag}${i}`);

/** Следующий номер ярлыка: больше и счётчика, и любого уже выданного кода. */
function nextSeq(seq, units, prefix) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let top = Number.isInteger(seq) && seq > 0 ? seq : 0;
  for (const u of units) {
    const m = re.exec(String(u.barcode ?? "").toUpperCase());
    if (m) top = Math.max(top, Number(m[1]));
  }
  return top;
}

/**
 * Грузовая приёмка (`acceptCargo`): места поставки при водителе. Номера
 * ярлыков выдаёт сервер — из счётчика склада, под блокировкой снимка, — и
 * стол печатает ярлыки только после ответа. Два стола, принявшие машины
 * одновременно, получат разные номера.
 */
function applyRecvCargo(data, body, staffRef) {
  const nP = count(body.pallets);
  const nB = count(body.boxes);
  const dP = declared(body.declaredPallets);
  const dB = declared(body.declaredBoxes);
  if (nP === null || nB === null || nP + nB === 0 || dP === null || dB === null) {
    return { flag: "bad" };
  }
  if (!isId(body.shipmentId) || body.eventId.length > 80) return { flag: "bad" };
  const shipments = list(data.expectedShipments);
  const shipment = shipments.find((s) => s.id === body.shipmentId);
  if (!shipment || shipment.status === "closed") return { flag: "bad" };
  const pIds = cargoIds(body.eventId, nP, "p");
  const bIds = cargoIds(body.eventId, nB, "b");
  const pallets = list(data.pallets);
  const boxes = list(data.boxes);
  // Места этого события уже есть — значит, их завела другая операция: повтор
  // своей сервер узнаёт по ключу и сюда не пускает. Ответить местами чужого
  // события — второй комплект ярлыков на те же коды.
  if (pallets.some((p) => pIds.includes(p.id)) || boxes.some((b) => bIds.includes(b.id))) {
    return { flag: "bad" };
  }
  const at = body.at;
  let pSeq = nextSeq(data.palletSeq, pallets, "UK-PLT-");
  let bSeq = nextSeq(data.boxSeq, boxes, "UK-BOX-");
  const unit = (id, barcode, extra) => ({
    id,
    barcode,
    createdAt: at,
    ...extra,
    sealed: true,
    shipmentId: shipment.id,
  });
  const newPallets = pIds.map((id) => unit(id, `UK-PLT-${++pSeq}`, { boxIds: [] }));
  const newBoxes = bIds.map((id) => unit(id, `UK-BOX-${++bSeq}`, { lines: [] }));
  const prev = isObject(shipment.cargo) ? shipment.cargo : null;
  // Мест у поставки не больше разумного: пустые места товара не создают, но
  // раздувают снимок, и кабинет компании перестал бы сохраняться.
  const total = (Number(prev?.pallets) || 0) + (Number(prev?.boxes) || 0) + nP + nB;
  const said = (dP ?? prev?.declaredPallets ?? 0) + (dB ?? prev?.declaredBoxes ?? 0);
  if (total > Math.max(2 * said, MAX_PER_SHIPMENT)) return { flag: "bad" };
  const cargo = {
    declaredPallets: dP ?? prev?.declaredPallets,
    declaredBoxes: dB ?? prev?.declaredBoxes,
    pallets: (Number(prev?.pallets) || 0) + nP,
    boxes: (Number(prev?.boxes) || 0) + nB,
    at,
    staffId: staffRef,
  };
  for (const k of Object.keys(cargo)) if (cargo[k] === undefined) delete cargo[k];
  return {
    data: {
      ...data,
      pallets: [...pallets, ...newPallets],
      boxes: [...boxes, ...newBoxes],
      palletSeq: pSeq,
      boxSeq: bSeq,
      expectedShipments: shipments.map((s) =>
        s === shipment
          ? { ...s, status: s.status === "pending" ? "receiving" : s.status, cargo }
          : s,
      ),
    },
  };
}

/** Какие места завело событие: стол печатает ярлыки по ответу сервера. */
function cargoMade(data, body) {
  const pick = (units, ids) =>
    ids.flatMap((id) => {
      const u = units.find((x) => x.id === id);
      return u ? [{ id: u.id, barcode: u.barcode }] : [];
    });
  const nP = count(body.pallets) ?? 0;
  const nB = count(body.boxes) ?? 0;
  return {
    pallets: pick(list(data.pallets), cargoIds(body.eventId, nP, "p")),
    boxes: pick(list(data.boxes), cargoIds(body.eventId, nB, "b")),
  };
}

module.exports = {
  applyRecvUnit,
  applyRecvOpen,
  applyRecvPlace,
  applyRecvAttach,
  applyRecvClose,
  applyRecvCargo,
  cargoMade,
};
