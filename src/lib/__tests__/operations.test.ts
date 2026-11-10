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

describe("отгрузка местами", () => {
  const base = { createdAt: 1, updatedAt: 5, status: "shipped" as const };
  const ship = (over: Record<string, unknown> = {}) => ({
    id: "t",
    destination: "ПВЗ",
    requestIds: ["r1", "r2", "r3"],
    shippedAt: 50,
    ...over,
  });
  const kinds = (log: ReturnType<typeof operationLog>) =>
    log
      .filter((e) => e.kind.startsWith("ship_"))
      .map((e) => [e.kind, e.partnerId])
      .sort();

  it("заказ площадки — одна посылка, сколько бы в нём ни было строк и штук", () => {
    const log = operationLog(
      facts({
        requests: [
          { ...base, id: "r1", productId: "p-a", qty: 1, source: "ozon", externalId: "Z-1" },
          { ...base, id: "r2", productId: "p-a", qty: 5, source: "ozon", externalId: "z-1" },
          { ...base, id: "r3", productId: "p-b", qty: 1, source: "wildberries", externalId: "W-9" },
        ],
        outboundBoxes: [
          {
            id: "ob",
            code: "UK-OUT-1",
            lines: [{ productId: "p-a", qty: 6 }],
            requestIds: ["r1", "r2", "r3"],
            packedBy: [],
            createdAt: 1,
            updatedAt: 1,
            shipmentId: "t",
          },
        ],
        shipments: [ship({ units: ["UK-OUT-1"] })],
      }),
    );
    expect(kinds(log)).toEqual([
      ["ship_parcel", "seller-a"],
      ["ship_parcel", "seller-b"],
    ]);
  });

  it("короб и паллета поставки — местами, продавец по составу", () => {
    const log = operationLog(
      facts({
        boxes: [
          { id: "b1", barcode: "UK-BOX-7", createdAt: 1, lines: [{ productId: "p-b", qty: 3 }] },
        ],
        pallets: [{ id: "pl", barcode: "UK-PLT-2", createdAt: 1, boxIds: ["b1"] }],
        requests: [
          { ...base, id: "r1", productId: "p-a", qty: 6 },
          { ...base, id: "r2", productId: "p-b", qty: 4 },
        ],
        shipments: [
          ship({ requestIds: ["r1", "r2"], units: ["UK-BOX-7", "uk-plt-2", "UK-BOX-99"] }),
        ],
      }),
    );
    expect(kinds(log)).toEqual(
      [
        ["ship_box", "seller-b"],
        // неизвестный короб в машине двух продавцов — без продавца, а не первому
        ["ship_box", undefined],
        ["ship_pallet", "seller-b"],
      ].sort(),
    );
  });

  it("рейс — расход склада: без продавца и по умолчанию не в счёте", () => {
    const log = operationLog(
      facts({
        requests: [{ ...base, id: "r1", productId: "p-a", qty: 6 }],
        shipments: [ship({ requestIds: ["r1"], units: ["UK-BOX-5"] })],
      }),
    );
    expect(log.find((e) => e.kind === "loading")?.partnerId).toBeUndefined();
    expect(log.find((e) => e.kind === "ship_box")?.partnerId).toBe("seller-a");
    const report = serviceReport(log, SETTINGS, ALL);
    expect(report.rows.map((r) => r.kind)).not.toContain("loading");
    expect(report.rows.map((r) => r.kind)).toContain("ship_box");
  });
});
