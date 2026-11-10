import { describe, expect, it } from "vitest";
import { isServiceOn, operationLog, serviceReport, taskKinds } from "../operations";
import type { OperationFacts } from "../operations";
import type { ServiceSettings } from "../types";
import { makeProduct } from "./fixtures";

/**
 * Учёт услуг. Ошибка здесь не видна глазом: неверный отчёт выглядит как
 * обычный и всплывает только в споре с продавцом о счёте.
 */

const A = makeProduct({ id: "p-a", partnerId: "seller-a" });
const B = makeProduct({ id: "p-b", partnerId: "seller-b" });

function facts(over: Partial<OperationFacts> = {}): OperationFacts {
  return {
    tasks: [],
    pallets: [],
    boxes: [],
    receivingEvents: [],
    requests: [],
    shipments: [],
    products: [A, B],
    ...over,
  };
}

const SETTINGS: ServiceSettings = { enabled: {}, prices: {} };
const ALL = { from: 0, to: Number.MAX_SAFE_INTEGER };

describe("operationLog", () => {
  it("собирает приёмку по штукам и продавцу товара", () => {
    const log = operationLog(
      facts({
        receivingEvents: [
          { id: "e1", productId: "p-a", qty: 5, boxId: "b1", timestamp: 10, staffId: "s1" },
          { id: "e2", productId: "p-b", qty: 2, boxId: "b1", timestamp: 20 },
        ],
      }),
    );
    expect(log.map((e) => [e.kind, e.qty, e.partnerId])).toEqual([
      ["item_receiving", 2, "seller-b"],
      ["item_receiving", 5, "seller-a"],
    ]);
  });

  it("сборку считает по собранному, а не по заказанному, и пропускает новую", () => {
    const base = { productId: "p-a", createdAt: 1, updatedAt: 5 };
    const log = operationLog(
      facts({
        requests: [
          { ...base, id: "r1", qty: 10, pickedQty: 7, status: "done", partial: true },
          { ...base, id: "r2", qty: 3, status: "new" },
          { ...base, id: "r3", qty: 4, status: "shipped" },
        ],
      }),
    );
    expect(
      log
        .filter((e) => e.kind === "picking")
        .map((e) => e.qty)
        .sort(),
    ).toEqual([4, 7]);
  });

  it("берёт только закрытые задания и датирует их закрытием", () => {
    const log = operationLog(
      facts({
        tasks: [
          { id: "t1", kind: "marking", status: "done", qty: 30, createdAt: 1, doneAt: 50 },
          { id: "t2", kind: "marking", status: "in_progress", qty: 99, createdAt: 1 },
          { id: "t3", kind: "packing", status: "cancelled", qty: 5, createdAt: 1 },
        ],
      }),
    );
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ kind: "marking", qty: 30, at: 50, source: "task" });
  });
});

describe("принятые места", () => {
  it("тара с ярлыком, напечатанным заранее, услугой не считается", () => {
    const log = operationLog(
      facts({
        pallets: [{ id: "pl", barcode: "x", createdAt: 1, boxIds: ["empty"] }],
        boxes: [{ id: "empty", barcode: "UK-BOX-1", createdAt: 1, lines: [] }],
      }),
    );
    expect(log).toEqual([]);
  });

  it("короб считается принятым в день приёмки и за продавцом принятого, даже когда уже пуст", () => {
    const log = operationLog(
      facts({
        boxes: [{ id: "b", barcode: "UK-BOX-2", createdAt: 1, lines: [] }],
        receivingEvents: [{ id: "e", productId: "p-a", qty: 2, boxId: "b", timestamp: 500 }],
      }),
    );
    const box = log.find((e) => e.kind === "cargo_box");
    expect(box?.at).toBe(500);
    expect(box?.partnerId).toBe(log.find((e) => e.kind === "item_receiving")?.partnerId);
  });
});

