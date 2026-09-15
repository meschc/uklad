import { describe, expect, it } from "vitest";
import { ITEMS, MILESTONES, RELEASES } from "@/data/roadmap";
import type { RoadmapItem } from "@/data/types";
import {
  byQuarter,
  countByStatus,
  filterItems,
  formatDate,
  formatQuarter,
  groupByStatus,
  milestoneProgress,
  plural,
  progressOf,
  STATUS_ORDER,
} from "@/lib/roadmap";

/** Пункт с заданными полями поверх безобидной заготовки. */
function item(patch: Partial<RoadmapItem> & { id: string }): RoadmapItem {
  return {
    title: patch.id,
    summary: "",
    status: "planned",
    track: "platform",
    quarter: "2026-Q4",
    milestone: "server",
    votes: 0,
    ...patch,
  };
}

describe("группировка по колонкам", () => {
  it("раскладывает пункты по стадиям и держит пустые колонки", () => {
    const groups = groupByStatus([item({ id: "a", status: "progress" })]);
    expect(Object.keys(groups).sort()).toEqual([...STATUS_ORDER].sort());
    expect(groups.progress.map((i) => i.id)).toEqual(["a"]);
    expect(groups.idea).toEqual([]);
  });

  it("незавершённое сортирует по голосам — это очередь", () => {
    const groups = groupByStatus([
      item({ id: "мало", votes: 3 }),
      item({ id: "много", votes: 90 }),
      item({ id: "средне", votes: 40 }),
    ]);
    expect(groups.planned.map((i) => i.id)).toEqual(["много", "средне", "мало"]);
  });

  it("готовое сортирует по дате выхода, а не по голосам", () => {
    const groups = groupByStatus([
      item({ id: "старое", status: "done", votes: 100, shippedAt: "2026-01-01" }),
      item({ id: "свежее", status: "done", votes: 1, shippedAt: "2026-09-01" }),
    ]);
    expect(groups.done.map((i) => i.id)).toEqual(["свежее", "старое"]);
  });
});

describe("фильтр", () => {
  const items = [
    item({ id: "scan", title: "Терминал сборщика", summary: "сканирование в проходе", track: "fulfillment" }),
    item({ id: "api", title: "Открытый API", summary: "остатки наружу", track: "integrations" }),
  ];

  it("пустой запрос ничего не отсекает", () => {
    expect(filterItems(items, { track: "all", query: "  " })).toHaveLength(2);
  });

  it("ищет и по описанию, не только по заголовку", () => {
    expect(filterItems(items, { track: "all", query: "сканирование" }).map((i) => i.id)).toEqual([
      "scan",
    ]);
  });

  it("направление и запрос работают вместе", () => {
    expect(
      filterItems(items, { track: "integrations", query: "остатки" }).map((i) => i.id),
    ).toEqual(["api"]);
    expect(filterItems(items, { track: "plan", query: "остатки" })).toEqual([]);
  });
});

describe("прогресс", () => {
  it("считает начатое отдельно от сделанного", () => {
    const p = progressOf([
      item({ id: "1", status: "done" }),
      item({ id: "2", status: "progress" }),
      item({ id: "3", status: "progress" }),
      item({ id: "4", status: "planned" }),
    ]);
    expect(p.done).toBe(1);
    expect(p.inProgress).toBe(2);
    expect(p.percent).toBe(25);
    expect(p.percentInProgress).toBe(50);
  });

  it("считает долю готового в целых процентах", () => {
    const p = progressOf([
      item({ id: "1", status: "done" }),
      item({ id: "2", status: "done" }),
      item({ id: "3", status: "planned" }),
    ]);
    expect(p).toEqual({
      total: 3,
      done: 2,
      inProgress: 0,
      percent: 67,
      percentInProgress: 0,
    });
  });

  it("веха без пунктов даёт ноль, а не деление на ноль", () => {
    expect(progressOf([])).toEqual({
      total: 0,
      done: 0,
      inProgress: 0,
      percent: 0,
      percentInProgress: 0,
    });
  });

  it("берёт только пункты своей вехи", () => {
    const items = [
      item({ id: "1", milestone: "server", status: "done" }),
      item({ id: "2", milestone: "floor", status: "planned" }),
    ];
    const server = MILESTONES.find((m) => m.id === "server")!;
    expect(milestoneProgress(items, server)).toEqual({
      total: 1,
      done: 1,
      inProgress: 0,
      percent: 100,
      percentInProgress: 0,
    });
  });
});

describe("подписи", () => {
  it("квартал разворачивается в человеческий вид", () => {
    expect(formatQuarter("2026-Q4")).toBe("IV квартал 2026");
    expect(formatQuarter("2027-Q1")).toBe("I квартал 2027");
  });

  it("кривой квартал и кривую дату отдаёт как есть", () => {
    expect(formatQuarter("скоро")).toBe("скоро");
    expect(formatDate("когда-нибудь")).toBe("когда-нибудь");
  });

  it("дата собирается одинаково в любой среде", () => {
    expect(formatDate("2026-09-12")).toBe("12 сентября 2026");
    expect(formatDate("2026-01-05")).toBe("5 января 2026");
  });

  it("согласует число", () => {
    const forms: [string, string, string] = ["задача", "задачи", "задач"];
    expect(plural(1, forms)).toBe("задача");
    expect(plural(3, forms)).toBe("задачи");
    expect(plural(11, forms)).toBe("задач");
    expect(plural(22, forms)).toBe("задачи");
  });
});

describe("таймлайн", () => {
  it("кварталы идут от ближнего к дальнему", () => {
    const rows = byQuarter([
      item({ id: "поздний", quarter: "2027-Q2" }),
      item({ id: "ранний", quarter: "2026-Q4" }),
      item({ id: "сосед", quarter: "2026-Q4" }),
    ]);
    expect(rows.map((r) => r.quarter)).toEqual(["2026-Q4", "2027-Q2"]);
    expect(rows[0].items).toHaveLength(2);
  });
});

describe("сами данные роадмапа", () => {
  it("идентификаторы уникальны — иначе голос уйдёт не туда", () => {
    const ids = ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("каждый пункт привязан к существующей вехе", () => {
    const known = new Set(MILESTONES.map((m) => m.id));
    expect(ITEMS.filter((i) => !known.has(i.milestone))).toEqual([]);
  });

  it("у готового есть дата выхода и версия, у остального их нет", () => {
    for (const i of ITEMS) {
      if (i.status === "done") {
        expect(i.shippedAt, i.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(i.version, i.id).toBeTruthy();
      } else {
        expect(i.shippedAt, i.id).toBeUndefined();
      }
    }
  });

  it("версия готового пункта есть в журнале обновлений", () => {
    const known = new Set(RELEASES.map((r) => r.version));
    const orphans = ITEMS.filter((i) => i.version && !known.has(i.version)).map((i) => i.id);
    expect(orphans).toEqual([]);
  });

  it("квартал записан в формате, который умеет читать витрина", () => {
    for (const i of ITEMS) expect(i.quarter, i.id).toMatch(/^\d{4}-Q[1-4]$/);
  });

  it("счётчики стадий сходятся с общим числом пунктов", () => {
    const counts = countByStatus(ITEMS);
    const sum = STATUS_ORDER.reduce((acc, s) => acc + counts[s], 0);
    expect(sum).toBe(ITEMS.length);
  });
});
