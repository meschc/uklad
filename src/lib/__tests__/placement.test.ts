import { describe, expect, it } from "vitest";
import { addressKey } from "../address";
import {
  buildOccupancy,
  checkFit,
  firstFreeCell,
  hasStorage,
  suggestCell,
  tightestFittingCell,
} from "../placement";
import type { CellAddress } from "../types";
import {
  makeBox,
  makeFloor,
  makeProduct,
  makeSection,
  makeShelf,
  makeWarehouse,
} from "./fixtures";

/**
 * Занятость и подбор места — два расчёта, которые ошибаются молча: неверный
 * ответ выглядит как обычный, просто товар встаёт не туда или ячейка считается
 * свободной. Поэтому проверяем именно граничные случаи, а не «работает вообще».
 */

describe("buildOccupancy", () => {
  it("считает прямое размещение занятой ячейкой на одну единицу", () => {
    // Arrange
    const addr: CellAddress = {
      floorId: "f1",
      moduleId: "m1",
      shelfIndex: 0,
      cellIndex: 0,
    };

    // Act
    const occ = buildOccupancy({ "prod-1": addr });

    // Assert
    expect(occ[addressKey(addr)]).toEqual({ productIds: ["prod-1"], qty: 1 });
  });

  it("считает размещённую коробку занятой ячейкой на сумму её строк", () => {
    // Arrange
    const addr: CellAddress = {
      floorId: "f1",
      moduleId: "m1",
      shelfIndex: 0,
      cellIndex: 0,
    };
    const box = makeBox({
      address: addr,
      lines: [
        { productId: "prod-1", qty: 3 },
        { productId: "prod-2", qty: 4 },
      ],
    });

    // Act
    const occ = buildOccupancy({}, [box]);

    // Assert
    expect(occ[addressKey(addr)]).toEqual({
      productIds: ["prod-1", "prod-2"],
      boxId: box.id,
      qty: 7,
    });
  });

  it("не занимает ничего коробкой без адреса и пустой коробкой", () => {
    // Arrange: неразмещённая коробка ещё стоит на рампе, пустая — уже разобрана.
    const addr: CellAddress = {
      floorId: "f1",
      moduleId: "m1",
      shelfIndex: 0,
      cellIndex: 0,
    };
    const onRamp = makeBox({ lines: [{ productId: "prod-1", qty: 2 }] });
    const emptied = makeBox({ address: addr, lines: [] });

    // Act
    const occ = buildOccupancy({}, [onRamp, emptied]);

    // Assert
    expect(occ).toEqual({});
  });

  it("сливает коробку и прямое размещение в одной ячейке", () => {
    // Arrange: так выглядит ячейка, куда товар положили обоими путями сразу —
    // если склеивания нет, один из них молча исчезает из занятости.
    const addr: CellAddress = {
      floorId: "f1",
      moduleId: "m1",
      shelfIndex: 0,
      cellIndex: 0,
    };
    const box = makeBox({ address: addr, lines: [{ productId: "prod-2", qty: 5 }] });

    // Act
    const occ = buildOccupancy({ "prod-1": addr }, [box]);

    // Assert
    expect(occ[addressKey(addr)]).toEqual({
      productIds: ["prod-1", "prod-2"],
      boxId: box.id,
      qty: 6,
    });
  });
});

/** Крупная секция: 1 ячейка 100×200×50 см. */
const roomy = () => makeSection({ realWidthCm: 100, realDepthCm: 50, realHeightCm: 200 });
/** Тесная секция: 1 ячейка 40×60×30 см — товар 20 см влезает и туда, и туда. */
const snug = () => makeSection({ realWidthCm: 40, realDepthCm: 30, realHeightCm: 60 });

const cellOf = (moduleId: string, floorId: string): CellAddress => ({
  floorId,
  moduleId,
  shelfIndex: 0,
  cellIndex: 0,
});

