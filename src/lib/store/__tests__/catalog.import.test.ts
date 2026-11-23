import { beforeEach, describe, expect, test } from "vitest";
import { useEditor } from "..";
import type { Product } from "../../types";

/** Импорт в стор: свой склад, без двойников, чужой склад не мешает. */
const item = (sku: string): Omit<Product, "id"> => ({
  sku,
  barcode: "",
  name: sku,
  category: "Одежда",
  widthCm: 1,
  heightCm: 1,
  depthCm: 1,
});

beforeEach(() => {
  useEditor.setState({ products: [] });
});

describe("importProducts", () => {
  test("товары получают id и склад; повторная загрузка не плодит двойников", () => {
    const { importProducts, warehouse } = useEditor.getState();
    importProducts([item("A1"), item("A2"), item("A1")]);
    importProducts([item("A1"), item("A3")]);
    const skus = useEditor.getState().products.map((p) => p.sku);
    expect(skus).toEqual(["A1", "A2", "A3"]);
    expect(useEditor.getState().products.every((p) => p.warehouseId === warehouse.id)).toBe(true);
  });

  test("тот же артикул на другом складе не мешает", () => {
    useEditor.setState({
      products: [{ ...item("A1"), id: "x", warehouseId: "other-warehouse" }],
    });
    useEditor.getState().importProducts([item("A1")]);
    expect(useEditor.getState().products).toHaveLength(2);
  });
});
