import { describe, expect, it } from "vitest";
import { makeOperationsStore } from "./harness";

/** Задания: дата закрытия — дата услуги в счёте, поэтому её ставит срез. */
describe("operations.slice", () => {
  it("ведёт задание от заведения до закрытия и обратно", () => {
    const store = makeOperationsStore();
    const id = store.getState().createTask({ kind: "marking", qty: 12.4, note: "  " });
    let task = store.getState().tasks[0];
    expect(task).toMatchObject({ id, status: "open", qty: 12 });
    expect(task.note).toBeUndefined();

    store.getState().setTaskStatus(id, "done");
    task = store.getState().tasks[0];
    expect(task.doneAt).toBeTypeOf("number");
    expect(task.startedAt).toBeTypeOf("number");

    // Вернули в работу — из счёта задание должно уйти.
    store.getState().setTaskStatus(id, "open");
    expect(store.getState().tasks[0].doneAt).toBeUndefined();
  });

  it("возвращает убранную свою услугу отменой из тоста, без дубля", () => {
    const store = makeOperationsStore({ serviceSettings: { enabled: {}, prices: {} } });
    const kind = store.getState().addCustomService("Фотосъёмка", "unit");
    const service = store.getState().serviceSettings.custom![0];
    store.getState().removeCustomService(kind);
    expect(store.getState().serviceSettings.custom).toEqual([]);
    store.getState().restoreCustomService(service);
    store.getState().restoreCustomService(service);
    expect(store.getState().serviceSettings.custom).toEqual([service]);
  });

  it("не даёт завести задание на ноль", () => {
    const store = makeOperationsStore();
    store.getState().createTask({ kind: "packing", qty: 0 });
    expect(store.getState().tasks[0].qty).toBe(1);
  });

  it("стирает цену пустым значением и не принимает отрицательную", () => {
    const store = makeOperationsStore();
    store.getState().setServicePrice("packing", 35);
    expect(store.getState().serviceSettings.prices.packing).toBe(35);
    store.getState().setServicePrice("packing", -1);
    expect("packing" in store.getState().serviceSettings.prices).toBe(false);
  });
});
