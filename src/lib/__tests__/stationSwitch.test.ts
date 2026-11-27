import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { maySwitchTo, OPEN_STATIONS, stationsFor } from "../stationSwitch";
import { createWorkstationSlice } from "../store/workstation.slice";
import { createSwitchRepository } from "../data/switchRepository";
import type { EditorState, WorkstationSlice } from "../store/state";
import type { StationSession } from "../types";

/**
 * Смена процесса без выхода, с разрешением старшего. Ошибка здесь тихая:
 * лишний процесс в списке — человек просит работу, которую роль ему не даёт;
 * процесс, сменившийся без разрешения, — тот самый бесконтрольный переход,
 * которого Кирилл не хочет.
 */

describe("stationsFor: процессы по роли", () => {
  it("демо без сервера — все открытые процессы", () => {
    expect(stationsFor(undefined)).toEqual([...OPEN_STATIONS]);
  });

  it("по правам роли: сортировка вместе с отгрузкой, без роли — ничего", () => {
    expect(stationsFor(["packing.do", "shipping.do"])).toEqual(["pack", "sorting", "shipping"]);
    expect(stationsFor(["packing.view", "goods.decide"])).toEqual([]);
    expect(stationsFor(null)).toEqual([]);
  });

  it("на текущий и на чужой процесс не переходят", () => {
    expect(maySwitchTo("pack", "sorting", ["packing.do", "shipping.do"])).toBe(true);
    expect(maySwitchTo("pack", "pack", ["packing.do"])).toBe(false);
    expect(maySwitchTo("pack", "receiving", ["packing.do"])).toBe(false);
  });
});

const slice = createWorkstationSlice as unknown as StateCreator<
  EditorState,
  [],
  [],
  WorkstationSlice
>;

const live = (over: Partial<StationSession> = {}): StationSession => ({
  staffId: "stf-ivan",
  station: "pack",
  startedAt: Date.now() - 1000,
  expiresAt: Date.now() + 60_000,
  deviceId: "dev-1",
  permissions: ["packing.do", "shipping.do"],
  ...over,
});

function demo(session: StationSession | null = live()) {
  const s = create<EditorState>()(
    (...a) =>
      ({
        ...slice(...a),
        stationSession: session,
        session: { source: undefined },
      }) as unknown as EditorState,
  );
  return { port: { get: () => s.getState(), set: s.setState }, s };
}

describe("заявка на смену процесса (демо — тот же путь, что на сервере)", () => {
  it("процесс меняется только после разрешения и применения", async () => {
    const { port, s } = demo();
    const repo = createSwitchRepository(port);
    const asked = await repo.request("sorting");
    expect(asked.ok).toBe(true);
    const id = asked.ok ? asked.data : "";
    // Ждём: процесс прежний, применить нельзя.
    expect(s.getState().stationSession?.station).toBe("pack");
    expect((await repo.apply(id)).ok).toBe(false);
    expect((await repo.pending()).ok && (await repo.pending())).toMatchObject({
      data: [{ id, staffId: "stf-ivan", station: "sorting", from: "pack" }],
    });
    // Старший в кабинете разрешил — стол применил.
    expect((await repo.decide(id, true)).ok).toBe(true);
    expect(await repo.status(id)).toMatchObject({ ok: true, data: { status: "approved" } });
    expect((await repo.apply(id)).ok).toBe(true);
    expect(s.getState().stationSession).toMatchObject({ staffId: "stf-ivan", station: "sorting" });
    expect(s.getState().pendingSwitch).toBeNull();
    // Разрешённая не уходит в никуда (разбор 27.11): она в «Решённых» и видно, что стол её применил.
    expect((await repo.pending()).ok && (await repo.pending())).toMatchObject({ data: [] });
    const done = await repo.decided();
    expect(done.ok && done.data.map((r) => [r.id, r.status])).toEqual([[id, "applied"]]);
    expect(done.ok && typeof done.data[0].decidedAt).toBe("number");
  });

  it("отклонённая заявка процесс не меняет, второй раз её не решить", async () => {
    const { port, s } = demo();
    const repo = createSwitchRepository(port);
    const asked = await repo.request("shipping");
    const id = asked.ok ? asked.data : "";
    expect((await repo.decide(id, false)).ok).toBe(true);
    expect(await repo.decide(id, true)).toEqual({ ok: false, error: "approvals.gone" });
    expect((await repo.apply(id)).ok).toBe(false);
    expect(s.getState().stationSession?.station).toBe("pack");
    const done = await repo.decided();
    expect(done.ok && done.data.map((r) => r.status)).toEqual(["declined"]);
  });

  it("процесс не по роли не попросить; без входа — тоже", async () => {
    const repo = createSwitchRepository(demo().port);
    expect(await repo.request("receiving")).toEqual({ ok: false, error: "ws.switch.denied" });
    const none = createSwitchRepository(demo(null).port);
    expect((await none.request("sorting")).ok).toBe(false);
  });

  it("новая заявка снимает прежнюю того же сотрудника", async () => {
    const { port } = demo();
    const repo = createSwitchRepository(port);
    await repo.request("sorting");
    await repo.request("shipping");
    const open = await repo.pending();
    expect(open.ok && open.data.map((r) => r.station)).toEqual(["shipping"]);
  });
});
