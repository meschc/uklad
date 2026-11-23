import { describe, expect, it } from "vitest";
import { mergeCabinet, sameValue } from "../cabinetMerge";

const req = (id: string, extra: Record<string, unknown> = {}) => ({ id, status: "new", ...extra });

describe("mergeCabinet — правка руководителя поверх сканов", () => {
  it("разные записи не спорят: ложатся и правка, и скан", () => {
    const base = { requests: [req("r1"), req("r2")], boxes: [] as unknown[] };
    const mine = { ...base, requests: [req("r1", { note: "срочно" }), req("r2")] };
    const theirs = {
      requests: [req("r1"), req("r2", { status: "picked" })],
      boxes: [{ id: "b1", items: ["r2"] }],
    };
    const out = mergeCabinet(base, mine, theirs);
    expect(out.lost).toBe(0);
    expect(out.data).toEqual({
      requests: [req("r1", { note: "срочно" }), req("r2", { status: "picked" })],
      boxes: [{ id: "b1", items: ["r2"] }],
    });
  });

  it("разные поля одной записи не спорят, одно и то же поле — склад главнее", () => {
    const base = { requests: [req("r1")] };
    const mine = { requests: [req("r1", { note: "x", status: "cancelled" })] };
    const theirs = { requests: [req("r1", { status: "packed" })] };
    const out = mergeCabinet(base, mine, theirs);
    expect(out.lost).toBe(1);
    expect(out.data.requests).toEqual([req("r1", { note: "x", status: "packed" })]);
  });

  it("убрал запись, которую склад не трогал, — убрана; трогал — осталась", () => {
    const base = { requests: [req("r1"), req("r2")] };
    const mine = { requests: [] as ReturnType<typeof req>[] };
    const theirs = { requests: [req("r1"), req("r2", { status: "picked" })] };
    const out = mergeCabinet(base, mine, theirs);
    expect(out.lost).toBe(1);
    expect(out.data.requests).toEqual([req("r2", { status: "picked" })]);
  });

  it("новая запись встаёт туда же, где она в своём списке", () => {
    const base = { log: [{ id: "e1" }] };
    const mine = { log: [{ id: "e2" }, { id: "e1" }] };
    const theirs = { log: [{ id: "e3" }, { id: "e1" }] };
    expect(mergeCabinet(base, mine, theirs).data.log).toEqual([
      { id: "e2" },
      { id: "e3" },
      { id: "e1" },
    ]);
    const tail = mergeCabinet(base, { log: [{ id: "e1" }, { id: "e2" }] }, theirs);
    expect(tail.data.log).toEqual([{ id: "e3" }, { id: "e1" }, { id: "e2" }]);
  });

  it("поменял запись, которую склад убрал, — склад главнее", () => {
    const base = { boxes: [{ id: "b1", cell: "A1" }] };
    const out = mergeCabinet(base, { boxes: [{ id: "b1", cell: "A2" }] }, { boxes: [] });
    expect(out.lost).toBe(1);
    expect(out.data.boxes).toEqual([]);
  });

  it("порядок ключей из базы правкой не считается", () => {
    expect(sameValue({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
    const base = { w: { name: "Склад", staff: [{ id: "s1", name: "Иван", role: "К" }] } };
    const theirs = { w: { staff: [{ role: "К", name: "Иван", id: "s1" }], name: "Склад" } };
    const mine = { w: { ...base.w, name: "Склад 2" } };
    const out = mergeCabinet(base, mine, theirs);
    expect(out.lost).toBe(0);
    expect(out.data.w.name).toBe("Склад 2");
  });
});