describe("suggestCell", () => {
  it("при равном приоритете выбирает самую тесную подходящую ячейку", () => {
    // Arrange
    const big = roomy();
    const small = snug();
    const floor = makeFloor([big, small]);
    const wh = makeWarehouse([floor]);

    // Act
    const cell = suggestCell(wh, {}, makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }));

    // Assert
    expect(cell?.addr.moduleId).toBe(small.id);
  });

  it("приоритет отбора важнее тесноты", () => {
    // Arrange: крупная полка стоит у прохода — ходовой товар должен встать туда.
    const big = roomy();
    big.shelves = [makeShelf({ pickPriority: 10 })];
    const small = snug();
    const floor = makeFloor([big, small]);
    const wh = makeWarehouse([floor]);

    // Act
    const cell = suggestCell(wh, {}, makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }));

    // Assert
    expect(cell?.addr.moduleId).toBe(big.id);
  });

  it("не предлагает занятую ячейку", () => {
    // Arrange
    const big = roomy();
    const small = snug();
    const floor = makeFloor([big, small]);
    const wh = makeWarehouse([floor]);
    const occupancy = buildOccupancy({ "prod-1": cellOf(small.id, floor.id) });

    // Act
    const cell = suggestCell(wh, occupancy, makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }));

    // Assert
    expect(cell?.addr.moduleId).toBe(big.id);
  });

  it("не предлагает ячейку из exclude — это место товар и освобождает", () => {
    // Arrange: при переносе товара его текущая ячейка ещё числится занятой,
    // но предлагать её же как «новое место» бессмысленно.
    const big = roomy();
    const small = snug();
    const floor = makeFloor([big, small]);
    const wh = makeWarehouse([floor]);

    // Act
    const cell = suggestCell(
      wh,
      {},
      makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }),
      { exclude: addressKey(cellOf(small.id, floor.id)) },
    );

    // Assert
    expect(cell?.addr.moduleId).toBe(big.id);
  });

  it("не предлагает полку, закрытую от отбора", () => {
    // Arrange: карантин или чужой товар — полка есть, но автоподбор её не видит.
    const big = roomy();
    const small = snug();
    small.shelves = [makeShelf({ pickable: false })];
    const floor = makeFloor([big, small]);
    const wh = makeWarehouse([floor]);

    // Act
    const cell = suggestCell(wh, {}, makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }));

    // Assert
    expect(cell?.addr.moduleId).toBe(big.id);
  });

  it("возвращает null, когда товар не влезает никуда", () => {
    // Arrange
    const wh = makeWarehouse([makeFloor([snug()])]);

    // Act
    const cell = suggestCell(wh, {}, makeProduct({ widthCm: 200, heightCm: 20, depthCm: 20 }));

    // Assert
    expect(cell).toBeNull();
  });

  it("уходит на соседний этаж, если на предпочтительном подходящего места нет", () => {
    // Arrange: «сначала текущий этаж» — предпочтение, а не ограничение.
    const tiny = snug();
    const big = roomy();
    const first = makeFloor([tiny]);
    const second = makeFloor([big]);
    const wh = makeWarehouse([first, second]);

    // Act
    const cell = suggestCell(
      wh,
      {},
      makeProduct({ widthCm: 80, heightCm: 80, depthCm: 40 }),
      { preferFloorId: first.id },
    );

    // Assert
    expect(cell?.addr.floorId).toBe(second.id);
  });

  it("остаётся на предпочтительном этаже, когда место есть и там, и там", () => {
    // Arrange: соседний этаж теснее — но ехать туда незачем.
    const onFirst = roomy();
    const onSecond = snug();
    const first = makeFloor([onFirst]);
    const second = makeFloor([onSecond]);
    const wh = makeWarehouse([first, second]);

    // Act
    const cell = suggestCell(
      wh,
      {},
      makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }),
      { preferFloorId: first.id },
    );

    // Assert
    expect(cell?.addr.moduleId).toBe(onFirst.id);
  });
});

