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
const { applyInvCount } = require("../src/cabinet/deskInventory");
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

test("недостачу списывает старший, не нашедший её, с причиной", () => {
  const d = data();
  d.disputes = [open("inventory_short", 3)];
  const body = { disputeId: "inv-ic-1-p1", resolution: "written_off", at: AT, note: "пересчитали" };
  assert.equal(applyDisputeResolve(d, body, "stf-ivan").flag, "not_yours");
  assert.equal(applyDisputeResolve(d, { ...body, note: "" }, "stf-olga").flag, "not_yours");
  const r = applyDisputeResolve(d, body, "stf-olga");
  assert.equal(r.data.boxes[0].lines[0].qty, 7);
  assert.equal(r.data.disputes[0].resolution, "written_off");
});

test("излишек оприходует старший с причиной; «вернули» — без правки учёта", () => {
  const d = data();
  d.disputes = [open("inventory_over", 3)];
  const body = { disputeId: "inv-ic-1-p1", resolution: "accepted", at: AT, note: "нашли на полке" };
  assert.equal(applyDisputeResolve(d, body, "stf-ivan").flag, "not_yours");
  const same = { ...d, disputes: [open("inventory_over", 3, { raisedBy: "stf-olga" })] };
  assert.equal(applyDisputeResolve(same, body, "stf-olga").flag, "not_yours");
  const r = applyDisputeResolve(d, body, "stf-olga");
  assert.equal(r.data.boxes[0].lines[0].qty, 13);
  const back = applyDisputeResolve(d, { ...body, resolution: "returned", note: "" }, "stf-olga");
  assert.equal(back.data.boxes[0].lines[0].qty, 10);
});

test("недопустимые решения: излишек не списывают, недостачу не оприходуют", () => {
  const over = data();
  over.disputes = [open("inventory_over", 3)];
  const short = data();
  short.disputes = [open("inventory_short", 3)];
  const body = { disputeId: "inv-ic-1-p1", at: AT, note: "x" };
  assert.equal(
    applyDisputeResolve(over, { ...body, resolution: "written_off" }, "stf-olga").flag,
    "bad",
  );
  assert.equal(
    applyDisputeResolve(short, { ...body, resolution: "accepted" }, "stf-olga").flag,
    "bad",
  );
});

test("запись стола: оприходование излишка проходит сверку, а излишек из ничего — нет", () => {
  const current = data();
  current.disputes = [open("inventory_over", 3)];
  const who = { staff: "stf-olga", prev: null };
  // Решение старшего (как делает операция) — остатки сходятся.
  const resolved = applyDisputeResolve(
    current,
    { disputeId: "inv-ic-1-p1", resolution: "accepted", at: AT, note: "нашли" },
    "stf-olga",
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
  const w = mergeDeskWrite(current, sneaky, { staff: "stf-ivan", prev: null });
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
