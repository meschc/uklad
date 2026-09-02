import { describe, expect, test } from "vitest";
import {
  EMPTY_VOLUME,
  estimateMonth,
  fitsVolume,
  isVolumeSet,
  normalizeVolume,
  type SellerVolume,
} from "../estimate";
import { WAREHOUSES, type Warehouse } from "../../data/warehouses";

/**
 * Расчёт месяца под объём селлера.
 *
 * Проверяется здесь не арифметика ради арифметики. Витрина обещает
 * сопоставимость: два склада с разными прайсами приводятся к одному числу — во
 * сколько обойдётся месяц именно этому селлеру. Число это человек несёт в
 * переговоры, и ошибка в нём дороже любой другой ошибки на сайте.
 */

/** Склад с ровным прайсом — чтобы ожидания в тестах считались в уме. */
const W: Warehouse = {
  ...WAREHOUSES[0],
  price: { storage: 10, receiving: 100, picking: 20, marking: 5 },
  minPlaces: 0,
  cellsFree: 10_000,
};

const volume = (v: Partial<SellerVolume>): SellerVolume => ({ ...EMPTY_VOLUME, ...v });

describe("Расчёт под объём селлера", () => {
  test("незаданный объём не превращается в нулевую цену", () => {
    // Пока селлер ничего не ввёл, «0 ₽ в месяц» — это не бесплатно, это
    // «неизвестно». Карточка по этому признаку и решает, показывать ли расчёт.
    expect(isVolumeSet(EMPTY_VOLUME)).toBe(false);
    expect(isVolumeSet(volume({ places: 1 }))).toBe(true);
    expect(isVolumeSet(volume({ orders: 1 }))).toBe(true);
  });

  test("месяц считается по прайсу склада", () => {
    const e = estimateMonth(W, volume({ places: 100, boxes: 40, orders: 900, marking: 300 }));

    expect(e.storage).toBe(100 * 10 * 30);
    expect(e.receiving).toBe(40 * 100);
    expect(e.picking).toBe(900 * 20);
    expect(e.marking).toBe(300 * 5);
  });

  test("итог равен сумме строк — иначе разбивке нельзя верить", () => {
    const e = estimateMonth(W, volume({ places: 37, boxes: 13, orders: 641, marking: 89 }));

    expect(e.total).toBe(e.storage + e.receiving + e.picking + e.marking);
  });

  test("маркировка входит в счёт, только если она нужна", () => {
    const e = estimateMonth(W, volume({ places: 10, marking: 0 }));

    expect(e.marking).toBe(0);
    expect(e.total).toBe(e.storage);
  });

  test("мусор во вводе не даёт отрицательной цены", () => {
    // Поля ввода отдают строку, и в них попадает всё: минус, дробь, пустота.
    // Расчёт — граница системы, дальше него мусор идти не должен.
    const v = normalizeVolume({ places: -5, boxes: 2.7, orders: Number.NaN, marking: 1e9 });

    expect(v.places).toBe(0);
    expect(v.boxes).toBe(2);
    expect(v.orders).toBe(0);
    expect(v.marking).toBeLessThanOrEqual(1_000_000);
    expect(estimateMonth(W, v).total).toBeGreaterThanOrEqual(0);
  });

  test("склад с минимальным объёмом не подходит тому, кто меньше", () => {
    // Число из карточки: склад берёт от 200 мест. Селлеру со 150 местами он
    // откажет — и лучше это увидеть до заявки, чем после.
    const big: Warehouse = { ...W, minPlaces: 200 };

    expect(fitsVolume(big, volume({ places: 150 }))).toBe(false);
    expect(fitsVolume(big, volume({ places: 200 }))).toBe(true);
    expect(fitsVolume(big, EMPTY_VOLUME)).toBe(true);
  });

  test("склад не берёт больше, чем у него свободно", () => {
    const small: Warehouse = { ...W, cellsFree: 120 };

    expect(fitsVolume(small, volume({ places: 121 }))).toBe(false);
    expect(fitsVolume(small, volume({ places: 120 }))).toBe(true);
  });
});
