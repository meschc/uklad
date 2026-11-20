import { describe, expect, it } from "vitest";
import { findUnlabeled } from "../unlabeled";
import type { OutboundBox, Product } from "../types";

/**
 * Товар без этикетки на сортировке: по штрихкоду товара найти посылку, чью
 * этикетку он потерял, и посылки, на которые этикетки могли сдвинуться.
 */
const product = (id: string, barcode: string) =>
  ({ id, barcode, sku: `SKU-${id}`, name: id }) as unknown as Product;
const parcel = (code: string, productId: string, over: Partial<OutboundBox> = {}) =>
  ({
    id: code,
    code,
    requestIds: [],
    lines: [{ productId, qty: 1 }],
    packedBy: ["s1"],
    createdAt: 100,
    updatedAt: 100,
    ...over,
  }) as OutboundBox;

const products = [product("cup", "4600000000011"), product("tee", "4600000000028")];

describe("findUnlabeled", () => {
  // Тара одного упаковщика: кружка без этикетки, её этикетка ушла на футболку
  // (-002), а та — дальше по цепочке.
  const list = [
    parcel("UK-LBL-AB12-001", "cup", { sortCode: "UK-SORT-XXXXXX-1" }),
    parcel("UK-LBL-AB12-003", "tee"),
    parcel("UK-LBL-AB12-002", "tee", { sortCode: "UK-SORT-XXXXXX-1" }),
    parcel("UK-LBL-ZZ99-001", "tee", { createdAt: 50, packedBy: ["s2"] }),
    parcel("UK-OUT-000001", "cup"),
    parcel("UK-LBL-AB12-004", "cup", { shipmentId: "sh1" }),
  ];

  it("находит посылку по товару; разложенная — первой, следом — по порядку упаковки", () => {
    const res = findUnlabeled(list, products, "4600000000011");
    expect(res?.product.id).toBe("cup");
    expect(res?.leads.map((l) => l.box.code)).toEqual(["UK-LBL-AB12-001"]);
    expect(res?.leads[0].sorted).toBe(true);
    expect(res?.leads[0].after.map((b) => b.code)).toEqual(["UK-LBL-AB12-002", "UK-LBL-AB12-003"]);
  });

  it("короб поставки и уехавшая посылка — не кандидаты; другая тара — не «следом»", () => {
    const res = findUnlabeled(list, products, "4600000000028")!;
    expect(res.leads.map((l) => [l.box.code, l.sorted])).toEqual([
      ["UK-LBL-AB12-002", true],
      ["UK-LBL-AB12-003", false],
      ["UK-LBL-ZZ99-001", false],
    ]);
    expect(res.leads[2].after).toEqual([]);
  });

  it("этикетка заказа без номера — показываем всю тару", () => {
    const res = findUnlabeled(
      [parcel("UK-ORD-AAAAAA", "cup"), parcel("UK-ORD-BBBBBB", "tee")],
      products,
      "SKU-cup",
    )!;
    expect(res.leads[0].after.map((b) => b.code)).toEqual(["UK-ORD-BBBBBB"]);
  });

  it("не товар склада — null", () => {
    expect(findUnlabeled(list, products, "UK-SORT-XXXXXX-1")).toBeNull();
  });
});
