/**
 * Упаковка операциями: сервер сам повторяет закрытие тары по фактам стола.
 * Ошибка здесь — штука, которая ушла из тары и никуда не пришла, или короб
 * с товаром двух продавцов: и то и другое всплывает только на претензии.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyPackEvent, applyPackDone } = require("../src/cabinet/deskPack");

const AT = 1_800_000_000_000;
const data = () => ({
  products: [
    { id: "p1", partnerId: "s1" },
    { id: "p2", partnerId: "s1" },
    { id: "p9", partnerId: "s2" },
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
    { id: "t9", barcode: "UK-BOX-9", lines: [{ productId: "p9", qty: 1 }] },
  ],
  outboundBoxes: [],
  requests: [
    { id: "r1", productId: "p1", qty: 2, status: "done", toteId: "t1", note: "Тула" },
    { id: "r2", productId: "p2", qty: 1, status: "done", toteId: "t1", note: "Тула" },
  ],
  disputes: [],
  staffEvents: [],
});
const done = (over = {}) => ({
  eventId: "ev-done",
  staffId: "stf-ivan",
  at: AT,
  toteId: "t1",
  outboundCode: "uk-out-7",
  outboundId: "out1",
  lines: [
    { productId: "p1", qty: 2 },
    { productId: "p2", qty: 1 },
  ],
  requestIds: ["r1", "r2"],
  shortages: [],
  ...over,
});

test("закрытие тары: упакованное в короб, остаток в таре, заказы упакованы", () => {
  const r = applyPackDone(data(), done(), "stf-ivan");
  assert.equal(r.flag, undefined);
  assert.deepEqual(r.data.boxes[0].lines, [{ productId: "p1", qty: 1 }]);
  assert.deepEqual(r.data.outboundBoxes, [
    {
      id: "out1",
      code: "UK-OUT-7",
      lines: [
        { productId: "p1", qty: 2 },
        { productId: "p2", qty: 1 },
      ],
      requestIds: ["r1", "r2"],
      packedBy: ["stf-ivan"],
      createdAt: AT,
      updatedAt: AT,
    },
  ]);
  assert.deepEqual(
    r.data.requests.map((x) => [x.id, x.packedAt, x.packedBy]),
    [
      ["r1", AT, "stf-ivan"],
      ["r2", AT, "stf-ivan"],
    ],
  );
  assert.deepEqual(r.data.staffEvents.at(-1), {
    id: "ev-done",
    staffId: "stf-ivan",
    type: "pack_done",
    at: AT,
    station: "pack",
    code: "UK-BOX-1",
  });
});

test("больше, чем в таре, и чужая заявка — не проходят", () => {
  const more = applyPackDone(data(), done({ lines: [{ productId: "p1", qty: 4 }] }), "stf-ivan");
  assert.equal(more.flag, "stock");
  const other = data();
  other.requests[0].toteId = "t9";
  const r = applyPackDone(other, done(), "stf-ivan");
  // Заявка из другой тары не помечается упакованной этой.
  assert.deepEqual(
    r.data.requests.map((x) => x.packedAt ?? null),
    [null, AT],
  );
});

test("короб с чужим продавцом или другим назначением — пометка mixed", () => {
  const d = data();
  d.outboundBoxes = [
    {
      id: "o9",
      code: "UK-OUT-7",
      lines: [{ productId: "p9", qty: 1 }],
      requestIds: [],
      packedBy: [],
    },
  ];
  assert.equal(applyPackDone(d, done(), "stf-ivan").flag, "mixed");

  const d2 = data();
  d2.requests.push({ id: "r9", productId: "p1", qty: 1, status: "done", note: "Казань" });
  d2.outboundBoxes = [
    {
      id: "o2",
      code: "UK-OUT-7",
      lines: [{ productId: "p1", qty: 1 }],
      requestIds: ["r9"],
      packedBy: [],
    },
  ];
  assert.equal(applyPackDone(d2, done(), "stf-ivan").flag, "mixed");
});

test("тот же короб того же назначения — состав копится", () => {
  const d = data();
  d.requests.push({ id: "r0", productId: "p1", qty: 1, status: "done", note: "Тула", packedAt: 1 });
  d.outboundBoxes = [
    {
      id: "o1",
      code: "UK-OUT-7",
      lines: [{ productId: "p1", qty: 1 }],
      requestIds: ["r0"],
      packedBy: ["stf-olga"],
    },
  ];
  const r = applyPackDone(d, done(), "stf-ivan");
  assert.deepEqual(r.data.outboundBoxes[0].lines, [
    { productId: "p1", qty: 3 },
    { productId: "p2", qty: 1 },
  ]);
  assert.deepEqual(r.data.outboundBoxes[0].packedBy, ["stf-olga", "stf-ivan"]);
});

test("недостача: спорное старшему, прирост не больше остатка в таре", () => {
  const r = applyPackDone(
    data(),
    done({ shortages: [{ id: "d1", productId: "p1", qty: 1 }] }),
    "stf-ivan",
  );
  assert.deepEqual(r.data.disputes, [
    {
      id: "d1",
      kind: "shortage",
      boxId: "t1",
      toteCode: "UK-BOX-1",
      productId: "p1",
      qty: 1,
      raisedBy: "stf-ivan",
      raisedAt: AT,
    },
  ]);
  const big = applyPackDone(
    data(),
    done({ shortages: [{ id: "d1", productId: "p1", qty: 2 }] }),
    "stf-ivan",
  );
  assert.equal(big.flag, "stock");
});

test("повтор закрытия, уже пришедшего снимком, ничего не меняет", () => {
  const d = data();
  d.staffEvents = [{ id: "ev-done", staffId: "stf-ivan", type: "pack_done", at: AT }];
  const r = applyPackDone(d, done(), "stf-ivan");
  assert.equal(r.data, d);
});

test("скан и брак: запись в журнал, брак — спорное старшему", () => {
  const scan = applyPackEvent(
    data(),
    { eventId: "e1", type: "pack_scan", at: AT, toteId: "t1", productId: "p1", code: "460" },
    "stf-ivan",
  );
  assert.deepEqual(scan.data.staffEvents, [
    {
      id: "e1",
      staffId: "stf-ivan",
      type: "pack_scan",
      at: AT,
      station: "pack",
      code: "460",
      productId: "p1",
    },
  ]);
  const reject = applyPackEvent(
    data(),
    {
      eventId: "e2",
      type: "pack_reject",
      at: AT,
      toteId: "t1",
      productId: "p1",
      dispute: { id: "d2", kind: "not_packable", qty: 1 },
    },
    "stf-ivan",
  );
  assert.equal(reject.data.disputes[0].kind, "not_packable");
  assert.equal(reject.data.disputes[0].boxId, "t1");
  // Недостачу скан не заводит: её считает закрытие тары.
  const bad = applyPackEvent(
    data(),
    {
      eventId: "e3",
      type: "pack_error",
      at: AT,
      toteId: "t1",
      productId: "p1",
      dispute: { id: "d3", kind: "shortage", qty: 1 },
    },
    "stf-ivan",
  );
  assert.equal(bad.flag, "bad");
  assert.equal(
    applyPackEvent(data(), { eventId: "e4", type: "shift_start", at: AT }, "stf-ivan").flag,
    "bad",
  );
});

test("чужой id спорного: недостача по одному товару не растит списание другого", () => {
  const d = data();
  d.disputes = [
    { id: "dB", kind: "shortage", boxId: "t1", productId: "p2", qty: 1, raisedBy: "stf-olga" },
  ];
  const r = applyPackDone(
    d,
    done({ shortages: [{ id: "dB", productId: "p1", qty: 2 }] }),
    "stf-ivan",
  );
  assert.equal(r.flag, "bad");
  const scan = applyPackEvent(
    d,
    {
      eventId: "e5",
      type: "pack_reject",
      at: AT,
      toteId: "t1",
      productId: "p1",
      dispute: { id: "dB", kind: "not_packable", qty: 2 },
    },
    "stf-ivan",
  );
  assert.equal(scan.flag, "bad");
});

test("брак: одна штука за скан и не больше, чем лежит в таре", () => {
  const reject = (id, qty, disputes = []) =>
    applyPackEvent(
      { ...data(), disputes },
      {
        eventId: id,
        type: "pack_reject",
        at: AT,
        toteId: "t1",
        productId: "p2",
        dispute: { id: "d2", kind: "not_packable", qty },
      },
      "stf-ivan",
    );
  assert.equal(reject("e1", 100_000).flag, "bad");
  const one = reject("e1", 1);
  assert.equal(one.data.disputes[0].qty, 1);
  // В таре одна штука p2 — второго брака по ней не бывает.
  assert.equal(reject("e2", 2, one.data.disputes).flag, "stock");
  // Недостача и брак вместе — не больше остатка: штуку не списать дважды.
  const d = data();
  d.disputes = [
    { id: "d9", kind: "not_packable", boxId: "t1", productId: "p1", qty: 1, raisedBy: "stf-ivan" },
  ];
  const both = applyPackDone(
    d,
    done({ shortages: [{ id: "d1", productId: "p1", qty: 1 }] }),
    "stf-ivan",
  );
  assert.equal(both.flag, "stock");
});

test("заказ не закрывается без своего товара в коробе", () => {
  const empty = applyPackDone(data(), done({ lines: [] }), "stf-ivan");
  assert.equal(empty.flag, "stock");
  const short = applyPackDone(data(), done({ lines: [{ productId: "p1", qty: 2 }] }), "stf-ivan");
  assert.equal(short.flag, "stock");
  // Несобранная заявка упакованной не становится.
  const d = data();
  d.requests[1].status = "picking";
  const r = applyPackDone(d, done({ lines: [{ productId: "p1", qty: 2 }] }), "stf-ivan");
  assert.equal(r.flag, undefined);
  assert.equal(r.data.requests[1].packedAt, undefined);
});
