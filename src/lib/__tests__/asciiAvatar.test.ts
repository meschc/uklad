import { describe, expect, it } from "vitest";
import { asciiAvatar } from "../asciiAvatar";

describe("ASCII-аватарка", () => {
  it("одна и та же для одного человека, разная для разных", () => {
    expect(asciiAvatar("staff-1")).toBe(asciiAvatar("staff-1"));
    expect(asciiAvatar("staff-1")).not.toBe(asciiAvatar("staff-2"));
    expect(asciiAvatar("staff-1").startsWith("data:image/svg+xml")).toBe(true);
  });
});
