import { describe, expect, it } from "vitest";
import { taskQueue, type QueueInput } from "../taskQueue";
import type { Box, FulfillmentRequest, OutboundBox } from "../types";

const DAY = 24 * 3600 * 1000;
const NOW = 100 * DAY;

const req = (over: Partial<FulfillmentRequest>): FulfillmentRequest => ({
  id: "r",
  productId: "p1",
  qty: 1,
  status: "new",
  createdAt: NOW - DAY,
  updatedAt: NOW - DAY,
  ...over,
});

const empty: QueueInput = {
  expectedShipments: [],
  requests: [],
  boxes: [],
  outboundBoxes: [],
  tasks: [],
  disputes: [],
};

const groupOf = (input: Partial<QueueInput>, process: string) =>
  taskQueue({ ...empty, ...input }, NOW).find((g) => g.process === process);

describe("taskQueue", () => {
  it("пустой склад — пустая очередь, процессов без работы нет", () => {
    expect(taskQueue(empty, NOW)).toEqual([]);
  });

  it("приёмка: открытые поставки, остаток штук и кто принимает", () => {
    const g = groupOf(
      {
        expectedShipments: [
          {
            id: "s1",
            source: "manual",
            title: "Ромашка",
            createdAt: NOW - 2 * DAY,
            status: "receiving",
            lines: [{ id: "l", productId: "p1", expectedQty: 10, receivedQty: 4 }],
          },
          { id: "s2", source: "manual", createdAt: NOW, status: "closed", lines: [] },
        ],
        receiving: { shipmentId: "s1", staffId: "st1" },
      },
      "receiving",
    );
    expect(g?.items).toEqual([
      { key: "s1", label: "Ромашка", units: 6, since: NOW - 2 * DAY, active: true, staffId: "st1" },
    ]);
  });

  it("заявка проходит процессы по одному разу: сборка → упаковка → отгрузка", () => {
    const tote: Box = { id: "b1", barcode: "UK-BOX-1", createdAt: 0, lines: [] };
    const at = (r: FulfillmentRequest) =>
      taskQueue({ ...empty, requests: [r], boxes: [tote] }, NOW).map((g) => g.process);
    const r = req({ id: "r1", note: "Тула" });
    expect(at(r)).toEqual(["picking"]);
    expect(at({ ...r, status: "done", toteId: "b1", pickedAt: NOW })).toEqual(["packing"]);
    expect(at({ ...r, status: "done", packedAt: NOW })).toEqual(["shipping"]);
    expect(at({ ...r, status: "shipped" })).toEqual([]);
    expect(at({ ...r, status: "cancelled" })).toEqual([]);
  });

  it("сборка: со сроком отгрузки — первой, хоть и заведена позже", () => {
    const g = groupOf(
      {
        requests: [
          req({ id: "old", note: "Склад А", createdAt: NOW - 5 * DAY }),
          req({ id: "late", note: "Склад Б", truckDate: NOW + 2 * DAY }),
          req({ id: "soon", note: "Склад В", truckDate: NOW + DAY }),
        ],
      },
      "picking",
    );
    expect(g?.items.map((i) => i.label)).toEqual(["Склад В", "Склад Б", "Склад А"]);
  });

  it("упаковка — по таре: код тары и собранные штуки, частичная — сколько собрали", () => {
    const tote: Box = { id: "b1", barcode: "UK-BOX-1", createdAt: 0, lines: [] };
    const g = groupOf(
      {
        boxes: [tote],
        requests: [
          req({ id: "a", status: "done", toteId: "b1", qty: 3 }),
          req({ id: "b", status: "done", toteId: "b1", qty: 5, partial: true, pickedQty: 2 }),
        ],
      },
      "packing",
    );
    expect(g?.items).toHaveLength(1);
    expect(g?.items[0]).toMatchObject({ label: "UK-BOX-1", units: 5 });
  });

  it("посылка без места сортировки ждёт сортировку, а не машину", () => {
    const r = req({ id: "r1", status: "done", packedAt: NOW, note: "Казань" });
    const parcel: OutboundBox = {
      id: "o1",
      code: "OZ-1",
      lines: [{ productId: "p1", qty: 1 }],
      requestIds: ["r1"],
      packedBy: [],
      createdAt: NOW - 3600_000,
      updatedAt: NOW,
    };
    const unsortedQueue = taskQueue({ ...empty, requests: [r], outboundBoxes: [parcel] }, NOW);
    expect(unsortedQueue.map((g) => g.process)).toEqual(["sorting"]);
    expect(unsortedQueue[0].items[0]).toMatchObject({ label: "Казань", units: 1 });

    const sorted = { ...parcel, sortCode: "UK-SORT-AB-1" };
    expect(
      taskQueue({ ...empty, requests: [r], outboundBoxes: [sorted] }, NOW).map((g) => g.process),
    ).toEqual(["shipping"]);
  });

  it("пересчёт — давно не считанная тара на полке; запечатанная и свежая не в очереди", () => {
    const addr = { floorId: "f", moduleId: "m", shelfIndex: 0, cellIndex: 0 };
    const g = groupOf(
      {
        boxes: [
          {
            id: "old",
            barcode: "UK-BOX-2",
            createdAt: 0,
            lines: [{ productId: "p1", qty: 4 }],
            address: addr,
          },
          {
            id: "fresh",
            barcode: "UK-BOX-3",
            createdAt: 0,
            lines: [],
            address: addr,
            countedAt: NOW - DAY,
          },
          {
            id: "sealed",
            barcode: "UK-BOX-4",
            createdAt: 0,
            lines: [],
            address: addr,
            sealed: true,
          },
        ] as Box[],
      },
      "inventory",
    );
    expect(g?.items.map((i) => i.key)).toEqual(["old"]);
    expect(g?.items[0].units).toBe(4);
  });

  it("работы и подтверждения — открытые, сначала самые давние", () => {
    const q = taskQueue(
      {
        ...empty,
        tasks: [
          { id: "t2", kind: "marking", status: "open", qty: 5, createdAt: NOW - DAY },
          {
            id: "t1",
            kind: "repacking",
            status: "in_progress",
            qty: 1,
            staffId: "st",
            createdAt: NOW - 2 * DAY,
          },
          { id: "t3", kind: "photo", status: "done", qty: 1, createdAt: 0 },
        ],
        disputes: [
          { id: "d1", kind: "shortage", qty: 1, raisedBy: "st", raisedAt: NOW },
          { id: "d2", kind: "extra", qty: 1, raisedBy: "st", raisedAt: 0, resolvedAt: 1 },
        ],
      },
      NOW,
    );
    expect(q.map((g) => g.process)).toEqual(["work", "approvals"]);
    expect(q[0].items.map((i) => [i.key, i.active, i.staffId])).toEqual([
      ["t1", true, "st"],
      ["t2", false, undefined],
    ]);
    expect(q[1].items.map((i) => i.key)).toEqual(["d1"]);
  });
});
