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

    store.getState().resolveDispute(id, "written_off", "boss", "пересчитали, не нашли");

    expect(store.getState().boxes[0].lines).toEqual([
      { productId: "p1", qty: 3 },
      { productId: "p2", qty: 3 },
    ]);
  });

  it("списание брака тоже убирает его из тары: до решения он на учёте", () => {
    const box = makeBox({ id: "b1", lines: [{ productId: "p1", qty: 2 }] });
    const store = makeDisputesStore({ boxes: [box] });
    const id = store
      .getState()
      .raiseDispute({ kind: "not_packable", boxId: "b1", productId: "p1", raisedBy: "s1" });
    store.getState().resolveDispute(id, "written_off", "boss", "мятая упаковка");
    expect(store.getState().boxes[0].lines).toEqual([{ productId: "p1", qty: 1 }]);
  });

  it("списать без причины нельзя: решение не записывается", () => {
    const store = makeDisputesStore();
    const id = store.getState().raiseDispute({ kind: "shortage", productId: "p1", raisedBy: "s1" });

    expect(store.getState().resolveDispute(id, "written_off", "boss")).toBe(false);
    expect(store.getState().resolveDispute(id, "written_off", "boss", "   ")).toBe(false);
    expect(store.getState().disputes[0].resolution).toBeUndefined();
  });

  it("нашедший сам недостачу не списывает, но может вернуть", () => {
    const store = makeDisputesStore();
    const id = store.getState().raiseDispute({ kind: "shortage", productId: "p1", raisedBy: "s1" });

    expect(store.getState().resolveDispute(id, "written_off", "s1", "потерялась")).toBe(false);
    expect(store.getState().resolveDispute(id, "returned", "s1")).toBe(true);
  });

  it("старший просит списать — товар на месте, пока начальник не подтвердит", () => {
    const box = makeBox({ id: "b1", lines: [{ productId: "p1", qty: 2 }] });
    const store = makeDisputesStore({ boxes: [box] });
    const id = store
      .getState()
      .raiseDispute({ kind: "not_packable", boxId: "b1", productId: "p1", raisedBy: "s1" });
    const st = () => store.getState();
    expect(st().resolveDispute(id, "written_off", "s2", "", true)).toBe(false);
    expect(st().resolveDispute(id, "written_off", "s2", "разбит", true)).toBe(true);
    expect(st().disputes[0].resolution).toBeUndefined();
    expect(st().disputes[0].writeOffRequest).toMatchObject({ by: "s2", note: "разбит" });
    expect(st().boxes[0].lines).toEqual([{ productId: "p1", qty: 2 }]);
    expect(isDispute(st().disputes[0])).toBe(true);
    // Просивший сам не подтверждает; начальник — да, причина из просьбы.
    expect(st().resolveDispute(id, "written_off", "s2")).toBe(false);
    expect(st().resolveDispute(id, "written_off", "boss")).toBe(true);
    expect(st().disputes[0]).toMatchObject({ resolution: "written_off", note: "разбит" });
    expect(st().boxes[0].lines).toEqual([{ productId: "p1", qty: 1 }]);
  });

  it("лишнее с приёмки: оставить или вернуть поставщику, «вернуть на место» нельзя", () => {
    const box = makeBox({ id: "b1", lines: [{ productId: "p1", qty: 12 }] });
    // Заводит его сервер при приёмке со стола — здесь оно уже пришло.
    const over = {
      kind: "receive_overage" as const,
      boxId: "b1",
      productId: "p1",
      qty: 2,
      raisedBy: "s1",
      raisedAt: 1,
    };
    const store = makeDisputesStore({
      boxes: [box],
      disputes: [
        { id: "o1", ...over },
        { id: "o2", ...over },
      ],
    });
    const st = () => store.getState();
    expect(st().resolveDispute("o1", "returned", "boss")).toBe(false);
    expect(st().resolveDispute("o1", "moved", "boss")).toBe(false);
    expect(st().resolveDispute("o1", "accepted", "boss")).toBe(true);
    expect(st().boxes[0].lines).toEqual([{ productId: "p1", qty: 12 }]);
    // Вернули поставщику — лишнее уходит из тары приёмки.
    expect(st().resolveDispute("o2", "written_off", "boss", "водитель забрал")).toBe(true);
    expect(st().boxes[0].lines).toEqual([{ productId: "p1", qty: 10 }]);
  });

  it("«оставить на складе» — только у лишнего с приёмки", () => {
    const store = makeDisputesStore();
    const id = store.getState().raiseDispute({ kind: "shortage", productId: "p1", raisedBy: "s1" });
    expect(store.getState().resolveDispute(id, "accepted", "boss")).toBe(false);
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
