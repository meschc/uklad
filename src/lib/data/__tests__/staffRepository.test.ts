import { describe, expect, it, vi } from "vitest";
import type { StaffMember, Warehouse } from "../../types";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createStaffRepository } from "../staffRepository";

/**
 * Репозиторий персонала через подменённый порт — ни стора, ни `localStorage`.
 *
 * Список принадлежит складу, а не аккаунту, и читается из активного склада: при
 * переключении склада он обязан смениться вместе с ним. Второе, ради чего этот
 * файл существует, — загрузка из файла. Она ОДИН вызов, а не цикл по людям:
 * сорок строк в CSV не должны стать сорока запросами, из которых половина
 * пройдёт, а половина нет.
 */

function fakePort(state: Partial<EditorState>): StorePort {
  return {
    get: () => state as EditorState,
    set: () => {},
  };
}

/** Склад с готовым списком людей — больше репозиторию от склада ничего не надо. */
const withStaff = (staff: unknown[]): Partial<EditorState> => ({
  warehouse: { staff } as unknown as Warehouse,
});

const member = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: "staff_1",
  name: "Иван Петров",
  role: "Кладовщик",
  ...over,
});

describe("createStaffRepository", () => {
  it("читает персонал активного склада", async () => {
    // Arrange
    const m = member();
    const repo = createStaffRepository(fakePort(withStaff([m])));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [m] });
  });

  it("на складе без персонала отдаёт пустой список, а не отказ", async () => {
    // Arrange: новый склад — нормальное состояние, а не поломка.
    const repo = createStaffRepository(fakePort({ warehouse: {} as Warehouse }));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [] });
  });

  it("выбрасывает битую запись, но остальных показывает", async () => {
    // Arrange: одна испорченная строка в хранилище не повод спрятать всю смену.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const good = member();
    const repo = createStaffRepository(fakePort(withStaff([good, { id: "staff_2" }])));

    // Act
    const res = await repo.list();

    // Assert
    expect(res).toEqual({ ok: true, data: [good] });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("на неизвестного человека отдаёт null, а не отказ", async () => {
    // Arrange
    const repo = createStaffRepository(fakePort(withStaff([member()])));

    // Act
    const res = await repo.get("staff_999");

    // Assert
    expect(res).toEqual({ ok: true, data: null });
  });

  it("возвращает id заведённого сотрудника", async () => {
    // Arrange: id нужен экрану, чтобы сразу раскрыть строку на правку.
    const addStaffMember = vi.fn(() => "staff_7");
    const repo = createStaffRepository(fakePort({ addStaffMember }));

    // Act
    const res = await repo.create({ name: "Пётр", role: "Грузчик" });

    // Assert
    expect(res).toEqual({ ok: true, data: "staff_7" });
    expect(addStaffMember).toHaveBeenCalledWith({ name: "Пётр", role: "Грузчик" });
  });

  it("загружает список из файла одним вызовом, а не по одному человеку", async () => {
    // Arrange
    const importStaff = vi.fn();
    const addStaffMember = vi.fn();
    const repo = createStaffRepository(fakePort({ importStaff, addStaffMember }));
    const rows = [
      { name: "Пётр", role: "Грузчик" },
      { name: "Анна", role: "Кладовщик" },
    ];

    // Act
    const res = await repo.importMany(rows);

    // Assert
    expect(res.ok).toBe(true);
    expect(importStaff).toHaveBeenCalledTimes(1);
    expect(importStaff).toHaveBeenCalledWith(rows);
    expect(addStaffMember).not.toHaveBeenCalled();
  });

  it("передаёт правку в стор патчем, а не целой записью", async () => {
    // Arrange: на сервер уедет ровно изменённое поле.
    const updateStaffMember = vi.fn();
    const repo = createStaffRepository(fakePort({ updateStaffMember }));

    // Act
    const res = await repo.update("staff_1", { role: "Старший кладовщик" });

    // Assert
    expect(updateStaffMember).toHaveBeenCalledWith("staff_1", { role: "Старший кладовщик" });
    expect(res.ok).toBe(true);
  });

  it("превращает падение удаления в отказ — строке ещё показывать сообщение", async () => {
    // Arrange
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createStaffRepository(
      fakePort({
        removeStaffMember: () => {
          throw new Error("сеть недоступна");
        },
      }),
    );

    // Act
    const res = await repo.remove("staff_1");

    // Assert
    expect(res).toEqual({ ok: false, error: "data.failed" });
    spy.mockRestore();
  });
});
