import { describe, expect, it } from "vitest";
import { findByCode, findProduct, matchesProductCode, normalizeCode } from "../barcode";

/**
 * Поиск по отсканированному коду — то место, где ошибка не видна.
 *
 * Экран не падает: он говорит «неизвестная тара», кладовщик пожимает плечами и
 * заводит вторую коробку на тот же товар. Поэтому проверяется не «находит ли
 * вообще», а те три случая, в которых сравнение расходится с реальностью:
 * грязный ввод, кириллическая раскладка и совпадение артикула с чужим
 * штрихкодом.
 */

const box = (barcode: string) => ({ id: barcode, barcode });
const product = (barcode: string, sku: string) => ({ id: barcode + sku, barcode, sku });

describe("findByCode", () => {
  it("находит тару, набранную грязно: пробелы и нижний регистр", () => {
    // Arrange
    const boxes = [box("UK-BOX-000001"), box("UK-BOX-000012")];

    // Act
    const found = findByCode(boxes, "  uk-box-000012 ");

    // Assert
    expect(found?.barcode).toBe("UK-BOX-000012");
  });

  it("находит паллету, набранную в русской раскладке", () => {
    // Arrange: «УК» с клавиатуры выглядит как «UK», но это другие буквы.
    const pallets = [box("UK-PLT-000003")];

    // Act
    const found = findByCode(pallets, "УК-PLT-000003");

    // Assert
    expect(found?.barcode).toBe("UK-PLT-000003");
  });

  it("не находит ничего по пустому коду", () => {
    // Arrange: у объекта без ярлыка штрихкод тоже пустой — совпадение «ничего с
    // ничем» вернуло бы первый попавшийся объект.
    const boxes = [box(""), box("UK-BOX-000001")];

    // Act
    const found = findByCode(boxes, "   ");

    // Assert
    expect(found).toBeUndefined();
  });
});

describe("findProduct", () => {
  it("находит товар по штрихкоду", () => {
    // Arrange
    const products = [product("4600000000018", "SKU-1")];

    // Act
    const found = findProduct(products, "4600000000018");

    // Assert
    expect(found?.sku).toBe("SKU-1");
  });

  it("находит товар по артикулу — его набирают руками", () => {
    // Arrange
    const products = [product("4600000000018", "SKU-1")];

    // Act
    const found = findProduct(products, "sku-1");

    // Assert
    expect(found?.barcode).toBe("4600000000018");
  });

  it("при споре артикула со штрихкодом выигрывает штрихкод", () => {
    // Arrange: у первого товара артикул случайно совпал со штрихкодом второго.
    // Со сканера приходит именно штрихкод, и наклеен он на втором.
    const products = [product("4600000000018", "4600000000025"), product("4600000000025", "SKU-2")];

    // Act
    const found = findProduct(products, "4600000000025");

    // Assert
    expect(found?.sku).toBe("SKU-2");
  });
});

describe("matchesProductCode", () => {
  it("узнаёт товар и по штрихкоду, и по артикулу", () => {
    // Arrange
    const p = product("4600000000018", "SKU-1");

    // Act · Assert
    expect(matchesProductCode(p, "4600000000018")).toBe(true);
    expect(matchesProductCode(p, " sku-1 ")).toBe(true);
  });

  it("не узнаёт чужой код и не соглашается на пустой", () => {
    // Arrange
    const p = product("4600000000018", "SKU-1");

    // Act · Assert
    expect(matchesProductCode(p, "4600000000025")).toBe(false);
    expect(matchesProductCode(p, "")).toBe(false);
  });
});

describe("normalizeCode", () => {
  it("чинит кириллические варианты префикса", () => {
    // Arrange · Act · Assert: «УК», «УK» и «YK» — три способа промахнуться
    // мимо латинского «UK», и все три встречаются при ручном вводе.
    expect(normalizeCode("ук-box-1")).toBe("UK-BOX-1");
    expect(normalizeCode("УK-BOX-1")).toBe("UK-BOX-1");
    expect(normalizeCode("yk-box-1")).toBe("UK-BOX-1");
  });
});
