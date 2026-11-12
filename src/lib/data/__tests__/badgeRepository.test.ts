import { describe, expect, it, vi } from "vitest";
import type { EditorState } from "../../store/state";
import type { StorePort } from "../repository";
import { createBadgeRepository, type BadgeServer } from "../badgeRepository";
import { createWorkstationRepository } from "../workstationRepository";
import type { DeskServer } from "../deskServer";
import type { OpQueue } from "../opQueue";
import { fail, ok } from "../result";

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
    addDevice: vi.fn((name: string) => ({ id: "dev-1", name, station: "pack", createdAt: 1 })),
    revokeDevice: vi.fn(),
    sessionLost: vi.fn(),
    stationLogout: vi.fn(),
    thisDeviceId: "dev-1",
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
    check: vi.fn(async (code: string) =>
      ok(known[code] ? { staffId: known[code], permissions: null } : null),
    ),
    issue: vi.fn(async () => ok("UK-STF-CCCCCCCCCCCCCCCCCCCCCC")),
    revoke: vi.fn(async () => ok(undefined)),
  };
}

/** Стол без пропуска: сервер говорит «это не стол», отвязка идёт по-старому. */
function legacyDesks(over: Partial<DeskServer> = {}): DeskServer {
  return {
    open: vi.fn(async () => ok(undefined)),
    revoke: vi.fn(async () => ok(undefined)),
    unbind: vi.fn(async () => ok(null)),
    leave: vi.fn(async () => ok(undefined)),
    ...over,
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
    expect(port.get().openStation).toHaveBeenCalledWith("stf-ivan", "pack", null);
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

  it("отвязать стол без пропуска — только бейджем руководителя, который знает сервер", async () => {
    const port = fakePort(true);
    const repo = createWorkstationRepository(port, fakeServer(), legacyDesks());
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

describe("workstationRepository: стол с пропуском на сервере", () => {
  it("заведённый компьютер становится столом на сервере", async () => {
    const port = fakePort(true);
    const desks = legacyDesks();
    const repo = createWorkstationRepository(port, fakeServer(), desks);
    expect((await repo.addDevice("Стол 1", "pack")).ok).toBe(true);
    expect(desks.open).toHaveBeenCalledWith("dev-1", "Стол 1");
  });

  it("сервер не открыл стол — устройство гаснет, отказ виден", async () => {
    const port = fakePort(true);
    const desks = legacyDesks({ open: vi.fn(async () => fail("data.failed")) });
    const repo = createWorkstationRepository(port, fakeServer(), desks);
    expect(await repo.addDevice("Стол 1", "pack")).toEqual({ ok: false, error: "data.failed" });
    expect(port.get().revokeDevice).toHaveBeenCalledWith("dev-1");
  });

  it("отвязка бейджем руководителя гасит пропуск и ведёт ко входу", async () => {
    const port = fakePort(true);
    const repo = createWorkstationRepository(
      port,
      fakeServer(),
      legacyDesks({ unbind: vi.fn(async () => ok(true)) }),
    );
    expect((await repo.unbindDevice("UK-STF-BBBBBBBBBBBBBBBBBBBBBB")).ok).toBe(true);
    expect(port.get().revokeDevice).toHaveBeenCalledWith("dev-1");
    expect(port.get().sessionLost).toHaveBeenCalled();
  });

  it("неотправленная работа в очереди — отвязать нельзя, сервер не спрашиваем", async () => {
    const port = fakePort(true);
    const desks = legacyDesks({ unbind: vi.fn(async () => ok(true)) });
    const ops = { pending: () => ({ count: 3, since: 1 }) } as unknown as OpQueue;
    const repo = createWorkstationRepository(port, fakeServer(), desks, ops);
    expect(await repo.unbindDevice("UK-STF-BBBBBBBBBBBBBBBBBBBBBB")).toEqual({
      ok: false,
      error: "ws.device.queueNotEmpty",
    });
    expect(desks.unbind).not.toHaveBeenCalled();
    expect(port.get().sessionLost).not.toHaveBeenCalled();
  });

  it("не руководитель — отказ, стол на месте", async () => {
    const port = fakePort(true);
    const repo = createWorkstationRepository(
      port,
      fakeServer(),
      legacyDesks({ unbind: vi.fn(async () => ok(false)) }),
    );
    expect(await repo.unbindDevice("UK-STF-AAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      ok: false,
      error: "ws.device.notManager",
    });
    expect(port.get().sessionLost).not.toHaveBeenCalled();
  });

  it("стол гасят с другого компьютера: сначала сервер, потом список", async () => {
    const port = fakePort(true);
    const desks = legacyDesks({ revoke: vi.fn(async () => fail("data.failed")) });
    const repo = createWorkstationRepository(port, fakeServer(), desks);
    expect((await repo.revokeDevice("dev-7")).ok).toBe(false);
    expect(port.get().revokeDevice).not.toHaveBeenCalled();
  });
});

describe("workstationRepository: выход со стола", () => {
  it("на сервере стол говорит «ушёл», и только потом закрывает вход", async () => {
    const port = fakePort(true);
    const desks = legacyDesks();
    const repo = createWorkstationRepository(port, fakeServer(), desks);
    expect(await repo.logout()).toEqual({ ok: true, data: undefined });
    expect(desks.leave).toHaveBeenCalledOnce();
    expect(port.get().stationLogout).toHaveBeenCalledOnce();
  });

  it("сбой связи выход не держит, а в демо сервер не зовём", async () => {
    const down = legacyDesks({ leave: vi.fn(async () => fail("data.failed")) });
    const onServer = fakePort(true);
    await createWorkstationRepository(onServer, fakeServer(), down).logout();
    expect(onServer.get().stationLogout).toHaveBeenCalledOnce();

    const demo = fakePort(false);
    const desks = legacyDesks();
    await createWorkstationRepository(demo, fakeServer(), desks).logout();
    expect(desks.leave).not.toHaveBeenCalled();
    expect(demo.get().stationLogout).toHaveBeenCalledOnce();
  });
});
