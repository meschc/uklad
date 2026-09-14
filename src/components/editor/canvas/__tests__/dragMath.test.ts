import { describe, expect, it } from "vitest";
import { makeSection } from "@/lib/__tests__/fixtures";
import { CELL } from "../../constants";
import { MARQUEE_MIN_CELLS, marqueeRect, modulesInRect, resizeRect } from "../dragMath";

/**
 * Счёт перетаскивания.
 *
 * Всё здесь ошибается тихо: модуль растёт не с той стороны, рамка ловит на
 * клетку меньше. Ни исключения, ни лога — только ощущение, что редактор
 * «дёргается». Поэтому проверяем не «функция считает», а те три места, где
 * формулу проще всего сломать при правке: якорь дальнего края, упор в предел и
 * строгость касания рамкой.
 */

const START = { x: 10, y: 10, w: 4, h: 4 };
const LIMITS = { min: 1, max: 8 };

describe("resizeRect", () => {
  it("тяга за правую ручку растит габарит и не двигает левый край", () => {
    // Act
    const r = resizeRect(START, "e", { x: 3, y: 0 }, LIMITS);

    // Assert
    expect(r).toEqual({ x: 10, y: 10, w: 7, h: 4 });
  });

  it("тяга за левую ручку двигает левый край, а правый оставляет на месте", () => {
    // Act
    const r = resizeRect(START, "w", { x: 2, y: 0 }, LIMITS);

    // Assert — левый край уехал на 2 клетки вправо, правый остался на 14.
    expect(r).toEqual({ x: 12, y: 10, w: 2, h: 4 });
    expect(r.x + r.w).toBe(START.x + START.w);
  });

  it("упор в минимум не утаскивает дальний край за собой", () => {
    // Arrange — курсор ушёл далеко вправо, размер давно упёрся в минимум.
    // Наивный счёт («сдвинуть угол, потом обрезать размер») в этот момент
    // начинает тащить весь модуль вслед за курсором.
    const r = resizeRect(START, "w", { x: 100, y: 0 }, LIMITS);

    // Assert
    expect(r.w).toBe(LIMITS.min);
    expect(r.x + r.w).toBe(START.x + START.w);
  });

  it("упор в максимум держит верхний край на месте при тяге вверх", () => {
    // Act
    const r = resizeRect(START, "n", { x: 0, y: -100 }, LIMITS);

    // Assert — нижний край неподвижен, высота встала на пределе.
    expect(r.h).toBe(LIMITS.max);
    expect(r.y + r.h).toBe(START.y + START.h);
  });

  it("угловая ручка меняет обе стороны сразу", () => {
    // Act — «ne»: правый край идёт за курсором, верхний тоже, левый и нижний
    // стоят.
    const r = resizeRect(START, "ne", { x: 2, y: -2 }, LIMITS);

    // Assert
    expect(r).toEqual({ x: 10, y: 8, w: 6, h: 6 });
  });
});

describe("marqueeRect", () => {
  it("нормализует прямоугольник при тяге вверх и влево", () => {
    // Arrange — тянут из правого нижнего угла в левый верхний.
    const r = marqueeRect({ x: 8, y: 6 }, { x: 3, y: 2 });

    // Assert — ширина и высота всегда положительные, начало в левом верхнем.
    expect(r).toEqual({ x: 3, y: 2, w: 5, h: 4 });
  });

  it("порог рамки задан в клетках, а не в пикселях", () => {
    // Сравнение идёт с координатами в клетках, поэтому порог в 3 экранных px
    // должен быть переведён в доли клетки — иначе рамкой пришлось бы обводить
    // три клетки, чтобы хоть что-то выделить.
    expect(MARQUEE_MIN_CELLS * CELL).toBe(3);
  });
});

describe("modulesInRect", () => {
  const mods = [makeSection({ x: 0, y: 0, w: 2, h: 2 }), makeSection({ x: 5, y: 5, w: 2, h: 2 })];

  it("берёт модуль, задетый краем рамки", () => {
    // Обводить стеллаж целиком, чтобы его выбрать, — работа, которой в других
    // редакторах не требуют: достаточно зацепить.
    const hit = modulesInRect(mods, { x: 1, y: 1, w: 1, h: 1 });
    expect(hit).toEqual([mods[0].id]);
  });

  it("касание ребром за попадание не считается", () => {
    // Рамка кончается ровно там, где модуль начинается: общей площади нет.
    expect(modulesInRect(mods, { x: 3, y: 3, w: 2, h: 2 })).toEqual([]);
  });

  it("широкая рамка собирает всё, что накрыла", () => {
    const hit = modulesInRect(mods, { x: 0, y: 0, w: 10, h: 10 });
    expect(hit).toEqual(mods.map((m) => m.id));
  });
});
