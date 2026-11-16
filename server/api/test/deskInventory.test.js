/**
 * Инвентаризация со стола. Ошибка здесь — остаток, который правят без
 * второго человека, излишек, появившийся из ничего, или пересчёт, который
 * подсказал сотруднику, сколько должно быть. Всё это всплывает через
 * месяц разницей в акте для продавца.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyInvCount, applyInvCell } = require("../src/cabinet/deskInventory");
const { applyDisputeResolve } = require("../src/cabinet/deskShip");
const { mergeDeskWrite } = require("../src/cabinet/desks");

const AT = 1_800_000_000_000;
const ADDR = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const data = () => ({
  warehouse: {
    staff: [
      { id: "stf-ivan", role: "Кладовщик" },
      { id: "stf-olga", role: "Старший смены" },
    ],
  },
  products: [{ id: "p1" }, { id: "p2" }],
  boxes: [
    { id: "b1", barcode: "UK-BOX-1", address: ADDR, lines: [{ productId: "p1", qty: 10 }] },
    { id: "b2", barcode: "UK-BOX-2", lines: [{ productId: "p1", qty: 4 }] },
    { id: "b3", barcode: "UK-BOX-3", address: ADDR, sealed: true, lines: [] },
  ],
  disputes: [],
  placements: {},
  receivingEvents: [],
  requests: [],
  outboundBoxes: [],
});
// Права роли за столом: у Ольги есть решения по товару, у Ивана — нет.
const WHO = {
  perms: { "stf-olga": ["goods.decide", "goods.writeoff"], "stf-ivan": ["inventory.count"] },
};
const count = (lines, over = {}) => ({ eventId: "ic-1", at: AT, boxId: "b1", lines, ...over });
const open = (kind, qty, over = {}) => ({
  id: "inv-ic-1-p1",
  kind,
  boxId: "b1",
  productId: "p1",
  qty,
  raisedBy: "stf-ivan",
  raisedAt: AT,
  ...over,
});

test("сошлось: на таре отметка, спорного нет", () => {
  const r = applyInvCount(data(), count([{ productId: "p1", qty: 10 }]), "stf-ivan");
  assert.equal(r.flag, undefined);
  assert.equal(r.data.disputes.length, 0);
  assert.equal(r.data.boxes[0].countedAt, AT);
  assert.equal(r.data.boxes[0].countedBy, "stf-ivan");
});

test("меньше учёта — недостача, больше — излишек, чужой товар — излишек", () => {
  const r = applyInvCount(
    data(),
    count([
      { productId: "p1", qty: 7 },
      { productId: "p2", qty: 3 },
    ]),
    "stf-ivan",
  );
  const byProduct = Object.fromEntries(r.data.disputes.map((d) => [d.productId, d]));
  assert.equal(byProduct.p1.kind, "inventory_short");
  assert.equal(byProduct.p1.qty, 3);
  assert.equal(byProduct.p2.kind, "inventory_over");
  assert.equal(byProduct.p2.qty, 3);
  assert.equal(byProduct.p1.raisedBy, "stf-ivan");
  assert.equal(byProduct.p1.toteCode, "UK-BOX-1");
});

test("пересчёт не двигает остатки: строки тары те же", () => {
  const r = applyInvCount(data(), count([{ productId: "p1", qty: 0 }]), "stf-ivan");
  assert.deepEqual(r.data.boxes[0].lines, [{ productId: "p1", qty: 10 }]);
});

test("пустой пересчёт — вся тара недостача", () => {
  const r = applyInvCount(data(), count([]), "stf-ivan");
  assert.equal(r.data.disputes[0].qty, 10);
});

test("отказы: нет тары, не на полке, невскрытое место, нет товара, плохие числа", () => {
  const ok = [{ productId: "p1", qty: 1 }];
  assert.equal(applyInvCount(data(), count(ok, { boxId: "zz" }), "stf-ivan").flag, "bad");
  assert.equal(applyInvCount(data(), count(ok, { boxId: "b2" }), "stf-ivan").flag, "stock");
  assert.equal(applyInvCount(data(), count(ok, { boxId: "b3" }), "stf-ivan").flag, "stock");
  assert.equal(
    applyInvCount(data(), count([{ productId: "nope", qty: 1 }]), "stf-ivan").flag,
    "bad",
  );
  for (const qty of [-1, 1.5, 100_001, "5"]) {
    assert.equal(
      applyInvCount(data(), count([{ productId: "p1", qty }]), "stf-ivan").flag,
      "bad",
      String(qty),
    );
  }
});

test("пока старший не решил прошлое расхождение, новый пересчёт не принимается", () => {
  const d = data();
  d.disputes = [open("inventory_short", 2)];
  assert.equal(applyInvCount(d, count([], { eventId: "ic-2" }), "stf-ivan").flag, "open");
});

test("повтор того же пересчёта не задваивает спорное", () => {
  const first = applyInvCount(data(), count([{ productId: "p1", qty: 7 }]), "stf-ivan");
  const again = applyInvCount(first.data, count([{ productId: "p1", qty: 7 }]), "stf-ivan");
  assert.equal(again.data.disputes.length, 1);
});

test("недостачу списывает тот, у кого право решений и кто её не нашёл, с причиной", () => {
  const d = data();
  d.disputes = [open("inventory_short", 3)];
  const body = { disputeId: "inv-ic-1-p1", resolution: "written_off", at: AT, note: "пересчитали" };
  assert.equal(applyDisputeResolve(d, body, "stf-ivan", WHO).flag, "not_yours");
  assert.equal(applyDisputeResolve(d, { ...body, note: "" }, "stf-olga", WHO).flag, "not_yours");
  const r = applyDisputeResolve(d, body, "stf-olga", WHO);
  assert.equal(r.data.boxes[0].lines[0].qty, 7);
  assert.equal(r.data.disputes[0].resolution, "written_off");
});

test("излишек оприходует сотрудник с правом решений, с причиной; «вернули» — без правки учёта", () => {
  const d = data();
  d.disputes = [open("inventory_over", 3)];
  const body = { disputeId: "inv-ic-1-p1", resolution: "accepted", at: AT, note: "нашли на полке" };
  assert.equal(applyDisputeResolve(d, body, "stf-ivan", WHO).flag, "not_yours");
  const same = { ...d, disputes: [open("inventory_over", 3, { raisedBy: "stf-olga" })] };
  assert.equal(applyDisputeResolve(same, body, "stf-olga", WHO).flag, "not_yours");
  const r = applyDisputeResolve(d, body, "stf-olga", WHO);
  assert.equal(r.data.boxes[0].lines[0].qty, 13);
  const back = applyDisputeResolve(
    d,
    { ...body, resolution: "returned", note: "" },
    "stf-olga",
    WHO,
  );
  assert.equal(back.data.boxes[0].lines[0].qty, 10);
});

test("недопустимые решения: излишек не списывают, недостачу не оприходуют", () => {
  const over = data();
  over.disputes = [open("inventory_over", 3)];
  const short = data();
  short.disputes = [open("inventory_short", 3)];
  const body = { disputeId: "inv-ic-1-p1", at: AT, note: "x" };
  assert.equal(
    applyDisputeResolve(over, { ...body, resolution: "written_off" }, "stf-olga", WHO).flag,
    "bad",
  );
  assert.equal(
    applyDisputeResolve(short, { ...body, resolution: "accepted" }, "stf-olga", WHO).flag,
    "bad",
  );
});

test("запись стола: оприходование излишка проходит сверку, а излишек из ничего — нет", () => {
  const current = data();
  current.disputes = [open("inventory_over", 3)];
  const who = { staff: "stf-olga", prev: null, ...WHO };
  // Решение сотрудника с правом (как делает операция) — остатки сходятся.
  const resolved = applyDisputeResolve(
    current,
    { disputeId: "inv-ic-1-p1", resolution: "accepted", at: AT, note: "нашли" },
    "stf-olga",
    WHO,
  ).data;
  const good = mergeDeskWrite(current, resolved, who);
  assert.deepEqual(good.mismatch, []);
  assert.equal(good.data.boxes[0].lines[0].qty, 13);
  // Те же 3 штуки в таре без решения старшего — это товар из ничего.
  const forged = {
    ...current,
    boxes: current.boxes.map((b) =>
      b.id === "b1" ? { ...b, lines: [{ productId: "p1", qty: 13 }] } : b,
    ),
  };
  assert.deepEqual(mergeDeskWrite(current, forged, who).mismatch, ["p1"]);
});

test("запись стола: решение рядового сотрудника по излишку не принимается", () => {
  const current = data();
  current.disputes = [open("inventory_over", 3)];
  const sneaky = {
    ...current,
    disputes: [
      {
        ...current.disputes[0],
        resolution: "accepted",
        resolvedBy: "stf-ivan",
        resolvedAt: AT,
        note: "x",
      },
    ],
  };
  const w = mergeDeskWrite(current, sneaky, { staff: "stf-ivan", prev: null, ...WHO });
  assert.equal(w.data.disputes[0].resolution, undefined);
});

test("тара с нерешённым расхождением заморожена: из неё не собирают", () => {
  const { applyPickUnit } = require("../src/cabinet/deskPick");
  const d = data();
  d.boxes.push({ id: "tote", barcode: "UK-BOX-9", lines: [] });
  d.requests = [{ id: "r1", productId: "p1", qty: 1, status: "in_progress" }];
  d.staffEvents = [];
  const body = {
    eventId: "pk1",
    at: AT,
    requestId: "r1",
    productId: "p1",
    toteId: "tote",
    cell: ADDR,
  };
  d.disputes = [open("inventory_short", 2)];
  assert.equal(applyPickUnit(d, body, "stf-ivan").flag, "stock");
  d.disputes = [open("inventory_short", 2, { resolution: "returned", resolvedBy: "stf-olga" })];
  assert.equal(applyPickUnit(d, body, "stf-ivan").flag, undefined);
});

test("тара с нерешённым расхождением: в неё не принимают, её не ставят на паллету", () => {
  const { applyRecvUnit, applyRecvAttach } = require("../src/cabinet/deskReceive");
  const d = data();
  d.products.push({ id: "p3" });
  d.pallets = [{ id: "pl1", barcode: "UK-PLT-1", boxIds: [] }];
  d.disputes = [open("inventory_short", 2, { boxId: "b2" })];
  const unit = { eventId: "r1", at: AT, productId: "p1", boxId: "b2", qty: 1 };
  assert.equal(applyRecvUnit(d, unit, "stf-ivan").flag, "stock");
  assert.equal(applyRecvAttach(d, { boxId: "b2", palletId: "pl1" }).flag, "stock");
  d.disputes = [];
  assert.equal(applyRecvAttach(d, { boxId: "b2", palletId: "pl1" }).flag, undefined);
});

// Пересчёт ячейки без тары: план склада с двумя ячейками на полке m1.
const withPlan = () => ({
  ...data(),
  warehouse: {
    ...data().warehouse,
    floors: [{ id: "f1", modules: [{ id: "m1", shelves: [{ id: "s0", cells: 2 }] }] }],
  },
  boxes: [...data().boxes, { id: "b4", barcode: "UK-BOX-4", lines: [] }],
});
const FREE = { ...ADDR, cellIndex: 1 };
const cellCount = (lines, over = {}) => ({ eventId: "icc-1", at: AT, cell: FREE, lines, ...over });

test("пустая ячейка: «пусто» не трогает снимок, ячейка с тарой — считают тару", () => {
  const d = withPlan();
  const empty = applyInvCell(d, cellCount([]), "stf-ivan");
  assert.equal(empty.flag, undefined);
  assert.equal(empty.data, d);
  assert.equal(applyInvCell(d, cellCount([], { cell: ADDR }), "stf-ivan").flag, "busy");
  assert.equal(
    applyInvCell(d, cellCount([], { cell: { ...ADDR, moduleId: "x" } }), "stf-ivan").flag,
    "bad",
  );
});

test("нашли товар в пустой ячейке: свободная тара встаёт туда, излишек — старшему", () => {
  const r = applyInvCell(
    withPlan(),
    cellCount([{ productId: "p2", qty: 3 }], { boxId: "b4" }),
    "stf-ivan",
  );
  assert.equal(r.flag, undefined);
  const box = r.data.boxes.find((b) => b.id === "b4");
  assert.deepEqual(box.address, FREE);
  assert.deepEqual(box.lines, []);
  assert.deepEqual(
    r.data.disputes.map((x) => [x.kind, x.boxId, x.productId, x.qty, x.raisedBy]),
    [["inventory_over", "b4", "p2", 3, "stf-ivan"]],
  );
  // Повтор той же операции спорное не задваивает.
  assert.equal(
    applyInvCell(r.data, cellCount([{ productId: "p2", qty: 3 }], { boxId: "b4" }), "stf-ivan")
      .data,
    r.data,
  );
  // Старший оприходует излишек в эту тару — как после пересчёта тары.
  const ok = applyDisputeResolve(
    r.data,
    { at: AT + 1, disputeId: "inv-icc-1-p2", resolution: "accepted", note: "нашли за стеллажом" },
    "stf-olga",
    WHO,
  );
  assert.equal(ok.flag, undefined);
  assert.deepEqual(ok.data.boxes.find((b) => b.id === "b4").lines, [{ productId: "p2", qty: 3 }]);
});

test("найденное — только в свободную тару: без тары, с товаром, на другом месте — отказ", () => {
  const d = withPlan();
  const found = [{ productId: "p1", qty: 1 }];
  assert.equal(applyInvCell(d, cellCount(found), "stf-ivan").flag, "bad");
  assert.equal(applyInvCell(d, cellCount(found, { boxId: "b2" }), "stf-ivan").flag, "stock");
  assert.equal(applyInvCell(d, cellCount(found, { boxId: "b3" }), "stf-ivan").flag, "stock");
  assert.equal(
    applyInvCell(d, cellCount([{ productId: "nope", qty: 1 }], { boxId: "b4" }), "stf-ivan").flag,
    "bad",
  );
  assert.equal(
    applyInvCell(d, cellCount([{ productId: "p1", qty: -1 }], { boxId: "b4" }), "stf-ivan").flag,
    "bad",
  );
});

test("ячейка с паллетой или товаром без тары — не пустая; тара с паллеты — не свободная", () => {
  const found = [{ productId: "p1", qty: 1 }];
  const pallet = (over) => ({ id: "pl1", barcode: "UK-PLT-1", boxIds: [], ...over });
  // Паллета стоит в этой ячейке.
  const withPallet = { ...withPlan(), pallets: [pallet({ address: FREE })] };
  assert.equal(applyInvCell(withPallet, cellCount([]), "stf-ivan").flag, "busy");
  // Товар положен прямо в ячейку: по учёту он здесь, излишком не станет.
  const withPlaced = { ...withPlan(), placements: { p1: FREE } };
  assert.equal(
    applyInvCell(withPlaced, cellCount(found, { boxId: "b4" }), "stf-ivan").flag,
    "busy",
  );
  // Короб на паллете в другой ячейке: адреса у него нет, но он не свободен.
  const onPallet = withPlan();
  onPallet.boxes = onPallet.boxes.map((b) => (b.id === "b4" ? { ...b, palletId: "pl1" } : b));
  onPallet.pallets = [pallet({ address: ADDR, boxIds: ["b4"] })];
  assert.equal(applyInvCell(onPallet, cellCount(found, { boxId: "b4" }), "stf-ivan").flag, "stock");
  // Короб в списке паллеты без своей отметки — тоже.
  const listed = { ...withPlan(), pallets: [pallet({ boxIds: ["b4"] })] };
  assert.equal(applyInvCell(listed, cellCount(found, { boxId: "b4" }), "stf-ivan").flag, "stock");
});
