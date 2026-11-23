import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { openParcelCheck, parcelCard } from "../parcelCard";
import { createFulfillmentSlice } from "../store/fulfillment.slice";
import { createFulfillmentRepository } from "../data/fulfillmentRepository";
import type { EditorState, FulfillmentSlice } from "../store/state";
import type { Box, FulfillmentRequest, OutboundBox, Product } from "../types";

/**
 * Найденная посылка у старшего и вскрытие отменённой (Кирилл 23.11).
 * Ломается обычно так: посылку не узнали по номеру заказа, вскрыли живую,
 * товар ушёл в чужую или стоящую на полке тару, товар появился или пропал.
 */
const P: Product = { id: "p1", name: "Кружка", partnerId: "pa" } as Product;
const req = (id: string, status: string, externalId?: string) =>
  ({ id, productId: "p1", qty: 2, status, externalId, source: "ozon" }) as FulfillmentRequest;
const parcel = (id: string, code: string, requestIds: string[], over: Partial<OutboundBox> = {}) =>
  ({
    id,
    code,
    requestIds,
    lines: [{ productId: "p1", qty: 2 }],
    packedBy: [],
    ...over,
  }) as OutboundBox;
const tote = (id: string, over: Partial<Box> = {}) =>
  ({ id, barcode: `UK-BOX-${id}`, createdAt: 1, lines: [], ...over }) as Box;

const data = {
  outboundBoxes: [
    parcel("o1", "UK-ORD-1", ["r1"]),
    parcel("o2", "UK-ORD-2", ["r2"]),
    parcel("o3", "UK-ORD-3", ["r3"], { shipmentId: "sh1" }),
  ],
  requests: [req("r1", "cancelled", "0123-1"), req("r2", "done", "0456-1"), req("r3", "shipped")],
  products: [P],
  partners: [{ id: "pa", name: "ИП Сидоров" }],
};

describe("parcelCard", () => {
  it("узнаёт посылку по ярлыку и по номеру заказа площадки", () => {
    expect(parcelCard("uk-ord-1", data)).toMatchObject({
      state: "cancelled",
      orders: ["0123-1"],
      sources: ["ozon"],
      sellers: ["ИП Сидоров"],
    });
    expect(parcelCard("0456-1", data)?.box.id).toBe("o2");
    expect(parcelCard("0456-1", data)?.state).toBe("waiting");
    expect(parcelCard("UK-ORD-3", data)?.state).toBe("shipped");
    expect(parcelCard("4601234567890", data)).toBeNull();
    expect(parcelCard("  ", data)).toBeNull();
  });
});

describe("openParcelCheck", () => {
  const boxes = [
    tote("t1"),
    tote("t2", { lines: [{ productId: "p1", qty: 1 }] }),
    tote("t3", { address: {} as Box["address"] }),
  ];
  it("вскрыть можно только отменённую и только в пустую свободную тару", () => {
    expect(openParcelCheck(parcelCard("UK-ORD-2", data), boxes, "UK-BOX-t1")).toEqual({
      ok: false,
      error: "parcel.open.notCancelled",
    });
    const gone = parcelCard("UK-ORD-1", data);
    expect(openParcelCheck(gone, boxes, "UK-BOX-t2")).toMatchObject({
      error: "parcel.open.toteBusy",
    });
    expect(openParcelCheck(gone, boxes, "UK-BOX-t3")).toMatchObject({
      error: "parcel.open.badTote",
    });
    expect(openParcelCheck(gone, boxes, "UK-BOX-nope")).toMatchObject({
      error: "parcel.open.badTote",
    });
    expect(openParcelCheck(gone, boxes, "uk-box-t1")).toMatchObject({ ok: true });
  });
});

describe("Вскрыть отменённую посылку в тару", () => {
  const slice = createFulfillmentSlice as unknown as StateCreator<
    EditorState,
    [],
    [],
    FulfillmentSlice
  >;
  const make = (over: Partial<EditorState> = {}) => {
    const store = create<EditorState>()(
      (...a) =>
        ({
          ...slice(...a),
          ...data,
          warehouse: { partners: data.partners },
          boxes: [tote("t1")],
          disputes: [],
          ...over,
        }) as unknown as EditorState,
    );
    const repo = createFulfillmentRepository({ get: store.getState, set: store.setState });
    return { store, repo };
  };
  const units = (s: EditorState) =>
    [...s.boxes, ...s.outboundBoxes.filter((b) => !b.shipmentId)].reduce(
      (n, b) => n + b.lines.reduce((m, l) => m + l.qty, 0),
      0,
    );

  it("товар уходит в тару целиком, посылка пропадает из отгрузки, штук столько же", async () => {
    const { store, repo } = make();
    const before = units(store.getState());
    const res = await repo.openParcel("UK-ORD-1", "UK-BOX-t1");
    expect(res.ok).toBe(true);
    const s = store.getState();
    expect(s.boxes[0].lines).toEqual([{ productId: "p1", qty: 2 }]);
    expect(s.outboundBoxes.map((b) => b.id)).toEqual(["o2", "o3"]);
    expect(units(s)).toBe(before);
  });

  it("второе нажатие и вторая вкладка — отказ, товар не удваивается", async () => {
    const { store, repo } = make();
    await repo.openParcel("UK-ORD-1", "UK-BOX-t1");
    expect((await repo.openParcel("UK-ORD-1", "UK-BOX-t1")).ok).toBe(false);
    expect(store.getState().boxes[0].lines).toEqual([{ productId: "p1", qty: 2 }]);
  });

  it("за столом на сервере не вскрывают: стол снимок не пишет", async () => {
    const { store, repo } = make({
      session: { source: "server" },
      stationSession: { staffId: "stf-olga" },
    } as unknown as Partial<EditorState>);
    expect(await repo.openParcel("UK-ORD-1", "UK-BOX-t1")).toEqual({
      ok: false,
      error: "parcel.open.cabinetOnly",
    });
    expect(store.getState().outboundBoxes).toHaveLength(3);
  });

  it("в посылке и живой заказ: обе заявки снова в таре неупакованными, живую пакуют заново", async () => {
    const mixed = parcel("o4", "UK-ORD-4", ["r1", "r2"], {
      lines: [{ productId: "p1", qty: 4 }],
    });
    const { store, repo } = make({
      outboundBoxes: [mixed],
      requests: [
        { ...req("r1", "cancelled"), packedAt: 5 },
        { ...req("r2", "done"), packedAt: 5 },
      ],
    } as Partial<EditorState>);
    expect(parcelCard("UK-ORD-4", { ...store.getState(), partners: [] })).toMatchObject({
      state: "cancelled",
      live: 1,
    });
    expect((await repo.openParcel("UK-ORD-4", "UK-BOX-t1")).ok).toBe(true);
    const s = store.getState();
    expect(s.outboundBoxes).toEqual([]);
    for (const r of s.requests) {
      expect(r.packedAt).toBeUndefined();
      expect(r.toteId).toBe("t1");
    }
  });
});
