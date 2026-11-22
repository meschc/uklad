import { describe, expect, test, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { Device } from "../../types";
import { createWorkstationRepository } from "../workstationRepository";

/**
 * «Удаление старого устройства» (Кирилл 22.11). Убрать можно только
 * отключённое: живой стол, пропавший из списка, уже не отключить.
 */
const LIVE: Device = { id: "dev-live", name: "Упаковка 1", station: "pack", createdAt: 1 };
const OLD: Device = { ...LIVE, id: "dev-old", name: "Упаковка 2", revokedAt: 2 };

function repoWith(devices: Device[]) {
  const forgetDevice = vi.fn();
  const state = { session: { source: "server" }, devices, forgetDevice } as unknown as EditorState;
  const repo = createWorkstationRepository({ get: () => state, set: () => {} });
  return { repo, forgetDevice };
}

describe("Убрать устройство из списка", () => {
  test("отключённое — убирается", async () => {
    const { repo, forgetDevice } = repoWith([LIVE, OLD]);
    expect((await repo.forgetDevice("dev-old")).ok).toBe(true);
    expect(forgetDevice).toHaveBeenCalledWith("dev-old");
  });

  test("живое — отказ с подсказкой, список не трогаем", async () => {
    const { repo, forgetDevice } = repoWith([LIVE, OLD]);
    expect(await repo.forgetDevice("dev-live")).toEqual({ ok: false, error: "devices.forgetLive" });
    expect(forgetDevice).not.toHaveBeenCalled();
  });

  test("уже убрано (двойное нажатие, вторая вкладка) — тихо ничего", async () => {
    const { repo, forgetDevice } = repoWith([LIVE]);
    expect((await repo.forgetDevice("dev-old")).ok).toBe(true);
    expect(forgetDevice).not.toHaveBeenCalled();
  });
});
