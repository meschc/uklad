import { describe, expect, it } from "vitest";
import { makeDisputesStore } from "./harness";
import { makeBox } from "../../__tests__/fixtures";
import { isDispute } from "../../data/guards";

/**
 * Спорное: сотрудник недостачу не оформляет, он только находит. Проверяем то,
 * что ломается молча: дубли от повторных сканов, перезапись первого решения и
 * списание, которое двигает остаток в таре.
 */
describe("disputes.slice", () => {
  it("копит повторный скан одного и того же в одну запись", () => {
    const store = makeDisputesStore();
    const args = { kind: "extra", boxId: "b1", productId: "p1", raisedBy: "s1" } as const;

    const a = store.getState().raiseDispute(args);
    const b = store.getState().raiseDispute(args);

    expect(b).toBe(a);
    expect(store.getState().disputes).toHaveLength(1);
    expect(store.getState().disputes[0].qty).toBe(2);
  });

  it("не склеивает разные виды и разные тары", () => {
    const store = makeDisputesStore();
    store.getState().raiseDispute({ kind: "extra", boxId: "b1", productId: "p1", raisedBy: "s1" });
    store
      .getState()
      .raiseDispute({ kind: "not_in_tote", boxId: "b1", productId: "p1", raisedBy: "s1" });
    store.getState().raiseDispute({ kind: "extra", boxId: "b2", productId: "p1", raisedBy: "s1" });

    expect(store.getState().disputes).toHaveLength(3);
  });

  it("пишет, кто нашёл и когда, а решённое не принимает второго решения", () => {
    const store = makeDisputesStore();
    const id = store.getState().raiseDispute({ kind: "extra", productId: "p1", raisedBy: "s1" });
    expect(store.getState().disputes[0]).toMatchObject({ raisedBy: "s1" });
    expect(store.getState().disputes[0].raisedAt).toBeTypeOf("number");

    expect(store.getState().resolveDispute(id, "returned", "boss")).toBe(true);
    expect(store.getState().resolveDispute(id, "written_off", "other")).toBe(false);

    expect(store.getState().disputes[0]).toMatchObject({
      resolution: "returned",
      resolvedBy: "boss",
    });
  });

  it("после решения такое же находят заново отдельной записью", () => {
    const store = makeDisputesStore();
    const args = { kind: "extra", boxId: "b1", productId: "p1", raisedBy: "s1" } as const;
    const first = store.getState().raiseDispute(args);
    store.getState().resolveDispute(first, "returned", "boss");

    const second = store.getState().raiseDispute(args);

    expect(second).not.toBe(first);
    expect(store.getState().disputes).toHaveLength(2);
  });

  it("списание недостачи убирает товар из строк тары, остальное оставляет", () => {
    const box = makeBox({
      id: "b1",
      lines: [
        { productId: "p1", qty: 5 },
        { productId: "p2", qty: 3 },
      ],
    });
    const store = makeDisputesStore({ boxes: [box] });
    const id = store
      .getState()
      .raiseDispute({ kind: "shortage", boxId: "b1", productId: "p1", qty: 2, raisedBy: "s1" });

    store.getState().resolveDispute(id, "written_off", "boss");

    expect(store.getState().boxes[0].lines).toEqual([
      { productId: "p1", qty: 3 },
      { productId: "p2", qty: 3 },
    ]);
  });

  it("возврат и перекладывание остаток не трогают", () => {
    const box = makeBox({ id: "b1", lines: [{ productId: "p1", qty: 5 }] });
    const store = makeDisputesStore({ boxes: [box] });
    const id = store
      .getState()
      .raiseDispute({ kind: "shortage", boxId: "b1", productId: "p1", qty: 2, raisedBy: "s1" });

    store.getState().resolveDispute(id, "returned", "boss");

    expect(store.getState().boxes[0].lines).toEqual([{ productId: "p1", qty: 5 }]);
  });
});

describe("isDispute", () => {
  const base = { id: "d1", kind: "extra", raisedBy: "s1", raisedAt: 1, qty: 1 };

  it("принимает открытое и полностью решённое", () => {
    expect(isDispute(base)).toBe(true);
    expect(isDispute({ ...base, resolution: "returned", resolvedBy: "boss", resolvedAt: 2 })).toBe(
      true,
    );
  });

  it("не принимает решённое без автора или времени: так подложили бы решение", () => {
    expect(isDispute({ ...base, resolution: "returned" })).toBe(false);
    expect(isDispute({ ...base, resolution: "returned", resolvedBy: "boss" })).toBe(false);
  });
});
