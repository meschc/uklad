import { describe, expect, test } from "vitest";
import { WAREHOUSES, type Warehouse } from "../../data/warehouses";
import { EMPTY_VOLUME, type SellerVolume } from "../estimate";
import {
  COMPARE_LIMIT,
  bestIndexes,
  compareRows,
  comparedWarehouses,
  toggleCompare,
} from "../compare";

/**
 * Сравнение отмеченных складов.
 *
 * Проверяем не таблицу, а её смысл: колонки стоят в том порядке, в котором их
 * отмечали, лучшее в строке определяется по направлению самой строки, а склад,
 * который объём не возьмёт, в победители по цене не попадает — иначе витрина
 * посоветует то, чего не будет.
 */

/** Склад с ровным прайсом — чтобы в тесте были видны сами числа, а не данные. */
const base: Warehouse = { ...WAREHOUSES[0], minPlaces: 0, cellsFree: 10_000 };

const w = (id: string, patch: Partial<Warehouse>): Warehouse => ({ ...base, id, ...patch });

const VOLUME: SellerVolume = { places: 100, boxes: 0, orders: 0, marking: 0 };

const rowByKey = (rows: ReturnType<typeof compareRows>, key: string) => {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new Error(`строки «${key}» в сравнении нет`);
  return row;
};

describe("отметка складов", () => {
  test("отмечает и снимает тем же нажатием", () => {
    expect(toggleCompare([], "w-1")).toEqual(["w-1"]);
    expect(toggleCompare(["w-1"], "w-1")).toEqual([]);
  });

  test("порядок — порядок отметки, а не выдачи", () => {
    // Иначе смена сортировки переставляет колонки под рукой у человека,
    // который как раз сравнивает их между собой.
    const selected = toggleCompare(toggleCompare([], "w-9"), "w-2");
    expect(selected).toEqual(["w-9", "w-2"]);
  });

  test("сверх предела не добавляет и уже отмеченное не теряет", () => {
    const full = Array.from({ length: COMPARE_LIMIT }, (_, i) => `w-${i}`);
    expect(toggleCompare(full, "w-99")).toEqual(full);
    // Снять отметку при полном наборе по-прежнему можно — иначе человек
    // оказывается заперт в своём же выборе.
    expect(toggleCompare(full, full[0])).toHaveLength(COMPARE_LIMIT - 1);
  });

  test("исчезнувший склад не ломает сравнение", () => {
    const list = comparedWarehouses(WAREHOUSES, [WAREHOUSES[3].id, "w-которого-нет"]);
    expect(list).toEqual([WAREHOUSES[3]]);
  });
});

describe("строки сравнения", () => {
  test("месяц под объём появляется только когда объём задан", () => {
    const list = [w("a", {}), w("b", {})];
    expect(compareRows(list, EMPTY_VOLUME).some((r) => r.key === "month")).toBe(false);
    expect(compareRows(list, VOLUME).some((r) => r.key === "month")).toBe(true);
  });

  test("лучшее в строке — по её направлению", () => {
    const list = [
      w("a", { cellsFree: 100, responseHours: 8 }),
      w("b", { cellsFree: 900, responseHours: 2 }),
    ];
    const rows = compareRows(list, EMPTY_VOLUME);

    expect(bestIndexes(rowByKey(rows, "free"))).toEqual([1]);
    expect(bestIndexes(rowByKey(rows, "response"))).toEqual([1]);
  });

  test("при равенстве лучших несколько — победителя не выдумываем", () => {
    const list = [w("a", { rating: 4.8 }), w("b", { rating: 4.8 })];
    expect(bestIndexes(rowByKey(compareRows(list, EMPTY_VOLUME), "rating"))).toEqual([0, 1]);
  });

  test("склад, который объём не возьмёт, цены месяца не показывает", () => {
    const list = [
      w("a", { price: { ...base.price, storage: 30 } }),
      // Дешевле всех по прайсу, но столько мест у него просто нет.
      w("b", { price: { ...base.price, storage: 5 }, cellsFree: 10 }),
    ];
    const month = rowByKey(compareRows(list, VOLUME), "month");

    expect(month.values[1]).toBeNull();
    // И в победители он не попадает: пустая клетка — не ноль рублей.
    expect(bestIndexes(month)).toEqual([0]);
  });

  test("одна колонка — сравнивать не с чем, лучших нет", () => {
    const rows = compareRows([w("a", {})], VOLUME);
    for (const row of rows) expect(bestIndexes(row)).toEqual([]);
  });
});