describe("checkFit", () => {
  it("перечисляет все оси, по которым товар не проходит", () => {
    // Arrange: интерфейс показывает пользователю именно список осей, а не
    // общее «не влезает» — иначе непонятно, что мерить заново.
    const product = makeProduct({ widthCm: 200, heightCm: 5, depthCm: 300 });

    // Act
    const fit = checkFit(product, { widthCm: 100, heightCm: 100, depthCm: 100 });

    // Assert
    expect(fit.fits).toBe(false);
    expect(fit.failed).toEqual(["width", "depth"]);
  });

  it("прощает погрешность деления ширины на ячейки", () => {
    // Arrange: полка 100 см на 3 ячейки даёт 33,333… — товар ровно в размер
    // не должен отсекаться из-за хвоста двоичной дроби.
    const cell = { widthCm: 100 / 3, heightCm: 100, depthCm: 100 };

    // Act
    const exact = checkFit(makeProduct({ widthCm: 33.3333334, heightCm: 1, depthCm: 1 }), cell);
    const wider = checkFit(makeProduct({ widthCm: 33.34, heightCm: 1, depthCm: 1 }), cell);

    // Assert
    expect(exact.fits).toBe(true);
    expect(wider.fits).toBe(false);
  });
});

describe("tightestFittingCell", () => {
  it("находит самую тесную подходящую ячейку независимо от занятости", () => {
    // Arrange: этим отличают «такого размера ячеек на складе нет» от «есть,
    // но все заняты» — две разные проблемы с разными решениями.
    const big = roomy();
    const small = snug();
    const wh = makeWarehouse([makeFloor([big, small])]);

    // Act
    const cell = tightestFittingCell(wh, makeProduct({ widthCm: 20, heightCm: 20, depthCm: 20 }));

    // Assert
    expect(cell?.addr.moduleId).toBe(small.id);
  });

  it("возвращает null, когда ячейки такого размера нет вовсе", () => {
    // Arrange
    const wh = makeWarehouse([makeFloor([snug()])]);

    // Act
    const cell = tightestFittingCell(wh, makeProduct({ widthCm: 500, heightCm: 1, depthCm: 1 }));

    // Assert
    expect(cell).toBeNull();
  });
});

describe("firstFreeCell", () => {
  it("предпочитает свободную ячейку на указанном этаже", () => {
    // Arrange
    const onFirst = roomy();
    const onSecond = roomy();
    const first = makeFloor([onFirst]);
    const second = makeFloor([onSecond]);
    const wh = makeWarehouse([first, second]);

    // Act
    const cell = firstFreeCell(wh, {}, second.id);

    // Assert
    expect(cell?.addr.moduleId).toBe(onSecond.id);
  });

  it("отодвигает закрытые от отбора полки в конец, но не выбрасывает их", () => {
    // Arrange: это запасной старт диалога — остаться совсем без предложения
    // хуже, чем предложить дальнюю полку.
    const closed = roomy();
    closed.shelves = [makeShelf({ pickable: false })];
    const open = roomy();
    const wh = makeWarehouse([makeFloor([closed, open])]);

    // Act
    const cell = firstFreeCell(wh, {});

    // Assert
    expect(cell?.addr.moduleId).toBe(open.id);
  });

  it("предлагает закрытую полку, если других свободных нет", () => {
    // Arrange
    const closed = roomy();
    closed.shelves = [makeShelf({ pickable: false })];
    const wh = makeWarehouse([makeFloor([closed])]);

    // Act
    const cell = firstFreeCell(wh, {});

    // Assert
    expect(cell?.addr.moduleId).toBe(closed.id);
  });

  it("возвращает null, когда свободных ячеек не осталось", () => {
    // Arrange
    const only = roomy();
    const floor = makeFloor([only]);
    const wh = makeWarehouse([floor]);
    const occupancy = buildOccupancy({ "prod-1": cellOf(only.id, floor.id) });

    // Act
    const cell = firstFreeCell(wh, occupancy);

    // Assert
    expect(cell).toBeNull();
  });
});

describe("hasStorage", () => {
  it("отличает склад без полок от склада с полками", () => {
    // Arrange: пустой план — повод сказать «сначала создайте план склада»,
    // а не «подходящей ячейки не нашлось».
    const empty = makeWarehouse([makeFloor([makeSection({ shelves: [] })])]);
    const ready = makeWarehouse([makeFloor([roomy()])]);

    // Act & Assert
    expect(hasStorage(empty)).toBe(false);
    expect(hasStorage(ready)).toBe(true);
  });
});
