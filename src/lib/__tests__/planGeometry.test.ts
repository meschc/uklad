import { describe, expect, it } from "vitest";
import {
  freeRowSides,
  planBounds,
  rowFrames,
  rowOfSelection,
  type RowFrame,
} from "../planGeometry";
import type { PlacedModule } from "../types";
import { makeFloor, makeSection } from "./fixtures";

/**
 * Геометрия плана.
 *
 * Оба расчёта ошибаются молча и одинаково: план не пропадает, а встаёт чуть
 * мимо — центр уехал на клетку, рамка ряда не накрыла лестницу. Глазами такое
 * ловится только при сравнении «до и после», поэтому проверяем не «работает
 * вообще», а ровно те случаи, где формулу легко сдвинуть при правке.
 */

/** Вертикальная линия стеллажей: узкая по X, длинная по Y. */
const column = (x: number, over: Partial<PlacedModule> = {}) =>
  makeSection({ x, y: 0, w: 1, h: 3, ...over });

describe("planBounds", () => {
  it("у пустого этажа габарита нет", () => {
    // Пустой план — не прямоугольник в нуле: нулевой габарит пришлось бы
    // отличать от настоящего на каждом вызове.
    expect(planBounds([])).toBeNull();
  });

  it("накрывает все модули по дальним краям", () => {
    // Arrange
    const mods = [column(0), column(4, { w: 2 })];

    // Act
    const b = planBounds(mods);

    // Assert — правый край берётся по x + w, а не по x.
    expect(b).toEqual({ x: 0, y: 0, w: 6, h: 3 });
  });

  it("запас расширяет габарит во все стороны, не сдвигая центр", () => {
    // Arrange
    const mods = [column(0)];

    // Act
    const plain = planBounds(mods)!;
    const padded = planBounds(mods, 2)!;

    // Assert
    expect(padded).toEqual({ x: -2, y: -2, w: 5, h: 7 });
    // Центр — то, по чему план выравнивают во вьюпорте: запас его не трогает.
    expect(padded.x + padded.w / 2).toBe(plain.x + plain.w / 2);
    expect(padded.y + padded.h / 2).toBe(plain.y + plain.h / 2);
  });
});

describe("rowFrames", () => {
  it("незакреплённый ряд рамки не даёт", () => {
    // Автономера есть у всех рядов, и если обводить их, обведён будет весь
    // план. Рамка — признак того, что ряд подтвердил человек.
    const floor = makeFloor([column(0), column(2)]);
    expect(rowFrames(floor)).toEqual([]);
  });

  it("рамка накрывает обе стороны прохода", () => {
    // Arrange — две линии через проход в клетку: это один ряд, а не два.
    const near = column(0, { row: 1 });
    const far = column(2);
    const floor = makeFloor([near, far]);

    // Act
    const frames = rowFrames(floor);

    // Assert
    expect(frames).toHaveLength(1);
    expect(frames[0].rect).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect([...frames[0].ids].sort()).toEqual([near.id, far.id].sort());
  });

  it("лестница линии входит в ряд и раздвигает его габарит", () => {
    // Arrange — лестница стоит продолжением левой линии (п.13).
    const near = column(0, { row: 1 });
    const stairs: PlacedModule = {
      id: "stairs-1",
      type: "stairs",
      x: 0,
      y: 4,
      w: 1,
      h: 1,
      rotation: 0,
    };
    const floor = makeFloor([near, column(2), stairs]);

    // Act
    const [frame] = rowFrames(floor);

    // Assert — габарит дотянулся до лестницы: 0..5 по Y.
    expect(frame.ids.has(stairs.id)).toBe(true);
    expect(frame.rect.h).toBe(5);
  });

  it("рамки идут по возрастанию номера ряда", () => {
    // Arrange — два отдельных ряда: зазор в 5 клеток шире прохода, иначе линии
    // слились бы в один ряд. Ряд с меньшим номером стоит правее — порядок на
    // плане и порядок номеров расходятся, и в списке должен победить номер.
    const floor = makeFloor([column(0, { row: 7 }), column(5, { row: 2 })]);

    // Act
    const frames = rowFrames(floor);

    // Assert
    expect(frames.map((f) => f.row)).toEqual([2, 7]);
  });
});

