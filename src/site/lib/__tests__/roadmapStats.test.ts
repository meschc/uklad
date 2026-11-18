import { describe, expect, test } from "vitest";
import { c } from "../copy";
import type { Milestone, RoadmapItem } from "../../data/roadmap";
import {
  countByStatus,
  donePercent,
  filterByTrack,
  groupByStatus,
  milestoneProgress,
} from "../roadmapStats";

/**
 * Счёт проверяется на выдуманных пунктах, а не на настоящей карте: иначе
 * каждый тест пришлось бы править вместе с содержанием роадмапа, и он ловил бы
 * не ошибки в арифметике, а факт правки. Правдивость самих данных проверяется
 * отдельно — в `data/__tests__/roadmap.test.ts`.
 */

function item(over: Partial<RoadmapItem> & Pick<RoadmapItem, "id">): RoadmapItem {
  return {
    title: c("Пункт", "Item"),
    summary: c("Описание", "Summary"),
    status: "planned",
    track: "platform",
    milestone: "alpha",
    ...over,
  };
}

const MILESTONE_ALPHA: Milestone = {
  id: "alpha",
  title: c("Первая", "First"),
  goal: c("Цель", "Goal"),
};

describe("countByStatus", () => {
  test("считает пункты каждой стадии", () => {
    const items = [
      item({ id: "a", status: "done" }),
      item({ id: "b", status: "done" }),
      item({ id: "c", status: "progress" }),
    ];

    const counts = countByStatus(items);

    expect(counts).toEqual({ done: 2, progress: 1, planned: 0, idea: 0 });
  });

  test("на пустом списке возвращает нули, а не пустой объект", () => {
    const counts = countByStatus([]);

    expect(counts).toEqual({ done: 0, progress: 0, planned: 0, idea: 0 });
  });
});

describe("groupByStatus", () => {
  test("раскладывает пункты по стадиям, сохраняя порядок внутри стадии", () => {
    const items = [
      item({ id: "first", status: "done" }),
      item({ id: "second", status: "idea" }),
      item({ id: "third", status: "done" }),
    ];

    const groups = groupByStatus(items);

    expect(groups.done.map((entry) => entry.id)).toEqual(["first", "third"]);
    expect(groups.idea.map((entry) => entry.id)).toEqual(["second"]);
    expect(groups.progress).toEqual([]);
  });
});

describe("filterByTrack", () => {
  test("оставляет пункты одного направления", () => {
    const items = [item({ id: "a", track: "plan" }), item({ id: "b", track: "market" })];

    const filtered = filterByTrack(items, "plan");

    expect(filtered.map((entry) => entry.id)).toEqual(["a"]);
  });

  test("без направления возвращает копию, а не исходный массив", () => {
    const items = [item({ id: "a" })];

    const filtered = filterByTrack(items, null);

    expect(filtered).toEqual(items);
    expect(filtered).not.toBe(items);
  });
});

describe("milestoneProgress", () => {
  test("считает готовое и начатое разными долями", () => {
    const items = [
      item({ id: "a", status: "done" }),
      item({ id: "b", status: "progress" }),
      item({ id: "c", status: "planned" }),
      item({ id: "d", status: "idea" }),
    ];

    const progress = milestoneProgress(MILESTONE_ALPHA, items);

    expect(progress.total).toBe(4);
    expect(progress.done).toBe(1);
    expect(progress.progress).toBe(1);
    expect(progress.donePercent).toBe(25);
    expect(progress.progressPercent).toBe(25);
  });

  test("не считает чужие пункты", () => {
    const items = [item({ id: "own", status: "done" }), item({ id: "alien", milestone: "beta" })];

    const progress = milestoneProgress(MILESTONE_ALPHA, items);

    expect(progress.items.map((entry) => entry.id)).toEqual(["own"]);
    expect(progress.donePercent).toBe(100);
  });

  test("веха без пунктов даёт нули, а не деление на ноль", () => {
    const progress = milestoneProgress(MILESTONE_ALPHA, []);

    expect(progress.total).toBe(0);
    expect(progress.donePercent).toBe(0);
    expect(progress.progressPercent).toBe(0);
  });
});

describe("donePercent", () => {
  test("считает долю готового от всей карты", () => {
    const items = [
      item({ id: "a", status: "done" }),
      item({ id: "b", status: "done" }),
      item({ id: "c", status: "idea" }),
      item({ id: "d", status: "idea" }),
    ];

    expect(donePercent(items)).toBe(50);
  });

  test("на пустой карте возвращает ноль", () => {
    expect(donePercent([])).toBe(0);
  });
});
