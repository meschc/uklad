/**
 * Грузовая приёмка операцией. Ошибка здесь — два места с одним ярлыком или
 * места, заведённые дважды: и то и другое всплывает только на товарной
 * приёмке, когда водитель уже уехал.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyRecvCargo, cargoMade } = require("../src/cabinet/deskReceive");

const AT = 1_800_000_000_000;
const data = () => ({
  pallets: [{ id: "pl0", barcode: "UK-PLT-12", boxIds: [] }],
  boxes: [],
  palletSeq: 5,
  boxSeq: 0,
  expectedShipments: [
    {
      id: "s1",
      status: "receiving",
      lines: [],
      cargo: { pallets: 1, boxes: 0, declaredPallets: 4, at: 1 },
    },
    { id: "s2", status: "closed", lines: [] },
  ],
});
const body = (over = {}) => ({
  eventId: "cg-1",
  at: AT,
  shipmentId: "s1",
  pallets: 2,
  boxes: 0,
  ...over,
});

test("места получают номера после самого старшего выданного и докладываются в поставку", () => {
  const r = applyRecvCargo(data(), body(), "stf-ivan");
  assert.equal(r.flag, undefined);
  assert.deepEqual(cargoMade(r.data, body()), {
    pallets: [
      { id: "cg-1-p0", barcode: "UK-PLT-13" },
      { id: "cg-1-p1", barcode: "UK-PLT-14" },
    ],
    boxes: [],
  });
  assert.equal(r.data.palletSeq, 14);
  assert.ok(r.data.pallets.slice(1).every((p) => p.sealed && p.shipmentId === "s1"));
  // Вторая машина докладывает, накладная остаётся прежней.
  assert.deepEqual(r.data.expectedShipments[0].cargo, {
    declaredPallets: 4,
    pallets: 3,
    boxes: 0,
    at: AT,
    staffId: "stf-ivan",
  });
  // Новая операция с тем же событием — это чужие места: второй комплект
  // ярлыков на те же коды не выдаём. Свой повтор сервер узнаёт по ключу.
  assert.equal(applyRecvCargo(r.data, body(), "stf-ivan").flag, "bad");
});

test("закрытая поставка, ноль мест и мусор в числах — отказ", () => {
  for (const over of [
    { shipmentId: "s2" },
    { shipmentId: "nope" },
    { pallets: 0, boxes: 0 },
    { pallets: -1 },
    { boxes: 1.5 },
    { pallets: 201 },
    { declaredBoxes: "3" },
    { eventId: "x".repeat(81) },
    // Мест больше двух объёмов накладной (и больше 300) не бывает.
    { pallets: 200, boxes: 101, declaredPallets: 1 },
  ]) {
    assert.equal(applyRecvCargo(data(), body(over), "stf-ivan").flag, "bad", JSON.stringify(over));
  }
});

test("по накладной мест можно до двух её объёмов", () => {
  const big = body({ pallets: 200, boxes: 200, declaredBoxes: 400 });
  assert.equal(applyRecvCargo(data(), big, "stf-ivan").flag, undefined);
});

test("снимок, который не влезет в лимит, не пишется вовсе — ни снимок, ни журнал", async () => {
  const { runDeskOps } = require("../src/cabinet/deskOps");
  const writes = [];
  const c = {
    query: async (sql) => {
      if (/FROM uklad\.cabinet_snapshots/.test(sql))
        return { rows: [{ version: 1, data: data() }] };
      if (/SELECT op_key/.test(sql)) return { rows: [] };
      writes.push(sql);
      return { rows: [] };
    },
  };
  const op = { key: "key-cargo-big", kind: "recv_cargo", body: { ...body(), staffId: "stf-ivan" } };
  const who = { staff: "stf-ivan", staffSince: AT - 60_000 };
  const out = await runDeskOps(c, "desk-1", [op], who, AT, {
    maxBytes: 100,
    withProducts: async (_c, d) => d,
    withoutProducts: (d) => d,
  });
  assert.deepEqual(out, { tooLarge: true });
  assert.deepEqual(writes, []);
});
