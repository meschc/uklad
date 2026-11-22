// Раскладка кабинета по строкам (миграция 021): туда и обратно без потерь.
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  splitRecords,
  assembleRecords,
  hasMarks,
  recordChanges,
} = require("../src/cabinet/records");

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
  misc: [{ id: "c1" }],
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
  assert.deepEqual(doc.misc, [{ id: "c1" }]);
  // Номер тары — значение справочника: строкой, а не в документе.
  assert.equal(doc.boxSeq, undefined);
  assert.deepEqual(doc.companySettings, { $rows: 1 });
  assert.deepEqual(
    items.map((i) => `${i.w}/${i.d}/${i.ref}`).sort(),
    [
      "/companySettings/boxSeq",
      "/staffEvents/s1",
      "wh_1/receivingEvents/e1",
      "wh_1/receivingEvents/e2",
      "wh_1/requests/r1",
      "wh_1/requests/r2",
      "wh_2/requests/r1",
      "wh_2/warehouseSettings/receiving",
    ].sort(),
  );
  assert.deepEqual(assembleRecords(doc, asRows(items)), data);
  // Исходник не тронут.
  assert.deepEqual(data, cabinet());
});

test("справочники — строками, на своих ключах после сборки", () => {
  const data = {
    warehouse: { id: "wh_1" },
    account: { company: "ООО Склад", inn: "7700000000" },
    breakPolicy: { minutes: 30 },
    palletSeq: 3,
    serviceSettings: { enabled: { pick: true }, prices: { pick: 15 } },
    devices: [{ id: "d1", name: "Стол 1" }],
    warehouseData: { wh_2: { serviceSettings: { enabled: {}, prices: {} }, devices: [] } },
  };
  const { doc, items } = splitRecords(data);
  for (const k of ["account", "breakPolicy", "palletSeq", "serviceSettings", "devices"]) {
    assert.equal(doc[k], undefined, k);
  }
  assert.deepEqual(doc.companySettings, { $rows: 3 });
  assert.deepEqual(doc.warehouseSettings, { $rows: 2 });
  assert.deepEqual(doc.warehouseData.wh_2, { warehouseSettings: { $rows: 2 } });
  assert.deepEqual(assembleRecords(doc, asRows(items)), data);
  // Чужой ключ в справочнике на кабинет не попадает.
  const odd = [{ w: "", d: "companySettings", data: { id: "floors", value: [{ id: "f1" }] } }];
  assert.equal(assembleRecords({ companySettings: { $rows: 1 } }, odd).floors, undefined);
  // Старый документ со значениями на месте читается как есть.
  assert.deepEqual(assembleRecords({ boxSeq: 4 }, []), { boxSeq: 4 });
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

test("разница строк: пишется только новое, изменённое и сдвинутое, пропавшее — в корзину", () => {
  const same = { id: "r1", qty: 1 };
  const before = [
    { w: "wh_1", d: "requests", ref: "r1", pos: 0, data: same },
    { w: "wh_1", d: "requests", ref: "r2", pos: 1, data: { id: "r2", qty: 2 } },
    { w: "wh_1", d: "requests", ref: "r3", pos: 2, data: { id: "r3", qty: 3 } },
    { w: "wh_1", d: "boxes", ref: "b1", pos: 0, data: { id: "b1" } },
    { w: "wh_1", d: "boxes", ref: "b2", pos: 1, data: { id: "b2" } },
  ];
  const after = [
    // Тот же объект — не трогаем.
    { w: "wh_1", d: "requests", ref: "r1", pos: 0, data: same },
    // Пересобран, но тот же по содержанию — тоже не трогаем.
    { w: "wh_1", d: "requests", ref: "r2", pos: 1, data: { id: "r2", qty: 2 } },
    // Изменён.
    { w: "wh_1", d: "requests", ref: "r3", pos: 2, data: { id: "r3", qty: 4 } },
    // Сдвинулся в списке.
    { w: "wh_1", d: "boxes", ref: "b2", pos: 0, data: { id: "b2" } },
    // Новый; тот же id в другом списке — другая строка.
    { w: "wh_1", d: "requests", ref: "b1", pos: 3, data: { id: "b1" } },
  ];
  const { upsert, remove } = recordChanges(before, after);
  assert.deepEqual(
    upsert.map((r) => `${r.d}/${r.ref}`),
    ["requests/r3", "boxes/b2", "requests/b1"],
  );
  assert.deepEqual(
    remove.map((r) => `${r.d}/${r.ref}`),
    ["boxes/b1"],
  );
});
