// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  SIGNAL_MS,
  clearSignal,
  holdSignal,
  levelFor,
  signal,
  useStationSignal,
} from "../scanSignal";

vi.mock("../beep", () => ({ beep: vi.fn() }));

describe("levelFor", () => {
  afterEach(() => vi.useRealTimers());
  it("порядок шагов и лишняя штука — жёлтые", () => {
    expect(levelFor("ws.run.label_pending")).toBe("warn");
    expect(levelFor("ws.run.extra")).toBe("warn");
  });
  it("не та или пустая тара — жёлтая, а не красная (разбор 27.11)", () => {
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
  });
});

describe("подсветка гаснет сама (разбор 27.11: «вечно горит»)", () => {
  afterEach(() => {
    act(() => clearSignal());
    vi.useRealTimers();
  });

  it.each(["warn", "error"] as const)("%s гаснет после своего срока", (level) => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStationSignal());
    act(() => signal(level));
    expect(result.current).toBe(level);
    act(() => vi.advanceTimersByTime(SIGNAL_MS[level] - 1));
    expect(result.current).toBe(level);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBeNull();
  });

  it("красное держится дольше жёлтого", () => {
    expect(SIGNAL_MS.error).toBeGreaterThan(SIGNAL_MS.warn);
  });

  it("незаконченное дело остаётся жёлтым после вспышки", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStationSignal());
    act(() => holdSignal("warn"));
    act(() => signal("error"));
    expect(result.current).toBe("error");
    act(() => vi.advanceTimersByTime(SIGNAL_MS.error));
    expect(result.current).toBe("warn");
  });
});
