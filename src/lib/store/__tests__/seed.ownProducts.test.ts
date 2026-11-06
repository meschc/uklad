import { describe, expect, it } from "vitest";
import { seedOwnProducts } from "../seed";
import { makeFloor, makeProduct, makeWarehouse } from "../../__tests__/fixtures";

/**
 * Демо-склады, кроме первого, раньше видели общий каталог при пустых полках:
 * карточка склада показывала «0%» при сотнях товаров. Своя раскладка держится
 * на трёх вещах, их и проверяем: товар помнит склад, артикул и штрихкод не
 * совпадают с исходными, выборка не берёт одну только первую категорию.
 */
const catalog = Array.from({ length: 100 }, (_, i) =>
  makeProduct({
    id: `c${i}`,
    sku: `УК-${1000 + i}`,
    barcode: `460000000${String(i).padStart(4, "0")}`,
    category: i % 3 ? "Одежда" : "Обувь",
  }),
);
const warehouse = makeWarehouse([makeFloor([])], {
  id: "w2",
  partners: [{ id: "pt1", name: "Продавец 1" }],
} as never);

describe("seedOwnProducts", () => {
  it("отдаёт ровно столько товаров, сколько просили, и все привязаны к складу", () => {
    let n = 0;
    const items = seedOwnProducts(warehouse, catalog, "КЛ", 20, () => `n${n++}`);

    expect(items).toHaveLength(20);
    expect(items.every((p) => p.warehouseId === "w2")).toBe(true);
  });

  it("даёт товару свой артикул, id и штрихкод", () => {
    let n = 0;
    const items = seedOwnProducts(warehouse, catalog, "КЛ", 10, () => `n${n++}`);

    expect(items.every((p) => p.sku.startsWith("КЛ-"))).toBe(true);
    expect(new Set(items.map((p) => p.id)).size).toBe(10);
    expect(items.some((p) => catalog.some((c) => c.barcode === p.barcode))).toBe(false);
  });

  it("берёт через одного: в выборке есть обе категории", () => {
    const items = seedOwnProducts(warehouse, catalog, "КЛ", 10, () => crypto.randomUUID());

    expect(new Set(items.map((p) => p.category))).toEqual(new Set(["Одежда", "Обувь"]));
  });

  it("не просит больше, чем есть в каталоге", () => {
    const items = seedOwnProducts(warehouse, catalog.slice(0, 5), "КЛ", 50, () =>
      crypto.randomUUID(),
    );

    expect(items.length).toBeLessThanOrEqual(5);
  });
});
