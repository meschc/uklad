import { describe, expect, it } from "vitest";
import { groupJournal } from "../deviceJournal";

const H = 3_600_000;

describe("groupJournal", () => {
  it("подряд один человек — одна строка; сменился — новая", () => {
    const rows = groupJournal([
      { at: 10 * H, staffRef: "a", kind: "pack_event" },
      { at: 9 * H, staffRef: "a", kind: "pack_event" },
      { at: 8 * H, staffRef: "a", kind: "shift_mark", flagged: true },
      { at: 7 * H, staffRef: "b", kind: "pick_unit" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ staffRef: "a", from: 8 * H, to: 10 * H, count: 3, flagged: 1 });
    expect(rows[0].kinds).toEqual({ pack_event: 2, shift_mark: 1 });
    expect(rows[1].staffRef).toBe("b");
  });

  it("долгий перерыв у того же человека — новая строка", () => {
    const rows = groupJournal([
      { at: 30 * H, staffRef: "a", kind: "pack_event" },
      { at: 10 * H, staffRef: "a", kind: "pack_event" },
    ]);
    expect(rows).toHaveLength(2);
  });
});
