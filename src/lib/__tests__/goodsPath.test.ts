import { describe, expect, it } from "vitest";
import {
  localMatches,
  localSteps,
  narrowMatches,
  pathSearchQuery,
  resolvePathSearch,
  withOrders,
  type LocalPathData,
  type PathMatch,
} from "../goodsPath";
import type { FulfillmentRequest } from "../types";

const req = (id: string, over: Partial<FulfillmentRequest> = {}): FulfillmentRequest => ({
  id,
  productId: "pr1",
  qty: 1,
  status: "new",
  createdAt: 1_000,
  updatedAt: 1_000,
  ...over,
});
const products = [
  { id: "pr1", barcode: "4601234567890", sku: "TS-001" },
  { id: "pr2", barcode: "4600000001234", sku: "MUG-2" },
];
const requests = [
  req("r1", { externalId: "87654321-0001", note: "Тула" }),
  req("r2", { productId: "pr2", note: "Коледино" }),
];

describe("resolvePathSearch", () => {
  it("хвост из 4 знаков — товары по концу EAN и заказы по концу номера площадки", () => {
    expect(resolvePathSearch("7890", { products, requests })).toEqual({
      q: "7890",
      orders: [],
      products: ["pr1"],
    });
    expect(resolvePathSearch("0001", { products, requests })?.orders).toEqual(["r1"]);
  });

  it("код целиком — штрихкод, артикул или номер; криптохвост DataMatrix отрезан", () => {
    expect(resolvePathSearch("ts-001", { products, requests })?.products).toEqual(["pr1"]);
    expect(resolvePathSearch("87654321-0001", { products, requests })?.orders).toEqual(["r1"]);
    expect(
      resolvePathSearch("0104601234567890215abcdef\u001d93SECRET", { products, requests }),
    ).toEqual({
      q: "0104601234567890215abcdef",
      orders: [],
      products: [],
    });
    expect(resolvePathSearch("  ", { products, requests })).toBeNull();
  });

  it("адрес запроса несёт код, заказы и товары", () => {
    const q = pathSearchQuery("wh", { q: "7890", orders: ["r1"], products: ["pr1"] });
    expect(Object.fromEntries(new URLSearchParams(q))).toEqual({
      warehouse: "wh",
      q: "7890",
      orders: "r1",
      products: "pr1",
    });
  });
});

const parcel = (id: string, at: number, requestIds: string[]): PathMatch => ({
  id,
  at,
  staffRef: "s1",
  outboundCode: `UK-OUT-${id}`,
  requestIds,
  lines: [],
});

describe("список совпадений", () => {
  it("заказ без посылки добавляется, упакованный — нет", () => {
    const list = withOrders(
      [parcel("a", 5_000, ["r1"])],
      { q: "x", orders: ["r1", "r2"], products: [] },
      requests,
    );
    expect(list.map((m) => m.id)).toEqual(["a", "order:r2"]);
  });

  it("сужается днём упаковки и направлением", () => {
    const day = new Date(2026, 10, 16, 12).getTime();
    const list = [parcel("a", day, ["r1"]), parcel("b", day + 86_400_000, ["r2"])];
    expect(narrowMatches(list, { day: "2026-11-16" }, requests).map((m) => m.id)).toEqual(["a"]);
    expect(narrowMatches(list, { direction: "Коледино" }, requests).map((m) => m.id)).toEqual([
      "b",
    ]);
  });
});

describe("демо: путь из данных браузера", () => {
  const data: LocalPathData = {
    products,
    requests: [req("r1", { pickedAt: 3_000, packedAt: 4_000, packedBy: "s2", note: "Тула" })],
    receivingEvents: [
      { id: "rv1", productId: "pr1", qty: 5, boxId: "b1", staffId: "s1", timestamp: 2_000 },
      { id: "rv2", productId: "pr1", qty: 5, boxId: "b2", staffId: "s1", timestamp: 9_000 },
    ],
    staffEvents: [
      {
        id: "e1",
        staffId: "s2",
        type: "pack_scan",
        at: 3_500,
        orderId: "r1",
        code: "0104601234567890215abcdef",
      },
    ],
    outboundBoxes: [
      {
        id: "o1",
        code: "UK-OUT-7KQ2",
        lines: [],
        requestIds: ["r1"],
        packedBy: ["s2"],
        createdAt: 4_000,
        updatedAt: 4_000,
        sortCode: "UK-SORT-AAAAAA-1",
      },
    ],
    shipments: [
      { id: "sh1", destination: "Тула", requestIds: ["r1"], shippedAt: 6_000, staffId: "s3" },
    ],
  };

  it("находит заказ по хвосту кода маркировки и коду посылки", () => {
    expect(localMatches({ q: "cdef", orders: [], products: [] }, data).map((m) => m.id)).toEqual([
      "order:r1",
    ]);
    const [m] = localMatches({ q: "7KQ2", orders: [], products: [] }, data);
    expect(m.outboundCode).toBe("UK-OUT-7KQ2");
  });

  it("лента по порядку: приёмка до сборки, сборка, упаковка, рейс", () => {
    const [m] = localMatches({ q: "x", orders: ["r1"], products: [] }, data);
    const steps = localSteps(m, data);
    expect(steps.map((e) => [e.kind, e.at])).toEqual([
      ["recv_unit", 2_000],
      ["pick_done", 3_000],
      ["pack_event", 3_500],
      ["pack_done", 4_000],
      ["ship_run", 6_000],
    ]);
    expect(steps[3].refs?.sortCode).toBe("UK-SORT-AAAAAA-1");
  });
});
