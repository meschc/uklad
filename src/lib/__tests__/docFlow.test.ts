import { describe, expect, it } from "vitest";
import { create, type StateCreator } from "zustand";
import { createDocsSlice } from "../store/docs.slice";
import type { DocsSlice, EditorState } from "../store/state";
import { discrepancyDoc, docEntries, resolveDoc, type DocSources } from "../docFlow";
import type { ExpectedShipment, FulfillmentRequest, Product, Shipment, Warehouse } from "../types";

const products = [
  { id: "p1", sku: "A-1", name: "Кружка" },
  { id: "p2", sku: "A-2", name: "Ложка" },
] as Product[];

const closed: ExpectedShipment = {
  id: "exp1",
  source: "manual",
  title: "Поставка Ромашки",
  status: "closed",
  createdAt: 1,
  closedAt: 2,
  lines: [
    { id: "l1", productId: "p1", expectedQty: 10, receivedQty: 8 },
    { id: "l2", productId: "p2", expectedQty: 5, receivedQty: 5 },
  ],
} as ExpectedShipment;

const open = { ...closed, id: "exp2", status: "receiving", closedAt: undefined };

const req = {
  id: "r1",
  productId: "p1",
  qty: 3,
  pickedQty: 3,
  status: "shipped",
} as FulfillmentRequest;
const trip: Shipment = { id: "tr1", destination: "Склад WB", requestIds: ["r1"], shippedAt: 3 };

const src: DocSources = {
  warehouse: {
    id: "w1",
    name: "Склад",
    staff: [
      { id: "s1", name: "Кладовщик", role: "Кладовщик" },
      { id: "s2", name: "Старшая", role: "Старший кладовщик" },
    ],
  } as unknown as Warehouse,
  products,
  requests: [req],
  shipments: [trip],
  expectedShipments: [closed, open as ExpectedShipment],
  receivingEvents: [],
  boxes: [],
};

function stand() {
  const slice = createDocsSlice as unknown as StateCreator<EditorState, [], [], DocsSlice>;
  const store = create<EditorState>()(
    (...a) => ({ ...slice(...a), ...src, goToView: () => {} }) as unknown as EditorState,
  );
  return () => store.getState();
}

describe("документы из операций", () => {
  it("документ есть у закрытой поставки и у рейса, у открытой поставки — нет", () => {
    const list = docEntries(src, []);
    expect(list.map((e) => `${e.kind}:${e.sourceId}`).sort()).toEqual([
      "receiving:exp1",
      "shipment:tr1",
    ]);
    expect(list.every((e) => e.status === "draft")).toBe(true);
  });

  it("акт расхождений берёт только несошедшиеся строки", () => {
    const sheet = resolveDoc("receiving", "exp1", src)!;
    const act = discrepancyDoc(sheet, "exp1")!;
    expect(act.lines).toHaveLength(1);
    expect(act.lines[0]).toMatchObject({ no: 1, qty: 10, fact: 8 });
    expect(act.number.startsWith("АР-")).toBe(true);
  });

  it("пересчитали на рампе и сошлось — акта нет", () => {
    const s = stand();
    expect(s().saveDocDraft("receiving", "exp1", { facts: { "1": 10 } })).toBe(true);
    const sheet = resolveDoc("receiving", "exp1", src, s().docRecords[0])!;
    expect(sheet.totalFact).toBe(15);
    expect(discrepancyDoc(sheet, "exp1")).toBeNull();
  });

  it("подтверждает только старший, после подтверждения документ закрыт", () => {
    const s = stand();
    s().saveDocDraft("shipment", "tr1", { vehicle: "А123ВС", seals: "0042" });
    expect(s().confirmDoc("shipment", "tr1", "s1")).toBe("notSenior");
    expect(s().confirmDoc("shipment", "tr1", "s2")).toBe("ok");
    expect(s().confirmDoc("shipment", "tr1", "s2")).toBe("locked");
    expect(s().saveDocDraft("shipment", "tr1", { vehicle: "другая" })).toBe(false);
    const rec = s().docRecords[0];
    expect(rec).toMatchObject({ status: "confirmed", confirmedBy: "s2" });
    expect(rec.snapshot).toMatchObject({ vehicle: "А123ВС", seals: "0042" });
  });

  it("подтверждённый документ — снимок: правка заявки его не меняет", () => {
    const s = stand();
    s().confirmDoc("shipment", "tr1", "s2");
    const changed = { ...src, requests: [{ ...req, pickedQty: 1 }] };
    const doc = resolveDoc("shipment", "tr1", changed, s().docRecords[0])!;
    expect(doc.lines[0].fact).toBe(3);
  });
});
