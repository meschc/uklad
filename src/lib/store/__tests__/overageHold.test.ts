import { describe, expect, it } from "vitest";
import { makeBox, makeRequest, makeShipment, makeShipmentLine } from "../../__tests__/fixtures";
import { freeInBox, heldQty, overReceived } from "../../disputes";
import { hasDiscrepancy, supplyAct } from "../../supplyAct";
import type { Dispute } from "../../types";
import { makeFlowStore } from "./harness";

/**
 * Карантин излишка с приёмки (Кирилл 17.11): лишнее сверх строки поставки
 * сразу уходит старшему спорным и до его решения не собирается и не уходит
 * в кроссдок. Ошибка здесь тихая: чужой товар уехал бы к покупателю раньше,
 * чем склад понял, чей он.
 */

const CELL = { floorId: "f1", moduleId: "m1", shelfIndex: 0, cellIndex: 0 };
const hold = (over: Partial<Dispute> = {}): Dispute => ({
  id: "ovr-1",
  kind: "receive_overage",
  boxId: "b1",
  productId: "p1",
  qty: 2,
  lineId: "l1",
  raisedBy: "s1",
  raisedAt: 1,
  ...over,
});

describe("сколько лишнего", () => {
  it("без строки — всё принятое, со строкой — только сверх ожидаемого", () => {
    expect(overReceived(undefined, 3)).toBe(3);
    expect(overReceived({ expectedQty: 5, receivedQty: 4 }, 3)).toBe(2);
    expect(overReceived({ expectedQty: 5, receivedQty: 0 }, 3)).toBe(0);
    expect(overReceived({ expectedQty: 5, receivedQty: 7 }, 3)).toBe(3);
  });

  it("карантин держит только открытое лишнее этой тары и этого товара", () => {
    const box = makeBox({ id: "b1", lines: [{ productId: "p1", qty: 5 }] });
    const ds = [
      hold(),
      hold({ id: "x", resolution: "accepted" }),
      hold({ id: "y", boxId: "b2" }),
      // Принятое без строки поставки — не карантин.
      hold({ id: "z", lineId: undefined }),
    ];
    expect(heldQty(ds, "b1", "p1")).toBe(2);
    expect(freeInBox(ds, box, "p1")).toBe(3);
  });
});

describe("приёмка сверх строки", () => {
  it("заводит спорное старшему с id события, недобор — нет", () => {
    const line = makeShipmentLine({ id: "l1", productId: "p1", expectedQty: 5, receivedQty: 4 });
    const store = makeFlowStore({
      expectedShipments: [makeShipment({ id: "sh1", lines: [line] })],
      boxes: [makeBox({ id: "b1", lines: [] })],
      disputes: [],
    });
    const id = store
      .getState()
      .receiveProduct({ productId: "p1", qty: 3, boxId: "b1", shipmentId: "sh1", lineId: "l1" });
    expect(store.getState().disputes).toEqual([
      expect.objectContaining({ id: `ovr-${id}`, kind: "receive_overage", lineId: "l1", qty: 2 }),
    ]);
    // Без строки поставки спорного браузер не заводит.
    store.getState().receiveProduct({ productId: "p1", qty: 1, boxId: "b1" });
    expect(store.getState().disputes).toHaveLength(1);
  });

  it("кроссдок отдаёт в заявки только то, что не в карантине", () => {
    const store = makeFlowStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 5 })],
      expectedShipments: [],
      boxes: [makeBox({ id: "b1", lines: [{ productId: "p1", qty: 3 }] })],
      disputes: [hold()],
    });
    expect(store.getState().applyCrossDock("p1", 3, undefined, "b1")).toBe(1);
    expect(store.getState().boxes[0].lines).toEqual([{ productId: "p1", qty: 2 }]);
  });

  it("сборка не снимает излишек из тары, пока старший не решил", () => {
    const store = makeFlowStore({
      requests: [makeRequest({ id: "r1", productId: "p1", qty: 2 })],
      boxes: [makeBox({ id: "b1", address: CELL, lines: [{ productId: "p1", qty: 1 }] })],
      placements: {},
      disputes: [hold({ qty: 1 })],
    });
    expect(store.getState().recordPick("r1", "p1", CELL)).toBe(0);
    store.setState({ disputes: [hold({ qty: 1, resolution: "accepted", resolvedBy: "s2" })] });
    expect(store.getState().recordPick("r1", "p1", CELL)).toBe(1);
  });
});

describe("акт поставки продавцу", () => {
  const shipment = makeShipment({
    id: "sh1",
    status: "closed",
    lines: [
      makeShipmentLine({ id: "l1", productId: "p1", expectedQty: 5, receivedQty: 7 }),
      makeShipmentLine({ id: "l2", productId: "p2", expectedQty: 4, receivedQty: 3 }),
      makeShipmentLine({ id: "l3", productId: "p9", expectedQty: 1, receivedQty: 0 }),
    ],
  });

  it("только свои строки; у излишка — решение склада", () => {
    const lines = supplyAct(shipment, new Set(["p1", "p2"]), [hold()]);
    expect(lines.map((l) => [l.productId, l.diff, l.overage])).toEqual([
      ["p1", 2, "pending"],
      ["p2", -1, undefined],
    ]);
    const done = supplyAct(shipment, new Set(["p1"]), [
      hold({ resolution: "written_off", resolvedBy: "s2" }),
    ]);
    expect(done[0].overage).toBe("removed");
  });

  it("недостача — расхождение только у закрытой поставки", () => {
    const short = [{ lineId: "l2", productId: "p2", expected: 4, received: 3, diff: -1 }];
    expect(hasDiscrepancy(shipment, short)).toBe(true);
    expect(hasDiscrepancy({ ...shipment, status: "receiving" }, short)).toBe(false);
  });
});

describe("брак на приёмке (Кирилл 27.11)", () => {
  it("на учёт в таре, спорным «брак» старшему и в карантин до решения", () => {
    const line = makeShipmentLine({ id: "l1", productId: "p1", expectedQty: 5, receivedQty: 0 });
    const store = makeFlowStore({
      expectedShipments: [makeShipment({ id: "sh1", lines: [line] })],
      boxes: [makeBox({ id: "b1", lines: [] })],
      disputes: [],
    });
    const id = store.getState().receiveProduct({
      productId: "p1",
      qty: 2,
      boxId: "b1",
      shipmentId: "sh1",
      lineId: "l1",
      defect: true,
    });
    const s = store.getState();
    expect(s.boxes[0].lines).toEqual([{ productId: "p1", qty: 2 }]);
    expect(s.expectedShipments[0].lines[0].receivedQty).toBe(2);
    expect(s.disputes.map((d) => [d.id, d.kind, d.qty])).toEqual([
      [`def-${id}`, "not_packable", 2],
    ]);
    expect(freeInBox(s.disputes, s.boxes[0], "p1")).toBe(0);
    // Старший решил «вернуть в работу» — карантин снят.
    const done = s.disputes.map((d) => ({ ...d, resolution: "returned" as const }));
    expect(freeInBox(done, s.boxes[0], "p1")).toBe(2);
  });
});