describe("rowOfSelection", () => {
  it("пустое выделение ряда не даёт", () => {
    expect(rowOfSelection(makeFloor([column(0)]), [])).toBeNull();
  });

  it("выделен весь ряд — возвращается его номер", () => {
    // Arrange — обе линии одного ряда через проход в клетку.
    const near = column(0, { row: 3 });
    const far = column(2);
    const floor = makeFloor([near, far]);

    // Act & Assert
    expect(rowOfSelection(floor, [near.id, far.id])).toBe(3);
  });

  it("часть ряда рядом не считается", () => {
    // Одна линия из двух — это «несколько секций», а не ряд: иначе панель ряда
    // правила бы то, что человек не выделял.
    const near = column(0, { row: 3 });
    const floor = makeFloor([near, column(2)]);
    expect(rowOfSelection(floor, [near.id])).toBeNull();
  });

  it("выделение из двух рядов ряда не даёт", () => {
    // Arrange — зазор в 5 клеток шире прохода, значит это два разных ряда.
    const a = column(0, { row: 1 });
    const b = column(5, { row: 2 });
    const floor = makeFloor([a, b]);

    // Act & Assert
    expect(rowOfSelection(floor, [a.id, b.id])).toBeNull();
  });

  it("незакреплённый ряд тоже выделяется целиком", () => {
    // Автономер — такой же номер ряда: инспектор должен открыть свойства ряда
    // ещё до того, как человек его закрепил.
    const near = column(0);
    const far = column(2);
    const floor = makeFloor([near, far]);
    expect(rowOfSelection(floor, [near.id, far.id])).toBe(1);
  });

  it("лестница линии входит в состав ряда", () => {
    // Arrange — без лестницы (п.13) выделение ряда неполное.
    const near = column(0, { row: 1 });
    const far = column(2);
    const stairs: PlacedModule = {
      id: "stairs-1",
      type: "stairs",
      x: 0,
      y: 4,
      w: 1,
      h: 1,
      rotation: 0,
    };
    const floor = makeFloor([near, far, stairs]);

    // Act & Assert
    expect(rowOfSelection(floor, [near.id, far.id])).toBeNull();
    expect(rowOfSelection(floor, [near.id, far.id, stairs.id])).toBe(1);
  });
});

describe("freeRowSides", () => {
  /** Вертикальный ряд шириной 3 клетки и длиной 10 — как две линии с проходом. */
  const vertRow = (row: number, x: number): RowFrame => ({
    row,
    ids: new Set([`r${row}`]),
    rect: { x, y: 0, w: 3, h: 10 },
  });

  it("одинокий ряд можно продолжить в обе стороны", () => {
    const row = vertRow(1, 0);
    expect(freeRowSides(row, [row])).toEqual({ before: true, after: true });
  });

  it("сосед вплотную закрывает свою сторону", () => {
    // Arrange — второй ряд стоит справа через проход в 2 клетки.
    const left = vertRow(1, 0);
    const right = vertRow(2, 5);

    // Act
    const sides = freeRowSides(left, [left, right]);

    // Assert — вправо продолжать некуда, влево ещё можно.
    expect(sides).toEqual({ before: true, after: false });
  });

  it("ряд между двумя соседями продолжать некуда", () => {
    const middle = vertRow(2, 5);
    const rows = [vertRow(1, 0), middle, vertRow(3, 10)];
    expect(freeRowSides(middle, rows)).toEqual({ before: false, after: false });
  });

  it("далёкий сосед сторону не занимает", () => {
    // Arrange — 20 клеток вправо: это уже другой участок склада, а не
    // продолжение раскладки. Порог — своя ширина плюс проход.
    const left = vertRow(1, 0);
    const far = vertRow(2, 20);

    // Act & Assert
    expect(freeRowSides(left, [left, far])).toEqual({ before: true, after: true });
  });

  it("сосед, не перекрывающийся по длине, стороны не закрывает", () => {
    // Arrange — ряд справа сдвинут вниз и стоит напротив пустоты: продолжение
    // влезет между ними, поэтому «плюсик» должен остаться.
    const left = vertRow(1, 0);
    const below: RowFrame = { row: 2, ids: new Set(["r2"]), rect: { x: 5, y: 20, w: 3, h: 10 } };

    // Act & Assert
    expect(freeRowSides(left, [left, below])).toEqual({ before: true, after: true });
  });
});
