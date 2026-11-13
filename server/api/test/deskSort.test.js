/**
 * Сортировка посылок по паллетам назначения (`sort_place`): сервер не даёт
 * положить посылку на паллету другого склада площадки и переложить уже
 * разложенную посылку молча.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applySortPlace } = require("../src/cabinet/deskSort");

const data = () => ({
  requests: [
    { id: "r1", note: "WB Коледино" },
    { id: "r2", note: "WB Коледино" },
    { id: "r3", note: "Ozon Хоругвино" },
  ],
  outboundBoxes: [
    { code: "UK-OUT-1", requestIds: ["r1"] },
    { code: "UK-OUT-2", requestIds: ["r2"] },
    { code: "UK-OUT-3", requestIds: ["r3"] },
    { code: "UK-OUT-4", requestIds: ["r1"], shipmentId: "sh1" },
  ],
});
const put = (outboundCode, pallet) => ({ outboundCode, pallet, at: 5 });

test("посылка ложится на пустую паллету, повтор ничего не меняет", () => {
  const r = applySortPlace(data(), put("uk-out-1", "UK-PLT-A"));
  assert.equal(r.data.outboundBoxes[0].palletCode, "UK-PLT-A");
  assert.equal(applySortPlace(r.data, put("UK-OUT-1", "UK-PLT-A")).data, r.data);
});

test("та же паллета принимает только своё назначение", () => {
  const r = applySortPlace(data(), put("UK-OUT-1", "UK-PLT-A"));
  assert.ok(applySortPlace(r.data, put("UK-OUT-2", "UK-PLT-A")).data);
  assert.equal(applySortPlace(r.data, put("UK-OUT-3", "UK-PLT-A")).flag, "mixed");
});

test("разложенную посылку на другую паллету молча не перекладываем", () => {
  const r = applySortPlace(data(), put("UK-OUT-1", "UK-PLT-A"));
  assert.equal(applySortPlace(r.data, put("UK-OUT-1", "UK-PLT-B")).flag, "mixed");
});

test("отгруженная, чужая или кривая посылка — отказ", () => {
  assert.equal(applySortPlace(data(), put("UK-OUT-4", "UK-PLT-A")).flag, "bad");
  assert.equal(applySortPlace(data(), put("UK-OUT-9", "UK-PLT-A")).flag, "bad");
  assert.equal(applySortPlace(data(), put("UK-OUT-1", "UK-BOX-1")).flag, "bad");
});
