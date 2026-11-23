import { describe, expect, it } from "vitest";
import { chipCount, filterRows, taskListRows } from "../taskList";
import type { FulfillmentRequest, WarehouseTask } from "../types";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 23, 12).getTime();

const req = (over: Partial<FulfillmentRequest>): FulfillmentRequest =>
  ({
    id: "r" + Math.random(),
    productId: "p1",
    qty: 2,
    status: "new",
    note: "Ozon Тверь",
    createdAt: NOW - DAY,
    updatedAt: NOW - DAY,
    ...over,
  }) as FulfillmentRequest;

const work = (over: Partial<WarehouseTask>): WarehouseTask =>
  ({
    id: "w" + Math.random(),
    kind: "labeling",
    qty: 5,
    status: "open",
    createdAt: NOW - DAY,
    ...over,
  }) as WarehouseTask;

const input = (requests: FulfillmentRequest[], tasks: WarehouseTask[]) => ({
  expectedShipments: [],
  requests,
  boxes: [],
  outboundBoxes: [],
  tasks,
  disputes: [],
});

describe("единый список заданий", () => {
  it("открытая сборка и открытая работа склада — в одной таблице", () => {
    const rows = taskListRows(input([req({})], [work({})]), NOW);
    expect(rows.map((r) => r.process).sort()).toEqual(["picking", "work"]);
    expect(rows.every((r) => r.status !== "done")).toBe(true);
  });

  it("завершённое уходит в «завершённые», а не в «открытые»", () => {
    const rows = taskListRows(
      input(
        [req({ status: "shipped", note: "WB" })],
        [work({ status: "done", doneAt: NOW }), work({ status: "cancelled" })],
      ),
      NOW,
    );
    expect(filterRows(rows, "open", NOW)).toHaveLength(0);
    expect(filterRows(rows, "done", NOW)).toHaveLength(3);
    expect(rows.filter((r) => r.cancelled)).toHaveLength(1);
  });

  it("ключи строк уникальны: открытая и завершённая сборка одного назначения", () => {
    const rows = taskListRows(
      input([req({ note: "WB" }), req({ note: "WB", status: "shipped" })], []),
      NOW,
    );
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("«мои» — только строки, где исполнитель я; без меня — пусто", () => {
    const rows = taskListRows(
      input([], [work({ staffId: "s1" }), work({ staffId: "s2" }), work({})]),
      NOW,
    );
    expect(filterRows(rows, "mine", NOW, "s1")).toHaveLength(1);
    expect(filterRows(rows, "mine", NOW)).toHaveLength(0);
  });

  it("«просрочено» — срок раньше сегодняшнего дня и не завершено", () => {
    const rows = taskListRows(
      input(
        [
          req({ note: "A", truckDate: NOW - 2 * DAY }),
          req({ note: "B", truckDate: NOW + 2 * DAY }),
        ],
        [],
      ),
      NOW,
    );
    expect(filterRows(rows, "overdue", NOW).map((r) => r.label)).toEqual(["A"]);
  });

  it("число на чипе совпадает со списком; пустой склад — нули", () => {
    const rows = taskListRows(input([req({}), req({ note: "Y" })], [work({})]), NOW);
    expect(chipCount(rows, "picking", NOW)).toBe(filterRows(rows, "picking", NOW).length);
    const empty = taskListRows(input([], []), NOW);
    expect(chipCount(empty, "open", NOW)).toBe(0);
    expect(chipCount(empty, "done", NOW)).toBe(0);
  });

  it("дни машин сборки попадают в строку для календаря", () => {
    const rows = taskListRows(input([req({ truckDate: NOW + DAY })], []), NOW);
    expect(rows[0]?.days).toHaveLength(1);
  });
});
