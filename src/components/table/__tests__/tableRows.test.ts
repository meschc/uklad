import { describe, expect, it } from "vitest";
import { makeFloor, makeProduct, makeSection, makeWarehouse } from "@/lib/__tests__/fixtures";
import { buildRows, filterAndSort, type Sort, type TableFilter, type TableRow } from "../tableRows";

/** Фильтр «ничего не выбрано»: тест меняет только то поле, ради которого написан. */
const ALL: TableFilter = { query: "", category: "all", partnerId: "all", place: "all" };
const BY_SKU: Sort = { key: "sku", dir: 1 };
const noPartners = () => "";

function row(over: Partial<TableRow> = {}): TableRow {
  return { product: makeProduct(), place: null, qty: 0, ...over };
}

describe("строки таблицы номенклатуры", () => {
  it("товар без адреса получает пустое место и нулевой остаток", () => {
    const product = makeProduct();
    const warehouse = makeWarehouse([makeFloor([makeSection()])]);

    const rows = buildRows([product], {}, warehouse, new Map());

    expect(rows).toEqual([{ product, place: null, qty: 0 }]);
  });

  it("остаток берётся из посчитанного заранее", () => {
    const product = makeProduct();
    const warehouse = makeWarehouse([makeFloor([makeSection()])]);

    const rows = buildRows([product], {}, warehouse, new Map([[product.id, { qty: 7 }]]));

    expect(rows[0].qty).toBe(7);
  });
});

describe("фильтр и сортировка таблицы", () => {
  it("«только размещённые» убирает товары без места, «только свободные» — наоборот", () => {
    const rows = [
      row({ product: makeProduct({ sku: "A" }), place: "1-1-1-1" }),
      row({ product: makeProduct({ sku: "B" }) }),
    ];

    const placed = filterAndSort(rows, { ...ALL, place: "placed" }, BY_SKU, noPartners);
    const free = filterAndSort(rows, { ...ALL, place: "free" }, BY_SKU, noPartners);

    expect(placed.map((r) => r.product.sku)).toEqual(["A"]);
    expect(free.map((r) => r.product.sku)).toEqual(["B"]);
  });

  it("пустой партнёр — это отдельный фильтр «без партнёра», а не «любой»", () => {
    const rows = [
      row({ product: makeProduct({ sku: "A", partnerId: "p-1" }) }),
      row({ product: makeProduct({ sku: "B" }) }),
    ];

    const nobody = filterAndSort(rows, { ...ALL, partnerId: "" }, BY_SKU, noPartners);

    expect(nobody.map((r) => r.product.sku)).toEqual(["B"]);
  });

  it("ищет и по адресу хранения, а не только по товару", () => {
    const rows = [
      row({ product: makeProduct({ sku: "A" }), place: "2-3-1-5" }),
      row({ product: makeProduct({ sku: "B" }), place: "1-1-1-1" }),
    ];

    const found = filterAndSort(rows, { ...ALL, query: "2-3-1" }, BY_SKU, noPartners);

    expect(found.map((r) => r.product.sku)).toEqual(["A"]);
  });

  it("сортирует по-русски: «ё» стоит после «е», а не в конце алфавита", () => {
    const rows = [
      row({ product: makeProduct({ name: "Ёлка" }) }),
      row({ product: makeProduct({ name: "Ель" }) }),
      row({ product: makeProduct({ name: "Ёж" }) }),
    ];

    const sorted = filterAndSort(rows, ALL, { key: "name", dir: 1 }, noPartners);

    expect(sorted.map((r) => r.product.name)).toEqual(["Ёж", "Ёлка", "Ель"]);
  });

  it("неразмещённые всегда в конце — и по возрастанию адреса, и по убыванию", () => {
    const rows = [
      row({ product: makeProduct({ sku: "A" }) }),
      row({ product: makeProduct({ sku: "B" }), place: "1-1-1-1" }),
      row({ product: makeProduct({ sku: "C" }), place: "2-1-1-1" }),
    ];

    const up = filterAndSort(rows, ALL, { key: "place", dir: 1 }, noPartners);
    const down = filterAndSort(rows, ALL, { key: "place", dir: -1 }, noPartners);

    expect(up.map((r) => r.product.sku)).toEqual(["B", "C", "A"]);
    expect(down.map((r) => r.product.sku)).toEqual(["C", "B", "A"]);
  });

  it("сортирует партнёров по имени, которое человек видит, а не по id", () => {
    const rows = [
      row({ product: makeProduct({ sku: "A", partnerId: "p-2" }) }),
      row({ product: makeProduct({ sku: "B", partnerId: "p-1" }) }),
    ];
    const name = (id?: string) => (id === "p-1" ? "Яблоко" : "Апельсин");

    const sorted = filterAndSort(rows, ALL, { key: "partner", dir: 1 }, name);

    expect(sorted.map((r) => r.product.sku)).toEqual(["A", "B"]);
  });

  it("исходный массив не трогает", () => {
    const rows = [
      row({ product: makeProduct({ sku: "B" }) }),
      row({ product: makeProduct({ sku: "A" }) }),
    ];

    filterAndSort(rows, ALL, BY_SKU, noPartners);

    expect(rows.map((r) => r.product.sku)).toEqual(["B", "A"]);
  });
});
