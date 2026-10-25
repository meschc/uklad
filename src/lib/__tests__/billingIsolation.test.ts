import { describe, expect, it } from "vitest";
import { operationLog, serviceReport, SERVICES } from "../operations";
import type {
  FulfillmentRequest,
  Product,
  ReceivingEvent,
  ServiceSettings,
  WarehouseTask,
} from "../types";

// Отчёт по услугам — основа счёта продавцу. Чужая операция в нём — это
// деньги, выставленные не тому человеку, поэтому изоляция проверяется так же,
// как изоляция товаров.

const prod = (id: string, partnerId?: string) => ({ id, partnerId }) as Product;
const rcv = (id: string, productId: string, qty: number) =>
  ({ id, productId, qty, timestamp: 100, staffId: "s1" }) as ReceivingEvent;
const req = (id: string, productId: string, qty: number) =>
  ({ id, productId, qty, status: "done", updatedAt: 100 }) as FulfillmentRequest;
const task = (id: string, partnerId: string | undefined, qty: number) =>
  ({ id, kind: "marking", qty, status: "done", doneAt: 100, partnerId }) as WarehouseTask;

const facts = {
  products: [prod("pa", "A"), prod("pb", "B"), prod("free")],
  receivingEvents: [rcv("r1", "pa", 5), rcv("r2", "pb", 7), rcv("r3", "free", 9)],
  requests: [req("q1", "pa", 2), req("q2", "pb", 3)],
  tasks: [task("t1", "A", 4), task("t2", "B", 6), task("t3", undefined, 8)],
  pallets: [],
  boxes: [],
  shipments: [],
};

const settings = {
  enabled: Object.fromEntries(SERVICES.map((s) => [s.kind, true])),
  prices: Object.fromEntries(SERVICES.map((s) => [s.kind, 10])),
} as unknown as ServiceSettings;

const report = (partnerId?: string) =>
  serviceReport(operationLog(facts), settings, { from: 0, to: 1000, partnerId });
const qtyOf = (r: ReturnType<typeof report>, kind: string) =>
  r.rows.find((x) => x.kind === kind)?.qty ?? 0;

describe("в счёт продавцу попадают только его операции", () => {
  it("продавец А не платит за приёмку, сборку и задания продавца Б", () => {
    const a = report("A");
    expect(qtyOf(a, "item_receiving")).toBe(5);
    expect(qtyOf(a, "picking")).toBe(2);
    expect(qtyOf(a, "marking")).toBe(4);
  });

  it("операции без продавца не уходят ни в чей счёт", () => {
    const a = report("A");
    const b = report("B");
    expect(qtyOf(a, "item_receiving") + qtyOf(b, "item_receiving")).toBe(12);
    expect(qtyOf(a, "marking") + qtyOf(b, "marking")).toBe(10);
  });

  it("сумма счетов продавцов не больше общего отчёта склада", () => {
    expect(report("A").total + report("B").total).toBeLessThanOrEqual(report().total);
  });

  it("неизвестный продавец получает пустой отчёт, а не общий", () => {
    const x = report("nobody");
    expect(x.rows).toEqual([]);
    expect(x.total).toBe(0);
  });
});
