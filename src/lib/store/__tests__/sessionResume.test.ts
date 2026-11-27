import { describe, expect, test } from "vitest";
import { create, type StateCreator } from "zustand";
import { createSessionSlice } from "../session.slice";
import type { EditorState, SessionSlice } from "../state";

/**
 * Руководитель отвязал стол паролем (разбор 27.11): сервер открыл его вход,
 * и он попадает в тот же склад, где стоял стол, а не в список складов.
 */
const sessionSlice = createSessionSlice as unknown as StateCreator<
  EditorState,
  [],
  [],
  SessionSlice
>;

function makeStore() {
  return create<EditorState>()(
    (set, get, api) =>
      ({
        ...sessionSlice(set, get, api),
        appView: "workstation",
        warehouse: { id: "wh-1", partners: [] },
        otherWarehouses: [{ id: "wh-2" }],
        goToEditor: () => set({ appView: "editor" }),
      }) as unknown as EditorState,
  );
}

describe("вход после отвязки стола", () => {
  test("владелец с несколькими складами — в тот же склад", () => {
    const store = makeStore();
    store.getState().sessionLost("boss@example.ru");
    expect(store.getState().appView).toBe("login");
    store.getState().startServerSession("boss@example.ru", "warehouse", "org-1");
    expect(store.getState().appView).toBe("editor");
    // Пометка одноразовая: следующий вход идёт обычным путём.
    expect(store.getState().session.resumeHere).toBeUndefined();
  });

  test("обычный вход владельца — список складов, как раньше", () => {
    const store = makeStore();
    store.getState().sessionLost();
    store.getState().startServerSession("boss@example.ru", "warehouse", "org-1");
    expect(store.getState().appView).toBe("dashboard");
  });
});
