import { describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createBadgeRepository, type BadgeServer } from "../badgeRepository";
import { createWorkstationRepository } from "../workstationRepository";
import { ok } from "../result";

/**
 * Бейдж стола в двух мирах. Ошибается молча и дорого: если в сборке с
 * сервером кабинет по-прежнему примет `UK-STF-<id>`, копия чужого бейджа
 * пустит за другого, а смены и заработок запишутся не на того человека.
 */

function fakePort(server: boolean, over: Partial<EditorState> = {}): StorePort {
  const state = {
    session: { source: server ? "server" : "local" },
    openStation: vi.fn((id: string) => (id === "stf-ivan" || id === "stf-boss" ? id : null)),
    badgeLogin: vi.fn(() => "stf-ivan"),
    unbindAs: vi.fn((id: string) => id === "stf-boss"),
    unbindThisDevice: vi.fn(() => true),
    ...over,
  } as unknown as EditorState;
  return { get: () => state, set: () => {} };
}

/** Сервер знает один бейдж — случайный код Ивана — и один бейдж руководителя. */
function fakeServer(): BadgeServer {
  const known: Record<string, string> = {
    "UK-STF-AAAAAAAAAAAAAAAAAAAAAA": "stf-ivan",
    "UK-STF-BBBBBBBBBBBBBBBBBBBBBB": "stf-boss",
  };
  return {
    check: vi.fn(async (code: string) => ok(known[code] ?? null)),
    issue: vi.fn(async () => ok("UK-STF-CCCCCCCCCCCCCCCCCCCCCC")),
    revoke: vi.fn(async () => ok(undefined)),
  };
}

describe("badgeRepository", () => {
  it("демо: бейдж из номера сотрудника, гасить нечего", async () => {
    const server = fakeServer();
    const repo = createBadgeRepository(fakePort(false), server);
    expect(repo.revocable()).toBe(false);
    expect(await repo.issue("stf-ivan")).toEqual({ ok: true, data: "UK-STF-stf-ivan" });
    expect(await repo.revoke("stf-ivan")).toEqual({ ok: true, data: undefined });
    expect(server.issue).not.toHaveBeenCalled();
    expect(server.revoke).not.toHaveBeenCalled();
  });

  it("сервер: код выпускает и гасит сервер", async () => {
    const server = fakeServer();
    const repo = createBadgeRepository(fakePort(true), server);
    expect(repo.revocable()).toBe(true);
    expect(await repo.issue("stf-ivan")).toEqual({
      ok: true,
      data: "UK-STF-CCCCCCCCCCCCCCCCCCCCCC",
    });
    await repo.revoke("stf-ivan");
    expect(server.revoke).toHaveBeenCalledWith("stf-ivan");
  });
});

describe("workstationRepository: вход по бейджу на сервере", () => {
  it("пускает по коду, который знает сервер", async () => {
    const port = fakePort(true);
    const repo = createWorkstationRepository(port, fakeServer());
    expect(await repo.login("UK-STF-AAAAAAAAAAAAAAAAAAAAAA", "pack")).toEqual({
      ok: true,
      data: "stf-ivan",
    });
    expect(port.get().openStation).toHaveBeenCalledWith("stf-ivan", "pack");
    // Разбор демо-кода в обход сервера не вызывается вовсе.
    expect(port.get().badgeLogin).not.toHaveBeenCalled();
  });

  it("бейдж из номера сотрудника на сервере не пускает", async () => {
    const port = fakePort(true);
    const repo = createWorkstationRepository(port, fakeServer());
    expect(await repo.login("UK-STF-stf-ivan", "pack")).toEqual({
      ok: false,
      error: "ws.badgeUnknown",
    });
    expect(port.get().openStation).not.toHaveBeenCalled();
  });

  it("отвязать стол — только бейджем руководителя, который знает сервер", async () => {
    const port = fakePort(true);
    const repo = createWorkstationRepository(port, fakeServer());
    expect(await repo.unbindDevice("UK-STF-AAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      ok: false,
      error: "ws.device.notManager",
    });
    expect(await repo.unbindDevice("UK-STF-stf-boss")).toEqual({
      ok: false,
      error: "ws.device.notManager",
    });
    expect(await repo.unbindDevice("UK-STF-BBBBBBBBBBBBBBBBBBBBBB")).toEqual({
      ok: true,
      data: undefined,
    });
    expect(port.get().unbindThisDevice).not.toHaveBeenCalled();
  });

  it("демо: вход идёт через разбор кода в срезе, сервер не спрашивается", async () => {
    const server = fakeServer();
    const port = fakePort(false);
    const repo = createWorkstationRepository(port, server);
    expect((await repo.login("UK-STF-stf-ivan", "pack")).ok).toBe(true);
    expect(port.get().badgeLogin).toHaveBeenCalled();
    expect(server.check).not.toHaveBeenCalled();
  });
});
