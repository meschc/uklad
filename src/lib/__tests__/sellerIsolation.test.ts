import { describe, expect, it } from "vitest";
import { visibleProducts } from "../warehouseProducts";
import { seedWarehouse } from "../store/seed";
import type { Product } from "../types";

const prod = (id: string, partnerId?: string) =>
  ({
    id,
    sku: id,
    barcode: "",
    name: id,
    category: "Прочее",
    widthCm: 1,
    heightCm: 1,
    depthCm: 1,
    partnerId,
  }) as Product;

describe("продавец видит только свой товар", () => {
  const wh = seedWarehouse();
  const all = [prod("a1", "A"), prod("a2", "A"), prod("b1", "B"), prod("free")];

  it("два продавца одного склада не видят товар друг друга", () => {
    const ids = (partnerId: string) =>
      visibleProducts(all, wh, { role: "seller", partnerId }).map((p) => p.id);
    expect(ids("A")).toEqual(["a1", "a2"]);
    expect(ids("B")).toEqual(["b1"]);
  });

  it("продавец без привязки не видит ничего, склад видит всё", () => {
    expect(visibleProducts(all, wh, { role: "seller" })).toEqual([]);
    expect(visibleProducts(all, wh, { role: "warehouse" })).toHaveLength(4);
  });
});
