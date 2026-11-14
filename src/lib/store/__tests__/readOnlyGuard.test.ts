import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { guardReadOnly } from "../readOnlyGuard";
import type { EditorState } from "../state";

type Mini = {
  session: { readOnly?: boolean; writable?: string[] };
  products: string[];
  warehouse: { floors: number[]; staff: string[] };
  zoom: number;
  notify: () => void;
};

function stand(readOnly: boolean, writable?: string[]) {
  const toast = vi.fn();
  const store = create<Mini>()((set, get) => {
    const guarded = guardReadOnly(
      set as never,
      get as unknown as () => EditorState,
      () => new Set(["products", "session", "warehouse"]),
    ) as unknown as typeof set;
    return {
      session: { readOnly, writable },
      products: ["p1"],
      warehouse: { floors: [1], staff: ["a"] },
      zoom: 1,
      notify: toast,
      guarded,
    } as Mini & {
      guarded: typeof set;
    };
  });
  const guarded = (store.getState() as unknown as { guarded: (p: Partial<Mini>) => void }).guarded;
  return { store, guarded, toast };
}

describe("режим просмотра в сторе", () => {
  it("правка компании не ложится, своё устройства — ложится, человеку говорим почему", () => {
    const { store, guarded, toast } = stand(true);
    guarded({ products: ["p1", "p2"], zoom: 2 });
    expect(store.getState().products).toEqual(["p1"]);
    expect(store.getState().zoom).toBe(2);
    expect(toast).toHaveBeenCalledWith("info", "sync.readOnly");
    // Вход и смена у стола — не данные компании.
    guarded({ session: { readOnly: false } });
    expect(store.getState().session.readOnly).toBe(false);
  });

  it("у руководителя запись как обычно", () => {
    const { store, guarded, toast } = stand(false);
    guarded({ products: ["p1", "p2"] });
    expect(store.getState().products).toEqual(["p1", "p2"]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("роль с частью модулей меняет только их, у склада — только план", () => {
    const { store, guarded, toast } = stand(true, ["products", "warehouse"]);
    guarded({ products: ["p1", "p2"] });
    expect(store.getState().products).toEqual(["p1", "p2"]);
    const wh = store.getState().warehouse;
    guarded({ warehouse: { ...wh, floors: [1, 2] } });
    expect(store.getState().warehouse.floors).toEqual([1, 2]);
    expect(toast).not.toHaveBeenCalled();
    // Персонал — не план: такая правка не ложится.
    guarded({ warehouse: { ...store.getState().warehouse, staff: ["b"] } });
    expect(store.getState().warehouse.staff).toEqual(["a"]);
    expect(toast).toHaveBeenCalledWith("info", "sync.readOnly");
  });
});
