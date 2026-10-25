import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { createWorkstationSlice } from "../store/workstation.slice";
import type { EditorState, WorkstationSlice } from "../store/state";
import { badgeCode } from "../workstation";
import { boxesHolding, explainScan, toteOrders } from "../packing";
import type { Box, FulfillmentRequest, Product } from "../types";

const slice = createWorkstationSlice as unknown as StateCreator<
  EditorState,
  [],
  [],
  WorkstationSlice
>;

const prod = (id: string, barcode: string) =>
  ({ id, sku: `SKU-${id}`, barcode, name: id }) as Product;
const req = (p: Partial<FulfillmentRequest> & { id: string }): FulfillmentRequest => ({
  productId: "p1",
  qty: 1,
  status: "done",
  createdAt: 0,
  updatedAt: 0,
  ...p,
});

function stand(lines: Box["lines"], requests: FulfillmentRequest[] = []) {
  const store = create<EditorState>()(
    (...a) =>
      ({
        ...slice(...a),
        warehouse: { staff: [{ id: "s1", name: "Упаковщик", role: "" }] },
        products: [
          prod("p1", "4600000000017"),
          prod("p2", "4600000000024"),
          prod("p3", "4600000000031"),
        ],
        boxes: [{ id: "b1", barcode: "UK-BOX-000001", createdAt: 0, lines }],
        requests,
      }) as unknown as EditorState,
  );
  const s = () => store.getState();
  s().badgeLogin(badgeCode("s1"), "pack");
  expect(s().packStart("UK-BOX-000001", "UK-OUT-1")).toBeNull();
  /** Полный цикл одной штуки: скан товара → скан напечатанной этикетки. */
  const packOne = (code: string) => {
    const r = s().packScanItem(code);
    if (r.kind === "ok")
      expect(s().packScanLabel(s().packSession!.units.at(-1)!.labelCode)).toBe(true);
    return r.kind;
  };
  return { s, packOne };
}

describe("стол упаковки от тары", () => {
  it("двадцать одинаковых штук — двадцать сканов, двадцать первая лишняя", () => {
    const { s, packOne } = stand([{ productId: "p1", qty: 20 }]);
    for (let i = 0; i < 20; i++) expect(packOne("4600000000017")).toBe("ok");
    expect(packOne("4600000000017")).toBe("extra");
    s().packFinish();
    expect(s().boxes[0].lines).toEqual([]);
  });

  it("пока этикетка не отсканирована, следующий товар не берётся", () => {
    const { s } = stand([{ productId: "p1", qty: 2 }]);
    expect(s().packScanItem("4600000000017").kind).toBe("ok");
    expect(s().packScanItem("4600000000017").kind).toBe("label_pending");
    expect(s().packScanLabel("UK-LBL-ЧУЖАЯ")).toBe(false);
  });

  it("товар не из тары и брак уходят в отказы, недостача остаётся в таре", () => {
    const { s, packOne } = stand([{ productId: "p1", qty: 3 }]);
    expect(packOne("4600000000024")).toBe("not_in_tote");
    packOne("4600000000017");
    s().packScanItem("4600000000017");
    s().packRejectPending();
    s().packFinish();
    // Одна упакована, одна брак — третья не дошла до стола и числится в таре.
    expect(s().boxes[0].lines).toEqual([{ productId: "p1", qty: 1 }]);
    const types = s().staffEvents.map((e) => e.type);
    expect(types).toContain("pack_reject");
    expect(types).toContain("pack_error");
  });

  it("несколько заказов в одной таре: штука находит свой, заказ закрывается своей этикеткой", () => {
    const requests = [
      req({ id: "r1", note: "Коледино", productId: "p1", qty: 1 }),
      req({ id: "r2", note: "Коледино", productId: "p2", qty: 1 }),
      req({ id: "r3", note: "Подольск", productId: "p1", qty: 1 }),
    ];
    const { s, packOne } = stand(
      [
        { productId: "p1", qty: 2 },
        { productId: "p2", qty: 1 },
      ],
      requests,
    );
    expect(toteOrders(requests, s().boxes[0]).map((o) => o.units)).toEqual([2, 1]);
    packOne("4600000000017");
    packOne("4600000000024");
    // Заказ из двух штук собран — ждём этикетку заказа, товар не берётся.
    const label = s().packSession!.orderLabels[0];
    expect(label?.orderId).toBe("r1");
    expect(s().packScanItem("4600000000017").kind).toBe("label_pending");
    expect(s().packScanLabel(label.labelCode)).toBe(true);
    packOne("4600000000017");
    s().packFinish();
    expect(s().requests.every((r) => r.packedAt)).toBe(true);
  });

  it("заказ, который тара не покрывает целиком, в неё не попадает", () => {
    const requests = [req({ id: "r1", note: "Тула", productId: "p1", qty: 5 })];
    const { s } = stand([{ productId: "p1", qty: 2 }], requests);
    expect(toteOrders(requests, s().boxes[0])).toEqual([]);
  });
});

describe("товар не из этой тары", () => {
  it("упаковщик видит, в какой таре товар числится по учёту", () => {
    const boxes: Box[] = [
      { id: "b1", barcode: "UK-BOX-000001", createdAt: 0, lines: [{ productId: "p1", qty: 1 }] },
      { id: "b2", barcode: "UK-BOX-000002", createdAt: 0, lines: [{ productId: "p2", qty: 3 }] },
      { id: "b3", barcode: "UK-BOX-000003", createdAt: 0, lines: [{ productId: "p2", qty: 0 }] },
    ];
    expect(boxesHolding(boxes, "p2", "b1")).toEqual(["UK-BOX-000002"]);
    expect(boxesHolding(boxes, "p3", "b1")).toEqual([]);
  });
});

describe("защита от ошибок упаковщика", () => {
  it("называет, что именно перепутано вместо напечатанной этикетки", () => {
    const { s, packOne } = stand([{ productId: "p1", qty: 3 }]);
    packOne("4600000000017");
    const used = s().packSession!.units[0].labelCode;
    s().packScanItem("4600000000017");
    const why = (code: string) => explainScan(s().packSession!, s().boxes[0], s().products, code);
    expect(why(used)).toBe("label_used");
    expect(why("UK-LBL-ЧУЖАЯ-001")).toBe("label_foreign");
    expect(why("UK-BOX-000001")).toBe("tote_code");
    expect(why("UK-OUT-1")).toBe("tote_code");
    expect(why("4600000000017")).toBe("product_not_label");
    expect(why(s().packSession!.units.at(-1)!.labelCode)).toBeNull();
  });

  it("этикетка, отсканированная вместо товара, — не товар", () => {
    const { s, packOne } = stand([{ productId: "p1", qty: 2 }]);
    packOne("4600000000017");
    const used = s().packSession!.units[0].labelCode;
    expect(explainScan(s().packSession!, s().boxes[0], s().products, used)).toBe("label_not_item");
    expect(explainScan(s().packSession!, s().boxes[0], s().products, "4600000000017")).toBeNull();
  });
});
