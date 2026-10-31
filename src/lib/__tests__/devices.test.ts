import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { boundDevice, createWorkstationSlice } from "../store/workstation.slice";
import type { EditorState, WorkstationSlice } from "../store/state";
import { badgeCode } from "../workstation";

const slice = createWorkstationSlice as unknown as StateCreator<
  EditorState,
  [],
  [],
  WorkstationSlice
>;

function stand() {
  const store = create<EditorState>()(
    (...a) =>
      ({
        ...slice(...a),
        warehouse: {
          staff: [
            { id: "s1", name: "Упаковщик", role: "Упаковщик" },
            { id: "m1", name: "Начальник", role: "Управляющий складом" },
          ],
        },
      }) as unknown as EditorState,
  );
  return () => store.getState();
}

describe("устройства у столов", () => {
  it("заведённое устройство становится этим браузером и закрывает вход", () => {
    const s = stand();
    s().badgeLogin(badgeCode("s1"), "pack");
    const d = s().addDevice("  Упаковка, стол 3 ", "pack");
    expect(d.name).toBe("Упаковка, стол 3");
    expect(boundDevice(s())?.id).toBe(d.id);
    expect(s().stationSession).toBeNull();
  });

  it("вход за привязанным столом помнит устройство", () => {
    const s = stand();
    const d = s().addDevice("Стол 1", "pack");
    s().badgeLogin(badgeCode("s1"), "pack");
    expect(s().stationSession?.deviceId).toBe(d.id);
  });

  it("отвязать стол может только руководитель, и устройство гаснет", () => {
    const s = stand();
    const d = s().addDevice("Стол 1", "pack");
    expect(s().unbindThisDevice(badgeCode("s1"))).toBe(false);
    expect(boundDevice(s())).not.toBeNull();
    expect(s().unbindThisDevice(badgeCode("m1"))).toBe(true);
    expect(boundDevice(s())).toBeNull();
    expect(s().devices.find((x) => x.id === d.id)?.revokedAt).toBeTypeOf("number");
  });

  it("отключение с экрана «Устройства» снимает привязку и вход этого браузера", () => {
    const s = stand();
    const d = s().addDevice("Стол 1", "pack");
    s().badgeLogin(badgeCode("s1"), "pack");
    s().revokeDevice(d.id);
    expect(boundDevice(s())).toBeNull();
    expect(s().stationSession).toBeNull();
  });
});
