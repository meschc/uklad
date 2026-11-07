// Раскладка кабинета по строкам (миграция 021): туда и обратно без потерь.
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { splitRecords, assembleRecords, hasMarks } = require("../src/cabinet/records");

/** Строки, как их отдаёт база: по складу, списку и месту. */
const asRows = (items) =>
  [...items]
    .sort((a, b) => (a.w + a.d).localeCompare(b.w + b.d) || a.pos - b.pos)
    .map(({ w, d, data }) => ({ w, d, data }));

const cabinet = () => ({
  warehouse: { id: "wh_1", name: "Мезонин" },
  boxSeq: 7,
  requests: [
    { id: "r2", qty: 1 },
    { id: "r1", qty: 2 },
  ],
  receivingEvents: [{ id: "e1" }, { id: "e2" }],
  boxes: [],
  staffEvents: [{ id: "s1", type: "shift_start" }],
  // Список без id не раскладывается — остаётся в документе как был.
  tasks: [{ title: "без id" }],
  warehouseData: {
    wh_2: { requests: [{ id: "r1", qty: 9 }], receiving: { step: "idle" } },
    // Стопка активного склада рядом с ним самим — документом.
    wh_1: { requests: [{ id: "r1", qty: 5 }] },
  },
  chats: [{ id: "c1" }],
});

test("кабинет раскладывается по строкам и собирается обратно тем же", () => {
  const data = cabinet();
  const { doc, items } = splitRecords(data);
  assert.deepEqual(doc.requests, { $rows: 2 });
  assert.deepEqual(doc.boxes, { $rows: 0 });
  assert.deepEqual(doc.staffEvents, { $rows: 1 });
  assert.deepEqual(doc.tasks, [{ title: "без id" }]);
  assert.deepEqual(doc.warehouseData.wh_2.requests, { $rows: 1 });
  assert.deepEqual(doc.warehouseData.wh_1, { requests: [{ id: "r1", qty: 5 }] });
  // Не работа склада — не трогается.
  assert.deepEqual(doc.chats, [{ id: "c1" }]);
  assert.equal(doc.boxSeq, 7);
  assert.deepEqual(
    items.map((i) => `${i.w}/${i.d}/${i.ref}`).sort(),
    [
      "/staffEvents/s1",
      "wh_1/receivingEvents/e1",
      "wh_1/receivingEvents/e2",
      "wh_1/requests/r1",
      "wh_1/requests/r2",
      "wh_2/requests/r1",
    ].sort(),
  );
  assert.deepEqual(assembleRecords(doc, asRows(items)), data);
  // Исходник не тронут.
  assert.deepEqual(data, cabinet());
});

test("новое сверху не сдвигает остальные строки, новое снизу — тоже", () => {
  const pos = (list, key) =>
    Object.fromEntries(
      splitRecords({ warehouse: { id: "w" }, [key]: list }).items.map((i) => [i.ref, i.pos]),
    );
  const before = pos([{ id: "a" }, { id: "b" }], "requests");
  const after = pos([{ id: "c" }, { id: "a" }, { id: "b" }], "requests");
  assert.equal(after.a, before.a);
  assert.equal(after.b, before.b);
  assert.ok(after.c < after.a);
  const ev = pos([{ id: "a" }], "receivingEvents");
  assert.equal(pos([{ id: "a" }, { id: "b" }], "receivingEvents").a, ev.a);
});

test("одинаковые id — список остаётся документом, ничего не теряется", () => {
  const data = { warehouse: { id: "w" }, requests: [{ id: "a" }, { id: "a", qty: 2 }] };
  const { doc, items } = splitRecords(data);
  assert.deepEqual(doc.requests, data.requests);
  assert.deepEqual(items, []);
});

test("старый документ без меток читается как есть; метки снаружи — не кабинет", () => {
  const old = { warehouse: { id: "w" }, requests: [{ id: "a" }] };
  assert.deepEqual(assembleRecords(old, []), old);
  assert.equal(hasMarks(old), false);
  assert.equal(hasMarks({ ...old, requests: { $rows: 3 } }), true);
  assert.equal(hasMarks({ warehouseData: { w2: { boxes: { $rows: 0 } } } }), true);
});

test("без склада работа склада не раскладывается, журнал смен — да", () => {
  const { doc, items } = splitRecords({ requests: [{ id: "a" }], staffEvents: [{ id: "s" }] });
  assert.deepEqual(doc.requests, [{ id: "a" }]);
  assert.deepEqual(
    items.map((i) => i.d),
    ["staffEvents"],
  );
});
