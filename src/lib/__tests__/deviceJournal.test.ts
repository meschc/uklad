import { describe, expect, it } from "vitest";
import { journalRows, type JournalStint } from "../deviceJournal";

const H = 3_600_000;

describe("journalRows", () => {
  it("подряд один человек — одна строка с его действиями; сменился — новая", () => {
    const rows = journalRows([
      { at: 10 * H, staffRef: "a", kind: "pack_event" },
      { at: 9 * H, staffRef: "a", kind: "pack_event" },
      { at: 8 * H, staffRef: "a", kind: "shift_mark", flagged: true },
      { at: 7 * H, staffRef: "b", kind: "pick_unit" },
    ]) as JournalStint[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ staffRef: "a", from: 8 * H, to: 10 * H, flagged: 1 });
    expect(rows[0].entries.map((e) => e.kind)).toEqual(["pack_event", "pack_event", "shift_mark"]);
    expect(rows[1].staffRef).toBe("b");
  });

  it("долгий перерыв у того же человека — новая строка", () => {
    const rows = journalRows([
      { at: 30 * H, staffRef: "a", kind: "pack_event" },
      { at: 10 * H, staffRef: "a", kind: "pack_event" },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("привязка и отвязка — строки того же уровня, что человек, и делят его работу", () => {
    const rows = journalRows(
      [
        { at: 10 * H, staffRef: "a", kind: "pack_event" },
        { at: 8 * H, staffRef: "a", kind: "pack_event" },
      ],
      { createdAt: 1 * H, revokedAt: 9 * H },
    );
    expect(rows.map((r) => (r.type === "device" ? r.kind : r.staffRef))).toEqual([
      "a",
      "revoked",
      "a",
      "bound",
    ]);
  });
});
