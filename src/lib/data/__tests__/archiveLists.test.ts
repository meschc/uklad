import { describe, expect, it, vi } from "vitest";
import { groupArchive, mergeArchive } from "../archiveLists";

const req = (id: string, status = "shipped") => ({
  id,
  productId: "p1",
  qty: 1,
  status,
  createdAt: 1,
  destination: "Склад WB",
});

describe("архив → списки кабинета", () => {
  it("раскладывает по складам в прежнем порядке и выкидывает битое", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const lists = groupArchive([
      { w: "w1", d: "requests", ref: "r2", pos: -1, data: req("r2") },
      { w: "w1", d: "requests", ref: "r1", pos: -2, data: req("r1") },
      { w: "w1", d: "requests", ref: "bad", pos: 0, data: { id: "bad" } },
      {
        w: "w2",
        d: "shipments",
        ref: "t1",
        pos: 0,
        data: { id: "t1", requestIds: [], shippedAt: 5 },
      },
      {
        w: "",
        d: "staffEvents",
        ref: "e1",
        pos: 0,
        data: { id: "e1", staffId: "s1", type: "shift_start", at: 1 },
      },
      { w: "w1", d: "boxes", ref: "b1", pos: 0, data: { id: "b1" } },
    ]);
    expect((lists.w1.requests as { id: string }[]).map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(lists.w2.shipments).toHaveLength(1);
    expect(lists.w1).not.toHaveProperty("boxes");
    expect(lists[""]).toHaveProperty("staffEvents");
    vi.restoreAllMocks();
  });

  it("подмешивает старое после нового там, где новое сверху, и до — где снизу", () => {
    const live = [req("r3", "new")];
    expect(mergeArchive("requests", live, [req("r1")]).map((r) => r.id)).toEqual(["r3", "r1"]);
    const ev = [{ id: "e2" }];
    expect(mergeArchive("receivingEvents", ev, [{ id: "e1" }]).map((r) => r.id)).toEqual([
      "e1",
      "e2",
    ]);
  });

  it("запись и в живом, и в архиве берётся живой, без архива — тот же список", () => {
    const live = [req("r1", "new")];
    const merged = mergeArchive("requests", live, [req("r1"), req("r0")]);
    expect(merged.map((r) => [r.id, r.status])).toEqual([
      ["r1", "new"],
      ["r0", "shipped"],
    ]);
    expect(mergeArchive("requests", live, undefined)).toBe(live);
    expect(mergeArchive("requests", live, [req("r1")])).toBe(live);
  });
});
