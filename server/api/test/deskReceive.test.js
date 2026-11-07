/**
 * Приёмка операциями: сервер сам кладёт принятое в тару и ставит тару на
 * место. Ошибка здесь — принятое дважды (снимком и операцией), принятое в
 * тару сборки или на полку мимо приёмки: недостача всплывёт только на
 * инвентаризации.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyRecvUnit,
  applyRecvOpen,
  applyRecvPlace,
  applyRecvAttach,
  applyRecvClose,
} = require("../src/cabinet/deskReceive");

const AT = 1_800_000_000_000;
const CELL = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 1 };
const data = () => ({
  warehouse: { floors: [{ id: "f1", modules: [{ id: "m1" }] }] },
  products: [{ id: "p1" }, { id: "p2" }],
  boxes: [
    { id: "b1", barcode: "UK-BOX-1", lines: [] },
    { id: "b2", barcode: "UK-BOX-2", lines: [], sealed: true, shipmentId: "s1" },
    { id: "t1", barcode: "UK-BOX-7", lines: [{ productId: "p1", qty: 1 }] },
  ],
  pallets: [{ id: "pl1", barcode: "UK-PLT-1", boxIds: [] }],
  expectedShipments: [
    {
      id: "s1",
      status: "pending",
      lines: [{ id: "l1", productId: "p1", expectedQty: 5, receivedQty: 0 }],
    },
  ],
  receivingEvents: [],
  requests: [
    { id: "r1", productId: "p1", qty: 1, pickedQty: 1, status: "in_progress", toteId: "t1" },
  ],
});
const unit = (over = {}) => ({
  eventId: "rv-1",
  at: AT,
  productId: "p1",
  qty: 3,
  boxId: "b1",
  shipmentId: "s1",
  lineId: "l1",
  ...over,
});

test("принятое в тару: строка короба, прирост поставки, событие за сотрудником", () => {
  const r = applyRecvUnit(data(), unit(), "stf-ivan");
  assert.equal(r.flag, undefined);
  assert.deepEqual(r.data.boxes[0].lines, [{ productId: "p1", qty: 3 }]);
  const sh = r.data.expectedShipments[0];
  assert.deepEqual([sh.status, sh.lines[0].receivedQty], ["receiving", 3]);
  assert.deepEqual(r.data.receivingEvents, [
    {
      id: "rv-1",
      productId: "p1",
      qty: 3,
      boxId: "b1",
      staffId: "stf-ivan",
      timestamp: AT,
      expectedShipmentLineId: "l1",
    },
  ]);
  // Повтор того же события (пришло снимком) ничего не меняет.
  assert.equal(applyRecvUnit(r.data, unit(), "stf-ivan").data, r.data);
});

test("в невскрытое место, тару на полке и тару сборки не принимается", () => {
  assert.equal(applyRecvUnit(data(), unit({ boxId: "b2" }), "stf-ivan").flag, "tote");
  assert.equal(applyRecvUnit(data(), unit({ boxId: "t1" }), "stf-ivan").flag, "tote");
  const placed = data();
  placed.boxes[0].address = CELL;
  assert.equal(applyRecvUnit(placed, unit(), "stf-ivan").flag, "tote");
});

test("чужой товар строки, закрытая поставка, ноль и неизвестный товар — нельзя", () => {
  assert.equal(applyRecvUnit(data(), unit({ productId: "p2" }), "stf-ivan").flag, "bad");
  assert.equal(applyRecvUnit(data(), unit({ qty: 0 }), "stf-ivan").flag, "bad");
  assert.equal(applyRecvUnit(data(), unit({ qty: 1.5 }), "stf-ivan").flag, "bad");
  assert.equal(
    applyRecvUnit(data(), unit({ productId: "p9", lineId: undefined }), "stf-ivan").flag,
    "bad",
  );
  const closed = data();
  closed.expectedShipments[0].status = "closed";
  assert.equal(applyRecvUnit(closed, unit(), "stf-ivan").flag, "bad");
  // Без поставки — свободная приёмка.
  const free = applyRecvUnit(
    data(),
    unit({ shipmentId: undefined, lineId: undefined }),
    "stf-ivan",
  );
  assert.deepEqual(free.data.boxes[0].lines, [{ productId: "p1", qty: 3 }]);
});

test("кроссдок решает поставка: принятое закрывает ждущие заявки и уходит из тары", () => {
  const d = data();
  d.expectedShipments[0].crossDock = true;
  d.requests = [
    { id: "r2", productId: "p1", qty: 2, status: "new", createdAt: 2 },
    { id: "r3", productId: "p1", qty: 2, status: "new", createdAt: 1, reservedShipmentId: "s1" },
  ];
  const r = applyRecvUnit(d, unit(), "stf-ivan").data;
  const req = Object.fromEntries(r.requests.map((x) => [x.id, [x.pickedQty, x.status]]));
  // Сначала забронированная под эту поставку, потом по старшинству.
  assert.deepEqual(req, { r2: [1, "in_progress"], r3: [2, "done"] });
  assert.deepEqual(r.boxes[0].lines, []);
  assert.equal(r.receivingEvents[0].qty, 3);
});

test("вскрытие места: печать снимается, повтор — то же самое", () => {
  const r = applyRecvOpen(data(), { unitId: "b2", at: AT }).data;
  assert.equal(r.boxes[1].sealed, undefined);
  assert.equal(applyRecvOpen(r, { unitId: "b2", at: AT }).data, r);
  assert.equal(applyRecvOpen(data(), { unitId: "nope", at: AT }).flag, "bad");
});

test("тара в ячейку: только существующая ячейка, переставить стоящую нельзя", () => {
  const r = applyRecvPlace(data(), { boxId: "b1", cell: CELL, at: AT }).data;
  assert.deepEqual(r.boxes[0].address, CELL);
  assert.equal(applyRecvPlace(r, { boxId: "b1", cell: CELL, at: AT }).data, r);
  assert.equal(
    applyRecvPlace(r, { boxId: "b1", cell: { ...CELL, cellIndex: 2 }, at: AT }).flag,
    "tote",
  );
  assert.equal(
    applyRecvPlace(data(), { boxId: "b1", cell: { ...CELL, moduleId: "m9" }, at: AT }).flag,
    "bad",
  );
  assert.equal(
    applyRecvPlace(data(), { boxId: "b1", cell: { ...CELL, floorId: "f9" }, at: AT }).flag,
    "bad",
  );
  // Тару сборки приёмка на полку не ставит.
  assert.equal(applyRecvPlace(data(), { boxId: "t1", cell: CELL, at: AT }).flag, "tote");
});

test("тара на паллету и закрытие поставки — с повтором", () => {
  const a = applyRecvAttach(data(), { boxId: "b1", palletId: "pl1", at: AT }).data;
  assert.deepEqual([a.boxes[0].palletId, a.pallets[0].boxIds], ["pl1", ["b1"]]);
  assert.equal(applyRecvAttach(a, { boxId: "b1", palletId: "pl1", at: AT }).data, a);
  a.pallets.push({ id: "pl2", boxIds: [] });
  assert.equal(applyRecvAttach(a, { boxId: "b1", palletId: "pl2", at: AT }).flag, "bad");
  const c = applyRecvClose(data(), { shipmentId: "s1", at: AT }).data;
  assert.deepEqual(
    [c.expectedShipments[0].status, c.expectedShipments[0].closedAt],
    ["closed", AT],
  );
  assert.equal(applyRecvClose(c, { shipmentId: "s1", at: AT }).data, c);
});

test("один продавец: в поставке — её товар, в таре приёмки — товар одного продавца", () => {
  const d = data();
  d.products = [
    { id: "p1", partnerId: "s1" },
    { id: "p2", partnerId: "s2" },
  ];
  // Без строки, но в поставку продавца s1 — товар s2 нельзя.
  assert.equal(
    applyRecvUnit(d, unit({ productId: "p2", lineId: undefined }), "stf-ivan").flag,
    "mixed",
  );
  // Свободная приёмка в тару, где уже лежит товар другого продавца.
  d.boxes[0].lines = [{ productId: "p1", qty: 1 }];
  assert.equal(
    applyRecvUnit(
      d,
      unit({ productId: "p2", shipmentId: undefined, lineId: undefined }),
      "stf-ivan",
    ).flag,
    "mixed",
  );
});

test("ячейка — на указанном этаже или у источника этажа-алиаса", () => {
  const d = data();
  d.warehouse.floors.push(
    { id: "f2", modules: [{ id: "m2" }] },
    { id: "f3", aliasOf: "f1", modules: [] },
  );
  // Модуль другого этажа под этим этажом не найдётся на плане.
  assert.equal(
    applyRecvPlace(d, { boxId: "b1", cell: { ...CELL, moduleId: "m2" }, at: AT }).flag,
    "bad",
  );
  const alias = { ...CELL, floorId: "f3" };
  assert.deepEqual(
    applyRecvPlace(d, { boxId: "b1", cell: alias, at: AT }).data.boxes[0].address,
    alias,
  );
});

test("расхождение ставит сервер: сверх строки и без поставки — overage, что бы ни прислал стол", () => {
  const { markReceived } = require("../src/cabinet/deskStock");
  const shipments = [
    { id: "s1", lines: [{ id: "l1", productId: "p1", expectedQty: 10, receivedQty: 0 }] },
  ];
  const ev = (id, qty, over = {}) => ({
    id,
    productId: "p1",
    qty,
    expectedShipmentLineId: "l1",
    ...over,
  });
  const out = markReceived(
    shipments,
    [
      ev("old", 5),
      ev("e1", 12, { discrepancy: "shortage" }),
      ev("e2", 3, { expectedShipmentLineId: undefined }),
      ev("e3", 1, { expectedShipmentLineId: "nope" }),
    ],
    new Map([["old", {}]]),
  );
  assert.deepEqual(
    out.map((e) => [e.id, e.discrepancy ?? null]),
    [
      ["old", null],
      ["e1", "overage"],
      ["e2", "overage"],
      ["e3", "overage"],
    ],
  );
  // В пределах строки: недостачу стол отмечает сам, «лишнее» — нет.
  const within = markReceived(
    shipments,
    [ev("a", 4, { discrepancy: "overage" }), ev("b", 6, { discrepancy: "shortage" })],
    new Map(),
  );
  assert.deepEqual(
    within.map((e) => e.discrepancy ?? null),
    [null, "shortage"],
  );
  // Уже принятое на сервере идёт в счёт строки.
  const later = markReceived(
    [{ id: "s1", lines: [{ id: "l1", productId: "p1", expectedQty: 10, receivedQty: 9 }] }],
    [ev("c", 2)],
    new Map(),
  );
  assert.equal(later[0].discrepancy, "overage");
});
