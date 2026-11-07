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

test("кроссдок: принятое сразу закрывает заявку и в таре не остаётся", () => {
  const cur = base();
  const recv = {
    receivingEvents: [
      { id: "e1", productId: "p1", qty: 3, boxId: "b1", staffId: "stf-ivan", timestamp: 1 },
    ],
    requests: [{ ...cur.requests[0], pickedQty: 3, status: "done" }],
  };
  // Ушедшее в заявку снято с тары приёмки: тара как была.
  const inc = { ...withBoxes(cur, cur.boxes[0].lines, cur.boxes[1].lines), ...recv };
  assert.deepEqual(mergeDeskWrite(cur, inc, who).mismatch, []);
  // Принятое и в таре, и в заявке — одна штука числится дважды.
  const twice = { ...withBoxes(cur, [{ productId: "p1", qty: 8 }], cur.boxes[1].lines), ...recv };
  assert.deepEqual(mergeDeskWrite(cur, twice, who).mismatch, ["p1"]);
});

test("собрано без снятия с полки — товар задвоен, откат", () => {
  const cur = base();
  const inc = { ...cur, requests: [{ ...cur.requests[0], pickedQty: 2 }] };
  assert.deepEqual(mergeDeskWrite(cur, inc, who).mismatch, ["p1"]);
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

/** Сборка в тару: полка b1 −take, тара t1 +put, собрано +picked (с тарой). */
function pickIntoTote(cur, { take = 1, put = 1, picked = 1, toteId = "t1" } = {}) {
  const shelf = cur.boxes[0].lines[0].qty;
  return {
    ...cur,
    boxes: [
      { ...cur.boxes[0], lines: [{ productId: "p1", qty: shelf - take }] },
      { ...cur.boxes[1], lines: [...cur.boxes[1].lines, { productId: "p1", qty: put }] },
    ],
    requests: [{ ...cur.requests[0], pickedQty: picked, toteId }],
  };
}

test("сборка в тару: подделки дают расхождение", () => {
  const cur = base();
  // (а) в таре +1, с полки ничего не сняли.
  assert.deepEqual(mergeDeskWrite(cur, pickIntoTote(cur, { take: 0 }), who).mismatch, ["p1"]);
  // (б) в таре +1, собранное не выросло.
  const noPick = { ...pickIntoTote(cur, { take: 0 }), requests: cur.requests };
  assert.deepEqual(mergeDeskWrite(cur, noPick, who).mismatch, ["p1"]);
  // (в) с полки −1, в таре +1, а собрано +2.
  assert.deepEqual(mergeDeskWrite(cur, pickIntoTote(cur, { picked: 2 }), who).mismatch, ["p1"]);
  // Собрал в тару и одну штуку «потерял» с полки: собранное в тару права
  // убрать товар не даёт.
  assert.deepEqual(mergeDeskWrite(cur, pickIntoTote(cur, { take: 2 }), who).mismatch, ["p1"]);
});

test("тару сборки сервер проверяет сам", () => {
  const cur = base();
  // Короб с местом хранения — не тара: toteId не принимается, и тогда
  // собранное считается снятым в заявку (как до тары).
  const shelfAsTote = pickIntoTote(cur, { toteId: "b1" });
  assert.equal(mergeDeskWrite(cur, shelfAsTote, who).data.requests[0].toteId, undefined);
  // После упаковки тару заявки не переписать.
  const packed = {
    ...cur,
    requests: [{ ...cur.requests[0], pickedQty: 3, packedAt: 5, toteId: "t1" }],
  };
  const moved = { ...packed, requests: [{ ...packed.requests[0], toteId: "t9" }] };
  assert.equal(mergeDeskWrite(packed, moved, who).data.requests[0].toteId, "t1");
});

test("вся цепочка: приёмка → сборка в тару → упаковка → рейс; остаток = принято − уехало", () => {
  const step = (cur, inc) => {
    const r = mergeDeskWrite(cur, inc, who);
    assert.deepEqual(r.mismatch, []);
    return r.data;
  };
  let s = {
    ...base(),
    boxes: [
      { ...base().boxes[0], lines: [] },
      { ...base().boxes[1], lines: [] },
    ],
  };
  // Приняли 5 на полку.
  s = step(s, {
    ...s,
    boxes: [{ ...s.boxes[0], lines: [{ productId: "p1", qty: 5 }] }, s.boxes[1]],
    receivingEvents: [
      { id: "e1", productId: "p1", qty: 5, boxId: "b1", staffId: "stf-ivan", timestamp: 1 },
    ],
  });
  // Собрали 3 в тару по одной.
  for (let n = 1; n <= 3; n += 1) {
    s = step(s, {
      ...s,
      boxes: [
        { ...s.boxes[0], lines: [{ productId: "p1", qty: 5 - n }] },
        { ...s.boxes[1], lines: [{ productId: "p1", qty: n }] },
      ],
      requests: [
        { ...s.requests[0], pickedQty: n, toteId: "t1", status: n === 3 ? "done" : "in_progress" },
      ],
    });
  }
  // Упаковали тару в короб отгрузки.
  s = step(s, {
    ...s,
    boxes: [s.boxes[0], { ...s.boxes[1], lines: [] }],
    outboundBoxes: [
      { id: "o1", code: "UK-OUT-A", lines: [{ productId: "p1", qty: 3 }], requestIds: ["r1"] },
    ],
    requests: [{ ...s.requests[0], packedAt: 9, packedBy: "stf-ivan" }],
  });
  // Рейс увёз короб.
  s = step(s, {
    ...s,
    outboundBoxes: [{ ...s.outboundBoxes[0], shipmentId: "sh1", shippedAt: 10 }],
    shipments: [
      { id: "sh1", destination: "", requestIds: ["r1"], staffId: "stf-ivan", shippedAt: 10 },
    ],
  });
  const inBoxes = s.boxes.flatMap((b) => b.lines).reduce((n, l) => n + l.qty, 0);
  const gone = s.outboundBoxes
    .filter((b) => b.shipmentId)
    .flatMap((b) => b.lines)
    .reduce((n, l) => n + l.qty, 0);
  assert.equal(inBoxes, 5 - 3);
  assert.equal(gone, 3);
  // Двойного счёта нет: собранное (3) не дало права снять ещё что-то с полки.
  const steal = {
    ...s,
    boxes: [{ ...s.boxes[0], lines: [{ productId: "p1", qty: 1 }] }, s.boxes[1]],
  };
  assert.deepEqual(mergeDeskWrite(s, steal, who).mismatch, ["p1"]);
});

test("лишнее с приёмки: сервер сам заводит спорное старшему, стол его не подделает", () => {
  const cur = {
    ...base(),
    expectedShipments: [
      { id: "s1", lines: [{ id: "l1", productId: "p2", expectedQty: 10, receivedQty: 0 }] },
    ],
  };
  const inc = {
    ...withBoxes(cur, cur.boxes[0].lines, [{ productId: "p2", qty: 14 }]),
    receivingEvents: [
      {
        id: "e1",
        productId: "p2",
        qty: 12,
        boxId: "t1",
        staffId: "stf-ivan",
        timestamp: 5,
        expectedShipmentLineId: "l1",
      },
    ],
    // Стол пытается завести «лишнее» сам — и сразу решённым.
    disputes: [
      ...cur.disputes,
      {
        id: "fake",
        kind: "receive_overage",
        productId: "p2",
        qty: 1,
        raisedBy: "stf-ivan",
        raisedAt: 5,
      },
    ],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, []);
  assert.equal(data.receivingEvents[0].discrepancy, "overage");
  const over = data.disputes.filter((d) => d.kind === "receive_overage");
  assert.deepEqual(over, [
    {
      id: "ovr-e1",
      kind: "receive_overage",
      boxId: "t1",
      toteCode: "UK-BOX-2",
      productId: "p2",
      qty: 2,
      raisedBy: "stf-ivan",
      raisedAt: 5,
    },
  ]);
  // Повтор той же записи второго спорного не заводит.
  const again = mergeDeskWrite(data, { ...data }, who).data;
  assert.equal(again.disputes.filter((d) => d.kind === "receive_overage").length, 1);
});

test("лишнее с приёмки решает старший: оставить или вернуть поставщику, не «вернуть на место»", () => {
  const open = {
    id: "ovr-e1",
    kind: "receive_overage",
    boxId: "t1",
    productId: "p2",
    qty: 2,
    raisedBy: "stf-ivan",
    raisedAt: 5,
  };
  const cur = { ...base(), disputes: [open] };
  const olga = { staff: "stf-olga" };
  const decide = (res, extra = {}) =>
    mergeDeskWrite(
      cur,
      {
        ...cur,
        disputes: [{ ...open, resolution: res, resolvedBy: "stf-olga", resolvedAt: 9, ...extra }],
      },
      olga,
    ).data.disputes[0];
  assert.equal(decide("returned").resolution, undefined);
  assert.equal(decide("accepted").resolution, "accepted");
  // Вернули поставщику: товар уходит из тары, сверка это признаёт.
  const r = mergeDeskWrite(
    cur,
    {
      ...withBoxes(cur, cur.boxes[0].lines, []),
      disputes: [
        {
          ...open,
          resolution: "written_off",
          resolvedBy: "stf-olga",
          resolvedAt: 9,
          note: "водитель забрал",
        },
      ],
    },
    olga,
  );
  assert.deepEqual(r.mismatch, []);
  assert.equal(r.data.disputes[0].resolution, "written_off");
  // «Оставить» у обычной недостачи не бывает.
  const d1 = base().disputes[0];
  const s = mergeDeskWrite(
    base(),
    {
      ...base(),
      disputes: [{ ...d1, resolution: "accepted", resolvedBy: "stf-olga", resolvedAt: 9 }],
    },
    olga,
  );
  assert.equal(s.data.disputes[0].resolution, undefined);
});

test("приёмка откатилась сверкой — её «лишнее» не остаётся", () => {
  const cur = base();
  const inc = {
    ...cur,
    // Событие есть, а в таре прироста нет: не сошлось.
    receivingEvents: [
      { id: "e9", productId: "p2", qty: 3, boxId: "t1", staffId: "stf-ivan", timestamp: 5 },
    ],
  };
  const { data, mismatch } = mergeDeskWrite(cur, inc, who);
  assert.deepEqual(mismatch, ["p2"]);
  assert.equal(data.disputes.filter((d) => d.kind === "receive_overage").length, 0);
});
