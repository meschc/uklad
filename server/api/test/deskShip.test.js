/**
 * Рейс и решение старшего операциями. Ошибка здесь — заявка, уехавшая
 * чужой машиной, короб другого назначения в кузове или списание без
 * четырёх глаз: всё это всплывает только претензией продавца.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyShipRun, applyDisputeResolve } = require("../src/cabinet/deskShip");

// Право решать — у роли Ольги (миграция 024), должность тут ни при чём.
const DECIDES = { "stf-olga": ["goods.decide"] };
const resolve = (data, body, ref) => applyDisputeResolve(data, body, ref, { perms: DECIDES });

const AT = 1_800_000_000_000;
const data = () => ({
  warehouse: {
    staff: [
      { id: "stf-ivan", role: "Грузчик" },
      { id: "stf-olga", role: "Старший смены" },
    ],
  },
  requests: [
    { id: "r1", productId: "p1", qty: 1, status: "done", note: "Тула" },
    { id: "r2", productId: "p1", qty: 1, status: "done", note: "Тула" },
    { id: "r3", productId: "p1", qty: 1, status: "in_progress", note: "Тула" },
    { id: "r9", productId: "p1", qty: 1, status: "done", note: "Казань" },
  ],
  outboundBoxes: [
    { id: "o1", code: "UK-OUT-1", requestIds: ["r1", "r2"], lines: [{ productId: "p1", qty: 2 }] },
    { id: "o9", code: "UK-OUT-9", requestIds: ["r9"], lines: [{ productId: "p1", qty: 1 }] },
  ],
  shipments: [],
  boxes: [{ id: "t1", lines: [{ productId: "p1", qty: 3 }] }],
  disputes: [
    { id: "d1", kind: "shortage", boxId: "t1", productId: "p1", qty: 2, raisedBy: "stf-ivan" },
    {
      id: "d2",
      kind: "receive_overage",
      boxId: "t1",
      productId: "p1",
      qty: 1,
      raisedBy: "stf-ivan",
    },
  ],
});
const run = (over = {}) => ({
  eventId: "ship-1",
  at: AT,
  requestIds: ["r1", "r2", "r3"],
  vehicle: "А123ВС77",
  units: ["uk-out-1"],
  ...over,
});

test("рейс: собранное уехало, короб отгрузки погружен, рейс за тем, кто за столом", () => {
  const r = applyShipRun(data(), run(), "stf-ivan");
  assert.equal(r.flag, undefined);
  const st = Object.fromEntries(r.data.requests.map((x) => [x.id, x.status]));
  // «В работе» остаётся на складе.
  assert.deepEqual(st, { r1: "shipped", r2: "shipped", r3: "in_progress", r9: "done" });
  assert.deepEqual(r.data.shipments[0], {
    id: "ship-1",
    destination: "Тула",
    requestIds: ["r1", "r2"],
    vehicle: "А123ВС77",
    staffId: "stf-ivan",
    shippedAt: AT,
    units: ["UK-OUT-1"],
  });
  assert.equal(r.data.outboundBoxes[0].shipmentId, "ship-1");
  assert.equal(r.data.outboundBoxes[1].shipmentId, undefined);
  // Повтор (рейс уже пришёл снимком) — то же самое.
  assert.equal(applyShipRun(r.data, run(), "stf-ivan").data, r.data);
});

test("в машину не кладут чужой короб, уехавший короб и два назначения", () => {
  assert.equal(applyShipRun(data(), run({ units: ["UK-OUT-9"] }), "stf-ivan").flag, "mixed");
  assert.equal(
    applyShipRun(data(), run({ requestIds: ["r1", "r9"], units: ["UK-OUT-1"] }), "stf-ivan").flag,
    "mixed",
  );
  // Короб на r1 и r2, а уезжает только r1 — половина короба осталась бы.
  assert.equal(applyShipRun(data(), run({ requestIds: ["r1"] }), "stf-ivan").flag, "mixed");
  const gone = applyShipRun(data(), run(), "stf-ivan").data;
  gone.requests.push({ id: "r4", status: "done", note: "Тула" });
  assert.equal(
    applyShipRun(gone, run({ eventId: "ship-2", requestIds: ["r4"] }), "stf-ivan").flag,
    "mixed",
  );
  assert.equal(applyShipRun(data(), run({ requestIds: ["r3"] }), "stf-ivan").flag, "stock");
  assert.equal(applyShipRun(data(), run({ vehicle: " " }), "stf-ivan").flag, "bad");
  assert.equal(applyShipRun(data(), run({ units: ["ПОЛКА-1"] }), "stf-ivan").flag, "bad");
});

test("заявка не уезжает без своего короба, тара с хранения в рейс не попадает", () => {
  // r9 в коробе UK-OUT-9, который остался у стола: Тула уезжает, r9 ждёт.
  const two = data();
  two.requests[3].note = "Тула";
  const r = applyShipRun(two, run({ requestIds: ["r1", "r2", "r9"] }), "stf-ivan");
  assert.deepEqual(r.data.shipments[0].requestIds, ["r1", "r2"]);
  assert.equal(r.data.requests[3].status, "done");
  // Ни одна заявка без короба не уедет — рейса нет.
  assert.equal(
    applyShipRun(two, run({ requestIds: ["r9"], units: ["UK-PLT-77"] }), "stf-ivan").flag,
    "stock",
  );
  // У r1 второй короб у стола: первый уехал бы с половиной заказа.
  const split = data();
  split.outboundBoxes.push({ id: "o2", code: "UK-OUT-2", requestIds: ["r1"], lines: [] });
  assert.equal(applyShipRun(split, run(), "stf-ivan").flag, "mixed");
  assert.equal(
    applyShipRun(split, run({ units: ["UK-OUT-1", "UK-OUT-2"] }), "stf-ivan").flag,
    undefined,
  );
  // Тара на полке и невскрытое место — на хранении, их в машину не грузят.
  const stored = data();
  stored.boxes.push({ id: "t2", barcode: "UK-BOX-000002", address: { moduleId: "m1" }, lines: [] });
  stored.pallets = [{ id: "pl1", barcode: "UK-PLT-000001", sealed: true, boxIds: [] }];
  for (const u of ["UK-BOX-000002", "uk-plt-000001"]) {
    assert.equal(applyShipRun(stored, run({ units: ["UK-OUT-1", u] }), "stf-ivan").flag, "bad");
  }
  // Паллета, собранная под отгрузку (не на хранении), едет как раньше.
  assert.equal(
    applyShipRun(stored, run({ units: ["UK-OUT-1", "UK-PLT-000777"] }), "stf-ivan").flag,
    undefined,
  );
});

test("решение спорного: только старший, списание с причиной и не тем, кто нашёл", () => {
  const body = (over) => ({ eventId: "dr-1", at: AT, disputeId: "d1", ...over });
  assert.equal(resolve(data(), body({ resolution: "returned" }), "stf-ivan").flag, "not_yours");
  const back = resolve(data(), body({ resolution: "returned" }), "stf-olga");
  assert.deepEqual(
    [back.data.disputes[0].resolution, back.data.disputes[0].resolvedBy],
    ["returned", "stf-olga"],
  );
  assert.deepEqual(back.data.boxes, data().boxes);
  assert.equal(resolve(data(), body({ resolution: "written_off" }), "stf-olga").flag, "not_yours");
  const off = resolve(data(), body({ resolution: "written_off", note: "пересчитали" }), "stf-olga");
  assert.deepEqual(off.data.boxes[0].lines, [{ productId: "p1", qty: 1 }]);
  // Нельзя списать больше, чем лежит.
  const thin = data();
  thin.boxes[0].lines = [{ productId: "p1", qty: 1 }];
  assert.equal(
    resolve(thin, body({ resolution: "written_off", note: "x" }), "stf-olga").flag,
    "stock",
  );
});

test("лишнее с приёмки: оставить или вернуть поставщику; уже решённое — повтор", () => {
  const body = (over) => ({ eventId: "dr-2", at: AT, disputeId: "d2", ...over });
  assert.equal(resolve(data(), body({ resolution: "returned" }), "stf-olga").flag, "bad");
  const kept = resolve(data(), body({ resolution: "accepted" }), "stf-olga").data;
  assert.equal(kept.disputes[1].resolution, "accepted");
  assert.equal(resolve(kept, body({ resolution: "accepted" }), "stf-olga").data, kept);
  assert.equal(
    resolve(kept, body({ resolution: "written_off", note: "x" }), "stf-olga").flag,
    "bad",
  );
});

test("должность «Старший смены» без права роли решать не даёт", () => {
  const body = { eventId: "dr-9", at: AT, disputeId: "d1", resolution: "returned" };
  // Должность у Ольги прежняя, но роли с `goods.decide` нет.
  assert.equal(applyDisputeResolve(data(), body, "stf-olga", {}).flag, "not_yours");
  assert.equal(applyDisputeResolve(data(), body, "stf-olga", { perms: {} }).flag, "not_yours");
  // Право есть у Ивана-грузчика — решает он, должность не мешает.
  const ivan = { perms: { "stf-ivan": ["goods.decide"] } };
  assert.equal(
    applyDisputeResolve(data(), body, "stf-ivan", ivan).data.disputes[0].resolvedBy,
    "stf-ivan",
  );
});
