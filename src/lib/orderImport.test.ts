import { describe, expect, it } from "vitest";
import { planOrderImport, productsOfConnection } from "./orderImport";
import type { ExternalOrder } from "./connectors/types";
import type { FulfillmentRequest, Product } from "./types";

const product = (id: string, sku: string, barcode = ""): Product => ({
  id,
  sku,
  barcode,
  name: id,
  category: "x",
  widthCm: 1,
  heightCm: 1,
  depthCm: 1,
});

const order = (externalId: string, ...lines: [string, number][]): ExternalOrder => ({
  system: "ozon",
  externalId,
  createdAt: "2026-11-18T10:00:00Z",
  lines: lines.map(([vendorCode, qty]) => ({
    externalSku: "1",
    vendorCode,
    qty,
    requiresMarks: false,
  })),
});

const products = [product("p1", "PEN-1", "4600001"), product("p2", "NOTE-2")];

describe("planOrderImport", () => {
  it("заказ из двух товаров — две заявки с одним номером", () => {
    const plan = planOrderImport([order("0001-1", ["pen-1", 3], ["NOTE-2", 1])], products, []);
    expect(plan.orders).toBe(1);
    expect(plan.items).toEqual([
      { productId: "p1", qty: 3, source: "ozon", externalId: "0001-1" },
      { productId: "p2", qty: 1, source: "ozon", externalId: "0001-1" },
    ]);
  });

  it("товар узнаётся и по штрихкоду", () => {
    const o = order("0002-1");
    o.lines = [{ externalSku: "9", barcode: "4600001", qty: 1, requiresMarks: false }];
    expect(planOrderImport([o], products, []).items[0]?.productId).toBe("p1");
  });

  it("неизвестный товар — заказ целиком в «не найден», без половины", () => {
    const plan = planOrderImport([order("0003-1", ["PEN-1", 1], ["NOPE", 1])], products, []);
    expect(plan.items).toEqual([]);
    expect(plan.unknown).toEqual(["0003-1"]);
  });

  it("один артикул у двух товаров — не угадываем", () => {
    const twins = [...products, product("p3", "PEN-1")];
    expect(planOrderImport([order("0004-1", ["PEN-1", 1])], twins, []).unknown).toEqual(["0004-1"]);
  });

  it("уже заведённый номер, даже отменённый, второй раз не заводится", () => {
    const old = {
      id: "r1",
      productId: "p1",
      qty: 1,
      source: "ozon",
      externalId: "0005-1",
      status: "cancelled",
      createdAt: 1,
      updatedAt: 1,
    } as FulfillmentRequest;
    expect(planOrderImport([order("0005-1", ["PEN-1", 1])], products, [old]).orders).toBe(0);
    // Повтор внутри одного ответа площадки — тоже один раз.
    const twice = planOrderImport(
      [order("0006-1", ["PEN-1", 1]), order("0006-1", ["PEN-1", 1])],
      products,
      [],
    );
    expect(twice.orders).toBe(1);
  });

  it("магазин партнёра ищет только среди его товаров, «свой товар» — среди ничьих", () => {
    const a = { ...product("a", "PEN-1"), partnerId: "pa" };
    const b = { ...product("b", "PEN-1"), partnerId: "pb" };
    const own = product("o", "PEN-1");
    const all = [a, b, own];
    const pick = (pid: string | null) =>
      planOrderImport([order("0007-1", ["PEN-1", 1])], productsOfConnection(all, pid), []).items[0]
        ?.productId;
    expect(pick("pa")).toBe("a");
    expect(pick("pb")).toBe("b");
    expect(pick(null)).toBe("o");
  });
});
