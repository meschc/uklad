import { describe, expect, it } from "vitest";
import { buildPickDocFromProducts } from "../documents";
import type { CellAddress } from "../types";
import { makeBox, makeFloor, makeProduct, makeSection, makeShelf, makeWarehouse } from "./fixtures";

/**
 * Лист сборки по отмеченным строкам таблицы.
 *
 * Ошибётся он молча: лист выглядит правильным всегда — те же графы, тот же
 * номер, — а неверными в нём оказываются количество и адрес, то есть ровно то,
 * ради чего сборщик его несёт на склад. Поэтому проверяем не «документ
 * построился», а обещания каждой графы.
 */

const cell = (cellIndex: number, moduleId: string): CellAddress => ({
  floorId: "floor-1",
  moduleId,
  shelfIndex: 0,
  cellIndex,
});

function scene() {
  const section = makeSection({ shelves: [makeShelf({ cells: 4 })] });
  const floor = makeFloor([section], { id: "floor-1" });
  const warehouse = makeWarehouse([floor]);
  return { warehouse, moduleId: section.id };
}

describe("buildPickDocFromProducts", () => {
  it("считает количество суммой прямого размещения и тары", () => {
    // Arrange
    const { warehouse, moduleId } = scene();
    const product = makeProduct({ sku: "SKU-A", name: "Коробка А" });
    const box = makeBox({
      address: cell(1, moduleId),
      lines: [{ productId: product.id, qty: 7 }],
    });

    // Act
    const doc = buildPickDocFromProducts(
      [product.id],
      [product],
      warehouse,
      { [product.id]: cell(0, moduleId) },
      [box],
    );

    // Assert
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].qty).toBe(8); // 1 штука в ячейке + 7 в таре
    expect(doc.totalQty).toBe(8);
  });

  it("оставляет в листе позицию, которой нет на складе", () => {
    // Ноль в графе — это и есть повод идти проверять полку. Выкинуть строку
    // значило бы напечатать лист, по которому недостачу не увидеть.
    // Arrange
    const { warehouse } = scene();
    const missing = makeProduct({ sku: "SKU-NONE", name: "Нет на складе" });

    // Act
    const doc = buildPickDocFromProducts([missing.id], [missing], warehouse, {}, []);

    // Assert
    expect(doc.lines).toHaveLength(1);
    expect(doc.lines[0].qty).toBe(0);
    expect(doc.lines[0].address).toBeFalsy();
  });

  it("печатает все адреса, где лежит товар", () => {
    // Arrange
    const { warehouse, moduleId } = scene();
    const product = makeProduct();
    const box = makeBox({
      address: cell(2, moduleId),
      lines: [{ productId: product.id, qty: 3 }],
    });

    // Act
    const doc = buildPickDocFromProducts(
      [product.id],
      [product],
      warehouse,
      { [product.id]: cell(0, moduleId) },
      [box],
    );

    // Assert
    expect(doc.lines[0].address?.split(", ")).toHaveLength(2);
  });

  it("даёт одинаковый номер одному набору товаров в любом порядке отметки", () => {
    // Перепечатка того же выделения не должна плодить новые номера: по номеру
    // на складе и находят лист, с которым ходили.
    // Arrange
    const { warehouse } = scene();
    const a = makeProduct({ sku: "SKU-A" });
    const b = makeProduct({ sku: "SKU-B" });
    const at = Date.UTC(2026, 7, 30);

    // Act
    const straight = buildPickDocFromProducts([a.id, b.id], [a, b], warehouse, {}, [], at);
    const reversed = buildPickDocFromProducts([b.id, a.id], [a, b], warehouse, {}, [], at);

    // Assert
    expect(straight.number).toBe(reversed.number);
    expect(straight.number).toMatch(/^СБ-\d{6}-[0-9A-F]{4}$/);
  });

  it("нумерует строки в том порядке, в котором товары отмечены", () => {
    // Arrange
    const { warehouse } = scene();
    const a = makeProduct({ sku: "SKU-A" });
    const b = makeProduct({ sku: "SKU-B" });

    // Act
    const doc = buildPickDocFromProducts([b.id, a.id], [a, b], warehouse, {}, []);

    // Assert
    expect(doc.lines.map((l) => [l.no, l.sku])).toEqual([
      [1, "SKU-B"],
      [2, "SKU-A"],
    ]);
  });
});
