/**
 * Руководитель склада — только своего склада (managerScope.js, Кирилл 22.11).
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { managerRef, restoreManager, foreignWarehouses } = require("../src/cabinet/managerScope");

const can = (perms) => ({ can: (p) => perms.includes(p) });
const company = () => ({
  warehouse: { id: "a", name: "А", staff: [{ id: "s-a" }] },
  boxes: [{ id: "t-a" }],
  otherWarehouses: [{ id: "b", name: "Б", staff: [{ id: "s-b" }] }],
  warehouseData: { b: { boxes: [{ id: "t-b" }] } },
  products: [{ id: "p1" }],
});

test("владелец — вся компания, руководитель — свой склад, без склада — отказ", () => {
  assert.equal(managerRef(can(["org.manage"]), { warehouse_ref: "b" }, company()), null);
  assert.equal(managerRef(can(["staff.manage"]), { warehouse_ref: "b" }, company()), "b");
  assert.equal(managerRef(can(["staff.manage"]), { warehouse_ref: null }, company()), false);
  assert.equal(managerRef(can(["staff.manage"]), { warehouse_ref: "x" }, company()), false);
});

test("запись руководителя склада Б не трогает склад А", () => {
  const full = company();
  const after = {
    warehouse: { id: "b", name: "Б2", staff: [{ id: "s-b" }, { id: "s-new" }] },
    boxes: [{ id: "t-b" }, { id: "t-b2" }],
    otherWarehouses: [],
    warehouseData: {},
    products: [{ id: "p1" }],
  };
  const out = restoreManager(full, after, "b");
  assert.deepEqual(out.warehouse, full.warehouse);
  assert.deepEqual(out.boxes, [{ id: "t-a" }]);
  assert.deepEqual(out.otherWarehouses, [after.warehouse]);
  assert.deepEqual(out.warehouseData.b.boxes, after.boxes);
});

test("чужой, новый или спрятанный склад в записи — отказ", () => {
  assert.equal(foreignWarehouses({ warehouse: { id: "b" }, otherWarehouses: [] }, "b"), false);
  assert.equal(
    foreignWarehouses({ warehouse: { id: "b" }, otherWarehouses: [{ id: "a" }] }, "b"),
    true,
  );
  assert.equal(
    foreignWarehouses(
      { warehouse: { id: "b" }, otherWarehouses: [{ id: "a", placeholder: true }] },
      "b",
    ),
    true,
  );
  assert.equal(foreignWarehouses({ warehouse: { id: "new" } }, "b"), true);
});
