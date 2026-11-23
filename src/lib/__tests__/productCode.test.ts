import { describe, expect, it } from "vitest";
import {
  cleanProductCode,
  codeForNewProduct,
  findProduct,
  generateProductCode,
  matchesProductCode,
  sameCodeProducts,
} from "../barcode";

const p = (id: string, barcode: string, extra: { sku?: string; codes?: string[] } = {}) => ({
  id,
  barcode,
  sku: extra.sku ?? `SKU-${id}`,
  codes: extra.codes,
});

describe("коды товара без EAN", () => {
  it("код склада: UK-P- и 8 знаков, не совпадает с занятым", () => {
    const code = generateProductCode();
    expect(code).toMatch(/^UK-P-[0-9A-HJKMNP-TV-Z]{8}$/);
    // Генератор, который сначала выдаёт занятый код, — берётся следующий.
    let n = 0;
    const seq = () => (n++ < 8 ? 0 : 0.5);
    expect(generateProductCode(["uk-p-00000000"], seq)).not.toBe("UK-P-00000000");
  });

  it("любой код продавца: буквы, кириллица, пробелы по краям, символы сканера", () => {
    expect(cleanProductCode("  АРТ-12 Б\u001d\n")).toBe("АРТ-12 Б");
    const items = [p("a", "АРТ-12Б"), p("b", "4601234567893")];
    expect(findProduct(items, " арт-12б ")?.id).toBe("a");
    expect(cleanProductCode("x".repeat(100))).toHaveLength(64);
  });

  it("товар находится по любому из своих кодов и по артикулу", () => {
    const item = p("a", "4601234567893", { codes: ["2040123456789", "OZN123"], sku: "ART" });
    for (const code of ["4601234567893", "2040123456789", "ozn123", "art"]) {
      expect(matchesProductCode(item, code)).toBe(true);
    }
    expect(findProduct([item], "OZN123")?.id).toBe("a");
  });

  it("один код у товаров двух продавцов — берём того, кого ждём", () => {
    const items = [p("a", "4601234567893"), p("b", "4601234567893")];
    expect(findProduct(items, "4601234567893")?.id).toBe("a");
    expect(findProduct(items, "4601234567893", (x) => x.id === "b")?.id).toBe("b");
    expect(sameCodeProducts(items, "4601234567893", "a").map((x) => x.id)).toEqual(["b"]);
  });

  it("штрихкод сильнее чужого артикула", () => {
    const items = [p("a", "X1", { sku: "CODE" }), p("b", "CODE")];
    expect(findProduct(items, "code")?.id).toBe("b");
  });

  it("новый товар со скана: код как есть, из DataMatrix ЧЗ — EAN из GTIN", () => {
    expect(codeForNewProduct("ART-777")).toBe("ART-777");
    expect(codeForNewProduct("0104601234567893215abc\u001d91EE06")).toBe("4601234567893");
  });
});
