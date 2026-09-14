import { describe, expect, it } from "vitest";
import { matchesQuery, normalizeQuery } from "../productSearch";
import { makeProduct } from "./fixtures";

describe("поиск по номенклатуре", () => {
  it("пустой запрос подходит любому товару", () => {
    const product = makeProduct();

    expect(matchesQuery(product, normalizeQuery("   "))).toBe(true);
  });

  it("находит по части названия без оглядки на регистр", () => {
    const product = makeProduct({ name: "Молоко 3,2%" });

    expect(matchesQuery(product, normalizeQuery("  МОЛОКО "))).toBe(true);
  });

  it("находит по артикулу и по штрихкоду", () => {
    const product = makeProduct({ sku: "MLK-32", barcode: "4600000000017" });

    expect(matchesQuery(product, normalizeQuery("mlk"))).toBe(true);
    expect(matchesQuery(product, normalizeQuery("0000017"))).toBe(true);
  });

  it("находит по категории", () => {
    const product = makeProduct({ name: "Молоко", category: "Продукты" });

    expect(matchesQuery(product, normalizeQuery("продукты"))).toBe(true);
  });

  it("находит по адресу хранения, когда вызывающий его знает", () => {
    const product = makeProduct({ name: "Молоко" });

    expect(matchesQuery(product, normalizeQuery("1-2-3"), "1-2-3-4")).toBe(true);
    expect(matchesQuery(product, normalizeQuery("1-2-3"))).toBe(false);
  });

  it("не находит того, чего в товаре нет", () => {
    const product = makeProduct({ name: "Молоко", sku: "MLK-32" });

    expect(matchesQuery(product, normalizeQuery("гвозди"))).toBe(false);
  });
});
