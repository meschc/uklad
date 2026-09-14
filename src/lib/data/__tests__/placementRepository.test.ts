import { describe, expect, it, vi } from "vitest";
import type { CellAddress } from "../../types";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createPlacementRepository } from "../placementRepository";

/**
 * Репозиторий размещений через подменённый порт — ни стора, ни `localStorage`.
 *
 * Главное здесь — автораскладка: она отдаёт список товаров, которым не нашлось
 * места. Это ОТВЕТ, а не сбой, и он обязан доехать до экрана целым: подмени его
 * на «проверьте связь» — и человек пойдёт чинить интернет вместо того, чтобы
 * добавить полок.
 */

function fakePort(state: Partial<EditorState>): StorePort {
  return {
    get: () => state as EditorState,
    set: () => {},
  };
}

const addr = (over: Partial<CellAddress> = {}): CellAddress => ({
  floorId: "fl-1",
  moduleId: "mod-1",
  shelfIndex: 0,
  cellIndex: 0,
  ...over,
});

describe("createPlacementRepository", () => {
  it("отдаёт размещения из стора", async () => {
    // Arrange
    const a = addr();
    const repo = createPlacementRepository(fakePort({ placements: { p1: a } }));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: { p1: a } });
  });

  it("выбрасывает битые адреса, но остальные размещения показывает", async () => {
    // Arrange: один испорченный адрес не повод спрятать весь склад.
    const good = addr();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const repo = createPlacementRepository(
      fakePort({ placements: { p1: good, p2: { floorId: "fl-1" } as never } }),
    );

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: { p1: good } });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("на неразмещённый товар отдаёт null, а не отказ", async () => {
    // Arrange: товар на складе есть, места у него нет — это нормальное состояние.
    const repo = createPlacementRepository(fakePort({ placements: {} }));

    // Act
    const res = await repo.get("p1");

    // Assert
    expect(res).toEqual({ ok: true, data: null });
  });

  it("передаёт постановку в стор вместе с адресом", async () => {
    // Arrange
    const placeProduct = vi.fn();
    const a = addr({ cellIndex: 3 });
    const repo = createPlacementRepository(fakePort({ placeProduct }));

    // Act
    const res = await repo.place("p1", a);

    // Assert
    expect(placeProduct).toHaveBeenCalledWith("p1", a);
    expect(res.ok).toBe(true);
  });

  it("снимает с мест сразу всё выделение одним вызовом", async () => {
    // Arrange: групповое снятие на сервере — один запрос, а не сто.
    const clearPlacements = vi.fn();
    const repo = createPlacementRepository(fakePort({ clearPlacements }));

    // Act
    const res = await repo.clear(["p1", "p2"]);

    // Assert
    expect(clearPlacements).toHaveBeenCalledWith(["p1", "p2"]);
    expect(res.ok).toBe(true);
  });

  it("отдаёт непоместившиеся товары успехом — это ответ, а не сбой", async () => {
    // Arrange
    const repo = createPlacementRepository(fakePort({ relocateProducts: () => ["p2"] }));

    // Act
    const res = await repo.relocate(["p1", "p2"]);

    // Assert
    expect(res).toEqual({ ok: true, data: ["p2"] });
  });

  it("полная раскладка — успех с пустым списком", async () => {
    // Arrange
    const repo = createPlacementRepository(fakePort({ relocateProducts: () => [] }));

    // Act
    const res = await repo.relocate(["p1"]);

    // Assert
    expect(res).toEqual({ ok: true, data: [] });
  });

  it("превращает падение раскладки в отказ — выделение экрану ещё пригодится", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createPlacementRepository(
      fakePort({
        relocateProducts: () => {
          throw new Error("сеть недоступна");
        },
      }),
    );

    // Act
    const res = await repo.relocate(["p1"]);

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });

  it("считает занятость по обоим путям хранения: и по ячейке, и по таре", async () => {
    // Arrange: товар лежит прямо в ячейке, а в соседней стоит короб с двумя
    // позициями. Разойдись эти два счёта — тепловая карта соврала бы.
    const repo = createPlacementRepository(
      fakePort({
        placements: { p1: addr() },
        boxes: [
          {
            id: "box-1",
            code: "BX-1",
            status: "placed",
            address: addr({ cellIndex: 1 }),
            lines: [
              { productId: "p2", qty: 4 },
              { productId: "p3", qty: 6 },
            ],
          } as never,
        ],
      }),
    );

    // Act
    const res = await repo.occupancy();

    // Assert
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.values(res.data)).toEqual([
      { productIds: ["p1"], qty: 1 },
      { productIds: ["p2", "p3"], boxId: "box-1", qty: 10 },
    ]);
  });
});
