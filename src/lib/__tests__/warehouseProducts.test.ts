import { describe, expect, it } from "vitest";
import { productsOfWarehouse } from "../warehouseProducts";
import { blankWarehouse, seedWarehouse } from "../store/seed";
import type { Product } from "../types";

const prod = (id: string, warehouseId?: string) =>
  ({
    id,
    sku: id,
    barcode: "",
    name: id,
    category: "Прочее",
    widthCm: 1,
    heightCm: 1,
    depthCm: 1,
    warehouseId,
  }) as Product;

describe("productsOfWarehouse", () => {
  const demo = seedWarehouse();
  const fresh = blankWarehouse("Новый", demo.kind, "");
  const all = [prod("demo"), prod("mine", fresh.id), prod("there", demo.id)];

  it("новый склад начинается пустым и видит только своё", () => {
    expect(productsOfWarehouse([prod("demo")], fresh)).toEqual([]);
    expect(productsOfWarehouse(all, fresh).map((p) => p.id)).toEqual(["mine"]);
  });

  it("демо-склад видит общий каталог и свои товары", () => {
    expect(productsOfWarehouse(all, demo).map((p) => p.id)).toEqual(["demo", "there"]);
  });
});
