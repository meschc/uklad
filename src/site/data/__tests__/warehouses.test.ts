import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { WAREHOUSES } from "../warehouses";
import { MARKETPLACE_BY_ID } from "../marketplaces";

/**
 * Витрина складов: проверяем не генератор, а обещания, которые карточка даёт
 * читателю.
 *
 * Данные здесь демонстрационные, но отметки на них — нет: «проверен» и «работает
 * на Укладе» человек читает как факты о конкретном складе и принимает по ним
 * решение. Если генератор однажды разведёт эти два поля, на витрине появится
 * склад, который «работает на Укладе, но Укладом не проверен», — и заметит это
 * не тест, а тот, кто придёт с претензией.
 */
describe("Склады витрины", () => {
  test("список не пустой и с уникальными идентификаторами", () => {
    expect(WAREHOUSES.length).toBeGreaterThan(0);
    const ids = new Set(WAREHOUSES.map((w) => w.id));
    expect(ids.size).toBe(WAREHOUSES.length);
  });

  test("склад на Укладе всегда проверен Укладом", () => {
    // Подключение к нашей WMS начинается с тех же документов, что и проверка,
    // поэтому обратное сочетание невозможно по смыслу, а не по совпадению.
    const broken = WAREHOUSES.filter((w) => w.uklad && !w.verified).map((w) => w.name);
    expect(broken).toEqual([]);
  });

  test("проверка не выдаётся всем подряд и не выдаётся никому", () => {
    // Отметка, которая стоит у всех, ничего не сообщает; отметка, которой нет
    // ни у кого, ломает фильтр «Проверенные Укладом» в пустой список.
    const share = WAREHOUSES.filter((w) => w.verified).length / WAREHOUSES.length;
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.9);
  });

  test("площадки в карточках существуют в справочнике", () => {
    // Карточка рисует знак площадки по этому идентификатору: незнакомый id
    // молча выпадет в монограмму, и пропажу никто не заметит.
    const unknown = new Set<string>();
    for (const w of WAREHOUSES) {
      for (const id of w.marketplaces) {
        if (!MARKETPLACE_BY_ID[id]) unknown.add(id);
      }
    }
    expect([...unknown]).toEqual([]);
  });

  test("обложки лежат в public и не потерялись при переименовании", () => {
    // Карточка не умеет пожаловаться на опечатку в имени файла: битая картинка
    // просто не появится, а слот останется пустым прямоугольником.
    const root = path.resolve(__dirname, "../../../../public/photos/warehouses");
    const missing = [
      ...new Set(WAREHOUSES.map((w) => w.photo).filter((p): p is string => !!p)),
    ].filter((file) => !existsSync(path.join(root, file)));
    expect(missing).toEqual([]);
  });

  test("фотография есть только у складов на Укладе", () => {
    // Снимки общие, не съёмка этих компаний, и раздавать их всем подряд нельзя
    // хотя бы потому, что их шесть на всю витрину: одинаковые обложки у
    // соседних карточек читаются как ошибка загрузки.
    const broken = WAREHOUSES.filter((w) => w.photo && !w.uklad).map((w) => w.name);
    expect(broken).toEqual([]);
    expect(WAREHOUSES.some((w) => w.photo)).toBe(true);
  });

  test("свободных мест не больше, чем всего", () => {
    const broken = WAREHOUSES.filter((w) => w.cellsFree > w.cellsTotal || w.cellsFree < 0).map(
      (w) => w.name,
    );
    expect(broken).toEqual([]);
  });
});
