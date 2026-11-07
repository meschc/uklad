/**
 * Остатки со стола: сервер сверяет, куда делся товар. Ошибка здесь молчит —
 * «нарисованный» в таре товар или тихо убранный выглядят как обычная работа,
 * а заметно это становится только на инвентаризации. Поэтому проверяем и
 * обычный ход работы (он должен проходить), и подделки (их сервер откатывает).
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeDeskWrite } = require("../src/cabinet/desks");

const who = { staff: "stf-ivan" };

function base() {
  return {
    warehouse: {
      id: "wh1",
      staff: [
        { id: "stf-ivan", role: "Упаковщик" },
        { id: "stf-olga", role: "Старший смены" },
        { id: "stf-petr", role: "Кладовщик" },
      ],
    },
    products: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    boxes: [
      { id: "b1", barcode: "UK-BOX-1", lines: [{ productId: "p1", qty: 5 }], address: "A" },
      { id: "t1", barcode: "UK-BOX-2", lines: [{ productId: "p2", qty: 2 }] },
    ],
    receivingEvents: [],
    requests: [{ id: "r1", productId: "p1", qty: 3, status: "in_progress", pickedQty: 0 }],
    outboundBoxes: [],
    shipments: [],
    placements: { p3: { floor: 1 } },
    disputes: [
      { id: "d1", kind: "shortage", boxId: "b1", productId: "p1", qty: 2, raisedBy: "stf-petr" },
    ],
    staffEvents: [],
  };
}

const withBoxes = (cur, b1, t1) => ({
  ...cur,
  boxes: [
    { ...cur.boxes[0], lines: b1 },
    { ...cur.boxes[1], lines: t1 },
  ],
});

test("приёмка: новое событие за того, кто за столом, растит тару", () => {
  const cur = base();
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 8 }], cur.boxes[1].lines),
    receivingEvents: [
      { id: "e1", productId: "p1", qty: 3, boxId: "b1", staffId: "stf-ivan", timestamp: 1 },
    ],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, []);
  assert.equal(data.boxes[0].lines[0].qty, 8);
  assert.equal(data.receivingEvents.length, 1);
});

test("товар из ничего: тара растёт без приёмки — откат, отметка смены остаётся", () => {
  const cur = base();
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 9 }], cur.boxes[1].lines),
    staffEvents: [
      { id: "s1", staffId: "stf-ivan", type: "shift_start", at: 1 },
      { id: "s2", staffId: "stf-ivan", type: "pack_label", at: 2 },
    ],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, ["p1"]);
  assert.equal(data.boxes[0].lines[0].qty, 5);
  // Пик без упаковки в данных не оплачивается: остаётся только отметка смены.
  assert.deepEqual(
    data.staffEvents.map((e) => e.id),
    ["s1"],
  );
});

test("приёмка за отсутствующего не засчитывается, и тара с ней не растёт", () => {
  const cur = base();
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 8 }], cur.boxes[1].lines),
    receivingEvents: [
      { id: "e1", productId: "p1", qty: 3, boxId: "b1", staffId: "stf-petr", timestamp: 1 },
    ],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, ["p1"]);
  assert.equal(data.receivingEvents.length, 0);
});

test("товар пропал без сборки — откат", () => {
  const cur = base();
  const inc = withBoxes(cur, [{ productId: "p1", qty: 3 }], cur.boxes[1].lines);
  assert.deepEqual(mergeDeskWrite(cur, inc, who).mismatch, ["p1"]);
});

test("сборка: снятое с полки ушло в собранное по заявке", () => {
  const cur = base();
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 4 }], cur.boxes[1].lines),
    requests: [{ ...cur.requests[0], pickedQty: 1 }],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, []);
  assert.equal(data.requests[0].pickedQty, 1);
});

test("сборка в тару: с полки в тару сборки и в собранное по заявке", () => {
  const cur = base();
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 4 }], [...cur.boxes[1].lines]),
    boxes: [
      { ...cur.boxes[0], lines: [{ productId: "p1", qty: 4 }] },
      { ...cur.boxes[1], lines: [...cur.boxes[1].lines, { productId: "p1", qty: 1 }] },
    ],
    requests: [{ ...cur.requests[0], pickedQty: 1, toteId: "t1" }],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, []);
  assert.equal(data.requests[0].toteId, "t1");
});

test("упаковка: из тары в короб отгрузки — проходит; короб из ничего — нет", () => {
  const cur = base();
  const out = [
    {
      id: "o1",
      code: "UK-OUT-A",
      lines: [{ productId: "p2", qty: 2 }],
      requestIds: [],
      packedBy: ["stf-ivan"],
    },
  ];
  const packed = { ...withBoxes(cur, cur.boxes[0].lines, []), outboundBoxes: out };
  assert.deepEqual(mergeDeskWrite(cur, packed, who).mismatch, []);

  const fake = { ...cur, outboundBoxes: out };
  const res = mergeDeskWrite(cur, fake, who);
  assert.deepEqual(res.mismatch, ["p2"]);
  assert.deepEqual(res.data.outboundBoxes, []);
});

test("уехавший короб и рейс не переписываются, открытый короб не худеет", () => {
  const cur = {
    ...base(),
    outboundBoxes: [
      { id: "o1", code: "UK-OUT-A", lines: [{ productId: "p2", qty: 1 }], shipmentId: "sh1" },
      { id: "o2", code: "UK-OUT-B", lines: [{ productId: "p2", qty: 1 }] },
    ],
    shipments: [{ id: "sh1", destination: "Тула", requestIds: [], staffId: "stf-ivan" }],
  };
  const inc = {
    ...cur,
    outboundBoxes: [
      { ...cur.outboundBoxes[0], lines: [] },
      { ...cur.outboundBoxes[1], lines: [] },
    ],
    shipments: [{ ...cur.shipments[0], destination: "Самара" }],
  };
  const { data } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(data.outboundBoxes, cur.outboundBoxes);
  assert.equal(data.shipments[0].destination, "Тула");
});

test("кроссдок: принятое сразу закрывает заявку", () => {
  const cur = base();
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 8 }], cur.boxes[1].lines),
    receivingEvents: [
      { id: "e1", productId: "p1", qty: 3, boxId: "b1", staffId: "stf-ivan", timestamp: 1 },
    ],
    requests: [{ ...cur.requests[0], pickedQty: 3, status: "done" }],
  };
  assert.deepEqual(mergeDeskWrite(cur, inc, who).mismatch, []);
});

test("списание недостачи старшим уменьшает тару; без решения — откат", () => {
  const cur = base();
  const box = withBoxes(cur, [{ productId: "p1", qty: 3 }], cur.boxes[1].lines);
  const decided = {
    ...box,
    disputes: [
      {
        ...cur.disputes[0],
        resolution: "written_off",
        resolvedBy: "stf-olga",
        resolvedAt: 2,
        note: "не нашли",
      },
    ],
  };
  assert.deepEqual(mergeDeskWrite(cur, decided, { staff: "stf-olga" }).mismatch, []);
  // Упаковщик не старший: решение не принято, и тара без него не худеет.
  assert.deepEqual(mergeDeskWrite(cur, decided, who).mismatch, ["p1"]);
});

test("стол не ставит товар в ячейку, но снимает при сборке", () => {
  const cur = base();
  const moved = { ...cur, placements: { p3: { floor: 2 }, p9: { floor: 1 } } };
  assert.deepEqual(mergeDeskWrite(cur, moved, who).data.placements, cur.placements);
  const picked = { ...cur, placements: {} };
  assert.deepEqual(mergeDeskWrite(cur, picked, who).data.placements, {});
  // Снятое с ячейки легло в тару сборки — одна штука, не больше.
  const toTote = withBoxes({ ...cur, placements: {} }, cur.boxes[0].lines, [
    { productId: "p2", qty: 2 },
    { productId: "p3", qty: 1 },
  ]);
  assert.deepEqual(mergeDeskWrite(cur, toTote, who).mismatch, []);
  const tooMuch = withBoxes({ ...cur, placements: {} }, cur.boxes[0].lines, [
    { productId: "p2", qty: 2 },
    { productId: "p3", qty: 4 },
  ]);
  assert.deepEqual(mergeDeskWrite(cur, tooMuch, who).mismatch, ["p3"]);
});

test("открытое спорное копит количество, но не уменьшается", () => {
  const cur = base();
  // Чужую недостачу (завёл Пётр) упаковщик не раздувает.
  const more = { ...cur, disputes: [{ ...cur.disputes[0], qty: 3 }] };
  assert.equal(mergeDeskWrite(cur, more, who).data.disputes[0].qty, 2);
  const less = { ...cur, disputes: [{ ...cur.disputes[0], qty: 1 }] };
  assert.equal(mergeDeskWrite(cur, less, who).data.disputes[0].qty, 2);
  // Растит тот, кто завёл: чужую недостачу перед списанием не раздуть.
  const own = { ...cur, disputes: [{ ...cur.disputes[0], raisedBy: "stf-ivan" }] };
  const grown = { ...own, disputes: [{ ...own.disputes[0], qty: 4 }] };
  assert.equal(mergeDeskWrite(own, grown, who).data.disputes[0].qty, 4);
});

test("«вернул из сборки и собрал снова» не создаёт товар: собранное не убывает", () => {
  const cur = { ...base(), requests: [{ ...base().requests[0], pickedQty: 3 }] };
  const back = {
    ...withBoxes(cur, [{ productId: "p1", qty: 8 }], cur.boxes[1].lines),
    requests: [{ ...cur.requests[0], pickedQty: 0 }],
  };
  const res = mergeDeskWrite(cur, back, who);
  assert.deepEqual(res.mismatch, ["p1"]);
  assert.equal(res.data.requests[0].pickedQty, 3);
});

test("приёмка товара не из каталога не засчитывается", () => {
  const cur = base();
  const inc = {
    ...cur,
    boxes: [...cur.boxes, { id: "b9", barcode: "UK-BOX-9", lines: [{ productId: "px", qty: 3 }] }],
    receivingEvents: [
      { id: "e1", productId: "px", qty: 3, boxId: "b9", staffId: "stf-ivan", timestamp: 1 },
    ],
  };
  const res = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(res.mismatch, ["px"]);
  assert.equal(res.data.receivingEvents.length, 0);
});

test("при откате решение старшего без списания сохраняется", () => {
  const cur = {
    ...base(),
    disputes: [
      { id: "d2", kind: "extra", boxId: "b1", productId: "p1", qty: 1, raisedBy: "stf-petr" },
    ],
  };
  const inc = {
    ...withBoxes(cur, [{ productId: "p1", qty: 9 }], cur.boxes[1].lines),
    disputes: [{ ...cur.disputes[0], resolution: "moved", resolvedBy: "stf-olga", resolvedAt: 3 }],
  };
  const res = mergeDeskWrite(cur, inc, { staff: "stf-olga" });
  assert.deepEqual(res.mismatch, ["p1"]);
  assert.equal(res.data.disputes[0].resolution, "moved");
});
