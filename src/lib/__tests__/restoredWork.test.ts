import { describe, expect, it } from "vitest";
import { staffWorkload } from "../fulfillment";
import { operationLog } from "../operations";
import type { ReceivingEvent, Shipment } from "../types";

/**
 * Строки из загруженной резервной копии (`restored`) на сотрудника не
 * считаются: файл можно поправить руками, а выработку и оплату по нему —
 * нет («Безопасность» 27.11). Счёт продавцу при этом не меняется.
 */
const scan = (id: string, restored?: boolean): ReceivingEvent => ({
  id,
  productId: "p1",
  qty: 10,
  boxId: "b1",
  staffId: "s1",
  timestamp: 1000,
  ...(restored ? { restored } : {}),
});
const trip = (restored?: boolean): Shipment =>
  ({ id: "t1", requestIds: [], staffId: "s1", shippedAt: 2000, restored }) as unknown as Shipment;

describe("работа из копии", () => {
  it("выработка не считает сканы и рейсы из копии", () => {
    const w = staffWorkload([scan("r1"), scan("r2", true)], [trip(true)]);
    expect(w.get("s1")).toMatchObject({ receipts: 1, units: 10, trips: 0 });
  });

  it("журнал операций оставляет услугу, но без сотрудника", () => {
    const log = operationLog({
      tasks: [],
      pallets: [],
      boxes: [],
      receivingEvents: [scan("r1", true)],
      requests: [],
      shipments: [],
      products: [{ id: "p1", partnerId: "pt1" } as never],
    });
    const rcv = log.find((e) => e.id === "rcv:r1");
    expect(rcv).toMatchObject({ qty: 10, partnerId: "pt1" });
    expect(rcv?.staffId).toBeUndefined();
  });
});