describe("serviceReport", () => {
  const log = operationLog(
    facts({
      pallets: [{ id: "pl", barcode: "x", createdAt: 100, boxIds: [], shipmentId: "sh" }],
      receivingEvents: [
        { id: "e1", productId: "p-a", qty: 5, boxId: "b", timestamp: 100 },
        { id: "e2", productId: "p-b", qty: 3, boxId: "b", timestamp: 200 },
      ],
      tasks: [{ id: "t", kind: "photo", status: "done", qty: 4, createdAt: 1, doneAt: 100 }],
    }),
  );

  it("умножает количество на цену и складывает итог", () => {
    const r = serviceReport(
      log,
      { enabled: {}, prices: { item_receiving: 2.5, cargo_pallet: 100 } },
      ALL,
    );
    expect(r.rows.map((x) => [x.kind, x.qty, x.sum])).toEqual([
      ["cargo_pallet", 1, 100],
      ["item_receiving", 8, 20],
    ]);
    expect(r.total).toBe(120);
    expect(r.unpriced).toBe(false);
  });

  it("без цены — сумма пустая, а не ноль, и итог помечен неполным", () => {
    const r = serviceReport(log, SETTINGS, ALL);
    expect(r.rows.every((x) => x.sum === null)).toBe(true);
    expect(r.unpriced).toBe(true);
    expect(r.total).toBe(0);
  });

  it("выключенную услугу не выставляет, даже если факт был", () => {
    // Фотофиксация по умолчанию выключена — задание есть, а в счёт оно не идёт.
    expect(serviceReport(log, SETTINGS, ALL).rows.some((x) => x.kind === "photo")).toBe(false);
    const on = serviceReport(log, { enabled: { photo: true }, prices: {} }, ALL);
    expect(on.rows.find((x) => x.kind === "photo")?.qty).toBe(4);
  });

  it("режет по периоду и продавцу", () => {
    const r = serviceReport(log, SETTINGS, { from: 150, to: 300, partnerId: "seller-b" });
    expect(r.rows.map((x) => [x.kind, x.qty])).toEqual([["item_receiving", 3]]);
  });
});

describe("настройка услуг", () => {
  it("явная настройка сильнее значения по умолчанию", () => {
    expect(isServiceOn(SETTINGS, "marking")).toBe(true);
    expect(isServiceOn({ enabled: { marking: false }, prices: {} }, "marking")).toBe(false);
  });

  it("в задания попадают только включённые и не автоматические", () => {
    const kinds = taskKinds(SETTINGS);
    expect(kinds).toContain("packing");
    expect(kinds).not.toContain("picking");
    expect(kinds).not.toContain("photo");
  });
});

describe("serviceSettings при загрузке", () => {
  it("битая настройка выбрасывается, целая остаётся", async () => {
    const { sanitizeDomains } = await import("../data/sanitize");
    expect("serviceSettings" in sanitizeDomains({ serviceSettings: "x" })).toBe(false);
    const ok = { enabled: { marking: true }, prices: {} };
    expect(sanitizeDomains({ serviceSettings: ok }).serviceSettings).toEqual(ok);
  });
});

describe("дата сборки", () => {
  it("услуга сборки датируется сборкой, а не упаковкой или погрузкой", () => {
    const log = operationLog(
      facts({
        requests: [
          {
            id: "r",
            productId: "p-a",
            qty: 2,
            pickedQty: 2,
            status: "shipped",
            createdAt: 1,
            pickedAt: 100,
            updatedAt: 900,
          },
        ],
      }),
    );
    expect(log.find((e) => e.kind === "picking")?.at).toBe(100);
  });
});

describe("рейс нескольких продавцов", () => {
  const base = { createdAt: 1, updatedAt: 5, status: "shipped" as const };
  const trip = { id: "t", destination: "ПВЗ", requestIds: ["r1", "r2"], shippedAt: 50 };

  it("делится по штукам, а не уходит первому продавцу", () => {
    const log = operationLog(
      facts({
        requests: [
          { ...base, id: "r1", productId: "p-a", qty: 6 },
          { ...base, id: "r2", productId: "p-b", qty: 4 },
        ],
        shipments: [trip],
      }),
    );
    const loading = log.filter((e) => e.kind === "loading");
    expect(loading.map((e) => [e.partnerId, e.qty])).toEqual([
      ["seller-a", 0.6],
      ["seller-b", 0.4],
    ]);
    const prices = { ...SETTINGS, prices: { loading: 1000 } };
    expect(serviceReport(log, prices, { ...ALL, partnerId: "seller-a" }).total).toBe(600);
    expect(serviceReport(log, prices, ALL).rows.find((r) => r.kind === "loading")?.qty).toBe(1);
  });

  it("рейс одного продавца — целиком ему", () => {
    const log = operationLog(
      facts({
        requests: [
          { ...base, id: "r1", productId: "p-a", qty: 6 },
          { ...base, id: "r2", productId: "p-a", qty: 4 },
        ],
        shipments: [trip],
      }),
    );
    expect(log.filter((e) => e.kind === "loading").map((e) => [e.id, e.partnerId, e.qty])).toEqual([
      ["trip:t", "seller-a", 1],
    ]);
  });
});
