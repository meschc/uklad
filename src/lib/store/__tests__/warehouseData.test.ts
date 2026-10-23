import { describe, expect, it } from "vitest";
import { swapWarehouseData } from "../warehouseData";
import type { EditorState } from "../state";

const state = (whId: string, extra: Partial<EditorState> = {}) =>
  ({
    warehouse: { id: whId },
    warehouseData: {},
    expectedShipments: [{ id: "sh1" }],
    receivingEvents: [],
    boxes: [{ id: "b1" }],
    pallets: [],
    receiving: { step: "x" },
    requests: [{ id: "r1" }],
    shipments: [],
    tasks: [],
    ...extra,
  }) as unknown as EditorState;

describe("swapWarehouseData", () => {
  it("новый склад открывается без чужих поставок, заявок и тары", () => {
    const next = swapWarehouseData(state("demo"), "new", true);
    expect(next.boxes).toEqual([]);
    expect(next.requests).toEqual([]);
    expect(next.expectedShipments).toEqual([]);
    expect(next.warehouseData?.demo?.boxes).toEqual([{ id: "b1" }]);
  });

  it("возврат на склад отдаёт его работу обратно", () => {
    const away = swapWarehouseData(state("demo"), "new", true);
    const back = swapWarehouseData(
      { ...state("new"), ...away, warehouse: { id: "new" } } as EditorState,
      "demo",
      undefined,
    );
    expect(back.requests).toEqual([{ id: "r1" }]);
    expect(back.warehouseData?.demo).toBeUndefined();
    expect(back.warehouseData?.new?.requests).toEqual([]);
  });

  it("демо-склад без своей работы продолжает общую историю", () => {
    const next = swapWarehouseData(state("demo"), "demo2", undefined);
    expect(next.requests).toEqual([{ id: "r1" }]);
  });
});
