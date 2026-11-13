import { describe, expect, it } from "vitest";
import { nextStaffNumber, staffNumbers } from "../staffNumber";

const m = (id: string, number?: number) => ({ id, name: id, role: "", number });

describe("табельные номера", () => {
  it("записанные — как есть, старые без номера — следом за наибольшим", () => {
    const n = staffNumbers([m("a"), m("b", 7), m("c")]);
    expect([...n.values()]).toEqual([8, 7, 9]);
    expect(new Set(n.values()).size).toBe(3);
  });

  it("новый — следующий за наибольшим", () => {
    expect(nextStaffNumber([])).toBe(1);
    expect(nextStaffNumber([m("a", 1), m("b", 5)])).toBe(6);
  });
});
