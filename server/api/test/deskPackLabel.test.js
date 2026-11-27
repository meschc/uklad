/**
 * Сервер сверяет этикетку с заказом на упаковке (ревизия 14.11, «лопата и
 * самокат»): раньше это делал только стол в браузере, и стол со сбоем или
 * подделанный запрос клеил этикетку одного покупателя на товар другого.
 * Сюда же — отменённый заказ и тара, которая ещё на приёмке.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyPackEvent, applyPackDone } = require("../src/cabinet/deskPack");

const AT = 1_800_000_000_000;
const ext = (id, productId, qty, externalId) => ({
  id,
  productId,
  qty,
  status: "done",
  toteId: "t1",
  source: "ozon",
  externalId,
  note: "ПВЗ",
});
const data = (over = {}) => ({
  products: [
    { id: "p1", partnerId: "s1" },
    { id: "p2", partnerId: "s1" },
  ],
  boxes: [
    {
      id: "t1",
      barcode: "UK-BOX-1",
      lines: [
        { productId: "p1", qty: 3 },
        { productId: "p2", qty: 1 },
      ],
    },
    { id: "t9", barcode: "UK-BOX-9", lines: [] },
  ],
  outboundBoxes: [],
  // Заказ А — одна лопата, заказ Б — самокат и лопата.
  requests: [
    ext("ra000001", "p1", 1, "A-1"),
    ext("rb000001", "p2", 1, "B-1"),
    ext("rb000002", "p1", 1, "B-1"),
  ],
  disputes: [],
  staffEvents: [],
  ...over,
});
let n = 0;
const label = (orderId, productId, code, over = {}) => ({
  eventId: `ev-l${++n}`,
  staffId: "stf-ivan",
  type: "pack_label",
  at: AT + n,
  toteId: "t1",
  code,
  orderId,
  ...(productId ? { productId } : {}),
  ...over,
});
const run = (d, ...bodies) => {
  let cur = d;
  for (const b of bodies) {
    const r = applyPackEvent(cur, b, "stf-ivan");
    if (r.flag) return r;
    cur = r.data;
  }
  return { data: cur };
};
const done = (over = {}) => ({
  eventId: "ev-done",
  staffId: "stf-ivan",
  at: AT + 1000,
  toteId: "t1",
  outboundCode: "UK-LBL-AB12-001",
  outboundId: "oa",
  lines: [{ productId: "p1", qty: 1 }],
  requestIds: ["ra000001"],
  shortages: [],
  ...over,
});

test("этикетка заказа на чужой товар, лишняя или из другой тары — отказ", () => {
  // Самокат с этикеткой заказа А (в заказе только лопата).
  assert.equal(run(data(), label("ra000001", "p2", "UK-LBL-AB12-001")).flag, "label");
  // Вторая этикетка на заказ из одной штуки.
  assert.equal(
    run(
      data(),
      label("ra000001", "p1", "UK-LBL-AB12-001"),
      label("ra000001", "p1", "UK-LBL-AB12-002"),
    ).flag,
    "label",
  );
  // Заказ лежит в другой таре.
  assert.equal(run(data(), label("ra000001", "p1", "X", { toteId: "t9" })).flag, "label");
  // Заказа нет.
  assert.equal(run(data(), label("nope", "p1", "X")).flag, "label");
  // Своя штука своего заказа — проходит и ложится в журнал.
  const ok = run(data(), label("ra000001", "p1", "UK-LBL-AB12-001"));
  assert.equal(ok.flag, undefined);
  assert.equal(ok.data.staffEvents.at(-1).orderId, "ra000001");
});

test("этикетка заказа из нескольких штук — только его собственный код", () => {
  const units = [
    label("rb000001", "p2", "UK-LBL-AB12-002"),
    label("rb000001", "p1", "UK-LBL-AB12-003"),
  ];
  assert.equal(run(data(), ...units, label("rb000001", null, "UK-ORD-A00001")).flag, "label");
  assert.equal(run(data(), ...units, label("rb000001", null, "uk-ord-000001")).flag, undefined);
});

test("отменённый заказ: этикетку не клеят, тару с ним не закрывают молча", () => {
  const d = data();
  d.requests[0] = { ...d.requests[0], status: "cancelled" };
  assert.equal(run(d, label("ra000001", "p1", "UK-LBL-AB12-001")).flag, "cancelled");
  assert.equal(applyPackDone(d, done(), "stf-ivan").flag, "cancelled");
  // Отменили одну строку заказа Б — весь заказ не пакуется.
  const b = data();
  b.requests[2] = { ...b.requests[2], status: "cancelled" };
  assert.equal(run(b, label("rb000001", "p2", "UK-LBL-AB12-002")).flag, "cancelled");
});

test("посылка закрывается только со своими этикетками, своим кодом и своим товаром", () => {
  // Без этикетки посылку не закрыть.
  assert.equal(applyPackDone(data(), done(), "stf-ivan").flag, "label");
  const labelled = run(data(), label("ra000001", "p1", "UK-LBL-AB12-001")).data;
  // Код посылки — не этикетка этого заказа.
  assert.equal(
    applyPackDone(labelled, done({ outboundCode: "UK-LBL-AB12-099" }), "stf-ivan").flag,
    "label",
  );
  // В посылку с номером А лёг ещё и самокат.
  assert.equal(
    applyPackDone(
      labelled,
      done({
        lines: [
          { productId: "p1", qty: 1 },
          { productId: "p2", qty: 1 },
        ],
      }),
      "stf-ivan",
    ).flag,
    "label",
  );
  const ok = applyPackDone(labelled, done(), "stf-ivan");
  assert.equal(ok.flag, undefined);
  assert.equal(ok.data.requests[0].packedAt, AT + 1000);
});

test("заказ из нескольких штук: посылка — по этикетке заказа после этикеток штук", () => {
  const units = [
    label("rb000001", "p2", "UK-LBL-AB12-002"),
    label("rb000001", "p1", "UK-LBL-AB12-003"),
  ];
  const order = label("rb000001", null, "UK-ORD-000001");
  const close = done({
    outboundCode: "UK-ORD-000001",
    outboundId: "ob",
    lines: [
      { productId: "p1", qty: 1 },
      { productId: "p2", qty: 1 },
    ],
    requestIds: ["rb000001", "rb000002"],
  });
  assert.equal(applyPackDone(run(data(), ...units).data, close, "stf-ivan").flag, "label");
  assert.equal(applyPackDone(run(data(), ...units, order).data, close, "stf-ivan").flag, undefined);
});

test("штуки, не ушедшие в посылку, после закрытия тары клеят заново", () => {
  // Первый заход: этикетка на лопату А, но тару закрыли без этой посылки.
  let d = run(data(), label("ra000001", "p1", "UK-LBL-AB12-001", { at: AT + 1 })).data;
  const empty = done({
    eventId: "ev-d1",
    at: AT + 10,
    outboundCode: "",
    lines: [],
    requestIds: [],
  });
  d = applyPackDone(d, empty, "stf-ivan").data;
  // Второй заход: новая этикетка той же штуки не «лишняя».
  const again = run(d, label("ra000001", "p1", "UK-LBL-CD34-001", { at: AT + 20 }));
  assert.equal(again.flag, undefined);
  const ok = applyPackDone(
    again.data,
    done({ eventId: "ev-d2", at: AT + 30, outboundCode: "UK-LBL-CD34-001" }),
    "stf-ivan",
  );
  assert.equal(ok.flag, undefined);
  // Этикетка первого захода посылку второго не закрывает.
  const old = applyPackDone(
    again.data,
    done({ eventId: "ev-d3", at: AT + 30, outboundCode: "UK-LBL-AB12-001" }),
    "stf-ivan",
  );
  assert.equal(old.flag, "label");
});

test("тара на приёмке в упаковку не берётся: не вскрыта или поставка не закрыта", () => {
  const fbo = {
    requests: [{ id: "r1", productId: "p1", qty: 1, status: "done", toteId: "t1", note: "Тула" }],
  };
  const close = done({
    outboundCode: "UK-OUT-1",
    outboundId: "o1",
    requestIds: ["r1"],
  });
  const sealed = data(fbo);
  sealed.boxes[0] = { ...sealed.boxes[0], sealed: true };
  assert.equal(applyPackDone(sealed, close, "stf-ivan").flag, "tote");
  const receiving = data({
    ...fbo,
    expectedShipments: [{ id: "sh1", status: "receiving", lines: [{ id: "l1", productId: "p1" }] }],
    receivingEvents: [
      { id: "re1", boxId: "t1", productId: "p1", qty: 3, expectedShipmentLineId: "l1" },
    ],
  });
  assert.equal(applyPackDone(receiving, close, "stf-ivan").flag, "tote");
  // Поставку закрыли — товар на учёте, тару можно паковать.
  receiving.expectedShipments[0].status = "closed";
  assert.equal(applyPackDone(receiving, close, "stf-ivan").flag, undefined);
  // Или тару уже поставили в ячейку.
  receiving.expectedShipments[0].status = "receiving";
  receiving.boxes[0] = { ...receiving.boxes[0], address: "A-01-01" };
  assert.equal(applyPackDone(receiving, close, "stf-ivan").flag, undefined);
});
