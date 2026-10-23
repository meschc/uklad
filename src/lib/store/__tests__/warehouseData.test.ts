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

describe("sanitizeDomains для warehouseData", () => {
  it("битая запись спящего склада теряется одна, а старый архив без поля проходит", async () => {
    const { sanitizeDomains } = await import("../../data/sanitize");
    const out = sanitizeDomains({
      warehouseData: { w1: { requests: [{ nope: 1 }], boxes: "битое" } },
    });
    const w1 = (out.warehouseData as Record<string, Record<string, unknown>>).w1;
    expect(w1.requests).toEqual([]);
    expect(w1.boxes).toEqual([]);
    expect(sanitizeDomains({ products: [] }).warehouseData).toBeUndefined();
  });

  it("неполная сохранённая работа дополняется пустыми списками", () => {
    const s = state("demo", {
      warehouseData: { old: { requests: [] } } as unknown as EditorState["warehouseData"],
    });
    expect(swapWarehouseData(s, "old", true).tasks).toEqual([]);
  });
});

describe("цены услуг у каждого склада свои", () => {
  it("новый склад берёт копию цен текущего, правка не задевает старый", () => {
    const settings = { enabled: { pick: true }, prices: { pick: 15 } };
    const s = state("demo", { serviceSettings: settings } as unknown as Partial<EditorState>);
    const next = swapWarehouseData(s, "new", true);
    expect(next.serviceSettings).toEqual(settings);
    expect(next.serviceSettings).not.toBe(settings);
    (next.serviceSettings!.prices as Record<string, number>).pick = 99;
    expect(next.warehouseData?.demo?.serviceSettings.prices).toEqual({ pick: 15 });
  });
});
