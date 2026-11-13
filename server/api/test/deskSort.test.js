/**
 * Сортировка по местам отгрузки (`sort_place`, `sort_close`): сервер не даёт
 * положить посылку в место другого направления или в закрытую отгрузку и
 * переложить уже разложенную посылку молча.
 */
/* global require */
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { applySortClose, applySortPlace } = require("../src/cabinet/deskSort");

/** Как `targetCode` стола: хеш направления. */
function key(dest) {
  let h = 5381;
  for (const ch of dest.trim().toLowerCase()) h = (Math.imul(h, 33) + ch.charCodeAt(0)) >>> 0;
  return h.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}
const KOL = `UK-SORT-${key("WB Коледино")}-1`;

const data = () => ({
  requests: [
    { id: "r1", note: "WB Коледино" },
    { id: "r2", note: "WB Коледино" },
    { id: "r3", note: "Ozon Хоругвино" },
  ],
  outboundBoxes: [
    { id: "o1", code: "UK-ORD-1", requestIds: ["r1"] },
    { id: "o2", code: "UK-LBL-2", requestIds: ["r2"] },
    { id: "o3", code: "UK-OUT-3", requestIds: ["r3"] },
    { id: "o4", code: "UK-ORD-4", requestIds: ["r1"], shipmentId: "sh1" },
  ],
});
const put = (outboundCode, sortCode) => ({ outboundCode, sortCode, at: 5 });

test("посылка ложится в место своего направления, повтор ничего не меняет", () => {
  const r = applySortPlace(data(), put("uk-ord-1", KOL));
  assert.equal(r.data.outboundBoxes[0].sortCode, KOL);
  assert.equal(applySortPlace(r.data, put("UK-ORD-1", KOL)).data, r.data);
  assert.ok(applySortPlace(r.data, put("UK-LBL-2", KOL)).data);
});

test("место другого направления и переложить разложенную — отказ", () => {
  assert.equal(applySortPlace(data(), put("UK-OUT-3", KOL)).flag, "mixed");
  const r = applySortPlace(data(), put("UK-ORD-1", KOL));
  assert.equal(
    applySortPlace(r.data, put("UK-ORD-1", `UK-SORT-${key("WB Коледино")}-2`)).flag,
    "mixed",
  );
});

test("уехавшая и неизвестная посылка, кривой код места — отказ", () => {
  assert.equal(applySortPlace(data(), put("UK-ORD-4", KOL)).flag, "bad");
  assert.equal(applySortPlace(data(), put("UK-ORD-9", KOL)).flag, "bad");
  assert.equal(applySortPlace(data(), put("UK-ORD-1", "UK-PLT-A")).flag, "bad");
});

test("закрытие заводит места; закрытая отгрузка новых посылок не берёт", () => {
  const placed = applySortPlace(data(), put("UK-ORD-1", KOL)).data;
  const close = { sortCode: KOL, pallets: 1, boxes: 2, placeIds: ["p1", "p2", "p3"], at: 9 };
  const r = applySortClose(placed, close);
  const places = r.data.outboundBoxes.filter((b) => b.place);
  assert.deepEqual(
    places.map((p) => p.place),
    ["pallet", "box", "box"],
  );
  assert.ok(places.every((p) => p.code.startsWith("UK-OUT-") && p.lines.length === 0));
  assert.equal(applySortClose(r.data, close).data, r.data);
  assert.equal(applySortClose(r.data, { ...close, placeIds: ["x1", "x2", "x3"] }).flag, "mixed");
  assert.equal(applySortPlace(r.data, put("UK-LBL-2", KOL)).flag, "mixed");
});

test("пустую отгрузку и кривое число мест не закрыть", () => {
  const close = { sortCode: KOL, pallets: 1, boxes: 0, placeIds: ["p1"] };
  assert.equal(applySortClose(data(), close).flag, "bad");
  const placed = applySortPlace(data(), put("UK-ORD-1", KOL)).data;
  assert.equal(applySortClose(placed, { ...close, placeIds: [] }).flag, "bad");
  assert.equal(applySortClose(placed, { ...close, pallets: 0 }).flag, "bad");
});
