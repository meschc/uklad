import { describe, expect, it, vi } from "vitest";
import { create } from "zustand";
import { guardReadOnly } from "../readOnlyGuard";
import type { EditorState } from "../state";

type Mini = {
  session: { readOnly?: boolean };
  products: string[];
  zoom: number;
  showToast: () => void;
};

function stand(readOnly: boolean) {
  const toast = vi.fn();
  const store = create<Mini>()((set, get) => {
    const guarded = guardReadOnly(
      set as never,
      get as unknown as () => EditorState,
      () => new Set(["products", "session"]),
    ) as unknown as typeof set;
    return {
      session: { readOnly },
      products: ["p1"],
      zoom: 1,
      showToast: toast,
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
    expect(toast).toHaveBeenCalledWith("sync.readOnly");
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
});
