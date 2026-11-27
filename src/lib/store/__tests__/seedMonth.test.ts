import { describe, expect, it } from "vitest";
import { seedProducts, seedWarehouse } from "../seed";
import { seedHistory } from "../seedHistory";
import { seedMonth } from "../seedMonth";
import { autoPlace } from "../../autoPlace";
import { addressKey } from "../../address";
import { allCells, buildOccupancy } from "../../placement";

/**
 * Месяц работы демо-склада (Кирилл 27.11): склад занят на 60–70%, рейсы
 * каждый будний день, и учёт сходится — пришло = в коробах + уехало.
 */
describe("посев: месяц работы демо-склада", () => {
  const now = Date.UTC(2026, 10, 27, 9);
  const warehouse = seedWarehouse();
  const products = seedProducts();
  const placements = autoPlace(warehouse, products, {});
  const history = seedHistory(warehouse, products, placements, now);
  const month = seedMonth(
    warehouse,
    products,
    { boxes: history.boxes, boxSeq: history.boxSeq, placements },
    now,
  );

  it("склад занят на 60–70%", () => {
    const occ = buildOccupancy(placements, [...history.boxes, ...month.boxes]);
    const fill = Object.keys(occ).length / allCells(warehouse).length;
    expect(fill).toBeGreaterThanOrEqual(0.6);
    expect(fill).toBeLessThanOrEqual(0.7);
  });

  it("новые короба стоят только на свободных ячейках, по одному", () => {
    const taken = new Set(
      [...Object.values(placements), ...history.boxes.flatMap((b) => b.address ?? [])].map(
        addressKey,
      ),
    );
    const keys = month.boxes.map((b) => addressKey(b.address!));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => taken.has(k))).toEqual([]);
  });

  it("пришло = в коробах + уехало, короб не пустеет", () => {
    const sum = (xs: { productId: string; qty: number }[]) => {
      const m = new Map<string, number>();
      for (const x of xs) m.set(x.productId, (m.get(x.productId) ?? 0) + x.qty);
      return m;
    };
    const came = sum(month.receivingEvents);
    const left = sum(month.boxes.map((b) => b.lines[0]));
    const gone = sum(month.requests.map((r) => ({ productId: r.productId, qty: r.pickedQty! })));
    for (const [p, n] of came) expect(n, p).toBe((left.get(p) ?? 0) + (gone.get(p) ?? 0));
    expect(month.boxes.every((b) => b.lines[0].qty >= 1)).toBe(true);
  });

  it("рейсы каждый будний день месяца, по выходным склад стоит", () => {
    const days = new Set(month.shipments.map((s) => new Date(s.shippedAt).toDateString()));
    expect(days.size).toBeGreaterThanOrEqual(18);
    expect(month.shipments.every((s) => ![0, 6].includes(new Date(s.shippedAt).getDay()))).toBe(
      true,
    );
    // Каждая заявка рейса — в его списке, ничего не потерялось.
    const listed = new Set(month.shipments.flatMap((s) => s.requestIds));
    expect(month.requests.every((r) => listed.has(r.id))).toBe(true);
  });
});
