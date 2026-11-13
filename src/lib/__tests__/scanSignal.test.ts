import { afterEach, describe, expect, it, vi } from "vitest";
import { levelFor } from "../scanSignal";

vi.mock("../beep", () => ({ beep: vi.fn() }));

describe("levelFor", () => {
  afterEach(() => vi.useRealTimers());
  it("порядок шагов и лишняя штука — жёлтые", () => {
    expect(levelFor("ws.run.label_pending")).toBe("warn");
    expect(levelFor("ws.run.extra")).toBe("warn");
  });
  it("чужой товар и не то назначение — красные", () => {
    expect(levelFor("ws.run.not_in_tote")).toBe("error");
    expect(levelFor("ws.ship.foreign")).toBe("error");
    expect(levelFor("ws.ship.locked")).toBe("error");
  });
});
