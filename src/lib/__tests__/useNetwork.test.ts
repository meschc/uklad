import { describe, expect, it } from "vitest";
import { networkState } from "../useNetwork";

describe("networkState", () => {
  it("нет сети — offline при любых оценках", () => {
    expect(networkState(false, { effectiveType: "4g" })).toBe("offline");
  });
  it("2g и долгий отклик — слабая", () => {
    expect(networkState(true, { effectiveType: "2g" })).toBe("weak");
    expect(networkState(true, { effectiveType: "4g", rtt: 1500 })).toBe("weak");
  });
  it("без оценки браузера и с нулями — связь есть", () => {
    expect(networkState(true)).toBe("ok");
    expect(networkState(true, { effectiveType: "4g", rtt: 0, downlink: 0 })).toBe("ok");
  });
});
