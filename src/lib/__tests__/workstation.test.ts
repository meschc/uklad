import { describe, expect, it } from "vitest";
import {
  SESSION_TTL_MS,
  badgeCode,
  checkPackScan,
  earnings,
  isPackComplete,
  isSessionLive,
  packQueue,
  parseBadge,
  shiftState,
  workedMs,
} from "../workstation";
import type { FulfillmentRequest, Product, StaffEvent } from "../types";

const H = 3_600_000;
let n = 0;
const ev = (type: StaffEvent["type"], at: number, staffId = "s1"): StaffEvent => ({
  id: `e${n++}`,
  staffId,
  type,
  at,
});
const req = (p: Partial<FulfillmentRequest> & { id: string }): FulfillmentRequest => ({
  productId: "p1",
  qty: 1,
  status: "done",
  createdAt: 0,
  updatedAt: 0,
  ...p,
});
const prod = (id: string, barcode: string, sku: string) =>
  ({ id, barcode, sku, name: id }) as Product;

describe("бейдж и вход", () => {
  it("код бейджа разбирается обратно в id, чужие коды — нет", () => {
    expect(parseBadge(badgeCode("staff_42"))).toBe("staff_42");
    expect(parseBadge("uk-stf-staff_42")).toBe("staff_42");
    expect(parseBadge("UK-BOX-0001")).toBeNull();
    expect(parseBadge("UK-STF-")).toBeNull();
  });

  it("вход живёт 12 часов", () => {
    const s = { staffId: "s1", station: "pack" as const, startedAt: 0, expiresAt: SESSION_TTL_MS };
    expect(isSessionLive(s, SESSION_TTL_MS - 1)).toBe(true);
    expect(isSessionLive(s, SESSION_TTL_MS)).toBe(false);
    expect(isSessionLive(null, 0)).toBe(false);
  });
});

describe("смена и часы", () => {
  it("перерыв не считается работой", () => {
    const events = [
      ev("shift_start", 0),
      ev("break_start", 2 * H),
      ev("break_end", 3 * H),
      ev("shift_end", 8 * H),
    ];
    expect(workedMs(events, "s1", 0, 24 * H)).toBe(7 * H);
    expect(shiftState(events, "s1")).toBe("off");
  });

  it("смену закрыли прямо с перерыва — перерыв всё равно не засчитан", () => {
    const events = [ev("shift_start", 0), ev("break_start", 4 * H), ev("shift_end", 5 * H)];
    expect(workedMs(events, "s1", 0, 24 * H)).toBe(4 * H);
  });

  it("открытая смена считается до «сейчас» и режется окном", () => {
    const events = [ev("shift_start", 22 * H)];
    expect(shiftState(events, "s1")).toBe("on");
    // Ночная смена: в «сегодня», начавшееся в полночь, идёт только своя часть.
    expect(workedMs(events, "s1", 24 * H, 26 * H)).toBe(2 * H);
  });

  it("чужие отметки и сканы в часы не входят", () => {
    const events = [ev("shift_start", 0, "s2"), ev("pack_done", H), ev("shift_start", 2 * H)];
    expect(workedMs(events, "s1", 0, 3 * H)).toBe(H);
  });

  it("без ставки заработок не ноль, а «не задан»", () => {
    expect(earnings(7.5 * H, 400)).toBe(3000);
    expect(earnings(H, undefined)).toBeNull();
  });
});

describe("упаковка", () => {
  const products = [
    prod("p1", "4600000000017", "A-1"),
    prod("p2", "4600000000024", "A-2"),
    prod("p3", "4600000000031", "A-3"),
  ];

  it("в очередь идут собранные и не упакованные, сложенные по назначению", () => {
    const q = packQueue([
      req({ id: "r1", note: "Коледино", qty: 2 }),
      req({ id: "r2", note: "Коледино", productId: "p2" }),
      req({ id: "r3", note: "Подольск", packedAt: 1 }),
      req({ id: "r4", status: "in_progress" }),
      req({ id: "r5", note: "Тула", qty: 5, pickedQty: 3, partial: true }),
    ]);
    expect(q.map((o) => [o.target, o.units])).toEqual([
      ["Коледино", 3],
      ["Тула", 3],
    ]);
  });

  it("скан сверяется с заказом поштучно", () => {
    const [order] = packQueue([req({ id: "r1", qty: 1 })]);
    const packed = new Map<string, number>();
    expect(checkPackScan(order, packed, products, "4600000000017").kind).toBe("ok");
    expect(checkPackScan(order, packed, products, "A-2").kind).toBe("wrong");
    expect(checkPackScan(order, packed, products, "000").kind).toBe("unknown");
    packed.set("p1", 1);
    expect(checkPackScan(order, packed, products, "A-1").kind).toBe("extra");
    expect(isPackComplete(order, packed)).toBe(true);
  });
});
