// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { OK_MS, clearSignal, holdSignal, levelFor, signal, useStationSignal } from "../scanSignal";

vi.mock("../beep", () => ({ beep: vi.fn() }));

describe("levelFor", () => {
  afterEach(() => vi.useRealTimers());
  it("порядок шагов и лишняя штука — жёлтые", () => {
    expect(levelFor("ws.run.label_pending")).toBe("warn");
    expect(levelFor("ws.run.extra")).toBe("warn");
  });
  it("не та или пустая тара — жёлтая, а не красная (разбор 27.11)", () => {
    expect(levelFor("recv.box.unknown")).toBe("warn");
    expect(levelFor("pick.tote.busy")).toBe("warn");
    expect(levelFor("ws.tote.unknown")).toBe("warn");
    expect(levelFor("ws.tote.empty")).toBe("warn");
    expect(levelFor("ws.tote.targetBad")).toBe("warn");
  });
  it("чужой товар и не то назначение — красные", () => {
    expect(levelFor("ws.run.not_in_tote")).toBe("error");
    expect(levelFor("ws.ship.foreign")).toBe("error");
    expect(levelFor("ws.ship.locked")).toBe("error");
    expect(levelFor("ws.tote.otherSeller")).toBe("error");
    expect(levelFor("ws.tote.otherTarget")).toBe("error");
    expect(levelFor("pick.item.wrong")).toBe("error");
    expect(levelFor("recv.box.mixed")).toBe("error");
  });
});

describe("подсветка держится до зелёного скана (Кирилл 27.11)", () => {
  afterEach(() => {
    act(() => clearSignal());
    vi.useRealTimers();
  });

  it.each(["warn", "error"] as const)("%s сам не гаснет, гаснет зелёным сканом", (level) => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStationSignal());
    act(() => signal(level));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current).toBe(level);
    act(() => signal("ok"));
    expect(result.current).toBe("ok");
    act(() => vi.advanceTimersByTime(OK_MS));
    expect(result.current).toBeNull();
  });

  it("незаконченное дело остаётся жёлтым после зелёной вспышки", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStationSignal());
    act(() => holdSignal("warn"));
    act(() => signal("ok"));
    act(() => vi.advanceTimersByTime(OK_MS));
    expect(result.current).toBe("warn");
  });
});
