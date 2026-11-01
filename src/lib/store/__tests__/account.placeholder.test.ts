import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { createAccountSlice } from "../account.slice";
import type { AccountSlice, EditorState } from "../state";
import { blankWarehouse } from "../seed";

/**
 * У новой компании складов ноль (Кирилл 1 ноя: «я склад не добавлял, а он уже
 * добавился»). Стор держит активный склад всегда, поэтому вместо него —
 * заготовка `placeholder`: в списке её нет, а первый созданный склад встаёт
 * на её место, а не рядом с ней.
 */
const accountSlice = createAccountSlice as unknown as StateCreator<
  EditorState,
  [],
  [],
  AccountSlice
>;

function makeStore() {
  const placeholder = { ...blankWarehouse("", "mezzanine", ""), placeholder: true };
  return create<EditorState>()(
    (...a) =>
      ({
        ...accountSlice(...a),
        warehouse: placeholder,
        otherWarehouses: [],
        activeFloorId: placeholder.floors[0].id,
      }) as unknown as EditorState,
  );
}

describe("компания без склада", () => {
  it("заготовки нет в списке складов", () => {
    const store = makeStore();
    expect(store.getState().allWarehouses()).toEqual([]);
  });

  it("первый склад встаёт на место заготовки", () => {
    const store = makeStore();
    const id = store.getState().createWarehouse("Склад на Ленина", "mezzanine", "");
    const s = store.getState();
    expect(s.warehouse.id).toBe(id);
    expect(s.warehouse.placeholder).toBeUndefined();
    expect(s.otherWarehouses).toEqual([]);
    expect(s.activeFloorId).toBe(s.warehouse.floors[0].id);
    expect(s.allWarehouses().map((w) => w.name)).toEqual(["Склад на Ленина"]);
  });

  it("второй склад добавляется рядом, как раньше", () => {
    const store = makeStore();
    store.getState().createWarehouse("Первый", "mezzanine", "");
    store.getState().createWarehouse("Второй", "mezzanine", "");
    expect(
      store
        .getState()
        .allWarehouses()
        .map((w) => w.name),
    ).toEqual(["Первый", "Второй"]);
  });
});
