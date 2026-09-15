import type { SiteLang } from "./lang";
import type { Milestone, RoadmapItem, Status, Track } from "../data/roadmap";

/**
 * Счёт по дорожной карте.
 *
 * Считается из самого списка пунктов, а не хранится рядом с ним: цифра,
 * записанная руками, расходится с содержимым на первой же правке, и расходится
 * молча. Всё здесь — чистые функции без состояния: их одинаково зовут и
 * компонент, и пререндер, и тест.
 */

/** Римские номера кварталов: в русском тексте «IV квартал» привычнее «Q4». */
const ROMAN_QUARTERS = ["I", "II", "III", "IV"] as const;

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

export type StatusCounts = Record<Status, number>;

/** Сколько пунктов в каждой стадии. */
export function countByStatus(items: readonly RoadmapItem[]): StatusCounts {
  const counts: StatusCounts = { done: 0, progress: 0, planned: 0, idea: 0 };
  for (const item of items) counts[item.status] += 1;
  return counts;
}

/** Пункты по стадиям, в порядке колонок доски. */
export function groupByStatus(items: readonly RoadmapItem[]): Record<Status, RoadmapItem[]> {
  const groups: Record<Status, RoadmapItem[]> = { done: [], progress: [], planned: [], idea: [] };
  for (const item of items) groups[item.status].push(item);
  return groups;
}

/** Пункты одного направления — для отбора на доске. */
export function filterByTrack(items: readonly RoadmapItem[], track: Track | null): RoadmapItem[] {
  return track === null ? [...items] : items.filter((item) => item.track === track);
}

export interface MilestoneProgress {
  milestone: Milestone;
  items: RoadmapItem[];
  total: number;
  done: number;
  progress: number;
  /** Доли от общего числа пунктов, 0–100. Полоса рисуется двумя отрезками. */
  donePercent: number;
  progressPercent: number;
}

/**
 * Прогресс вехи двумя долями, а не одной.
 *
 * Сделанное и начатое — разные обещания: если сложить их в одну полосу, веха
 * с одним готовым пунктом и девятью начатыми выглядит законченной.
 */
export function milestoneProgress(
  milestone: Milestone,
  items: readonly RoadmapItem[],
): MilestoneProgress {
  const own = items.filter((item) => item.milestone === milestone.id);
  const done = own.filter((item) => item.status === "done").length;
  const progress = own.filter((item) => item.status === "progress").length;
  const total = own.length;
  const share = (count: number) => (total === 0 ? 0 : Math.round((count / total) * 100));
  return {
    milestone,
    items: own,
    total,
    done,
    progress,
    donePercent: share(done),
    progressPercent: share(progress),
  };
}

/** Прогресс всех вех разом, в порядке их объявления. */
export function milestonesProgress(
  milestones: readonly Milestone[],
  items: readonly RoadmapItem[],
): MilestoneProgress[] {
  return milestones.map((milestone) => milestoneProgress(milestone, items));
}

/**
 * Подпись квартала: «IV квартал 2026» / «Q4 2026».
 *
 * Неразобранная строка возвращается как есть: подпись — не то место, где
 * стоит падать, а тест на формат стоит рядом с данными.
 */
export function quarterLabel(lang: SiteLang, quarter: string): string {
  const match = QUARTER_PATTERN.exec(quarter);
  if (!match) return quarter;
  const [, year, index] = match;
  if (lang === "en") return `Q${index} ${year}`;
  return `${ROMAN_QUARTERS[Number(index) - 1]} квартал ${year}`;
}

/** Кварталы, которые встречаются у пунктов, по возрастанию. */
export function quartersOf(items: readonly RoadmapItem[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.quarter) seen.add(item.quarter);
  }
  // Формат «ГГГГ-Qn» сортируется как обычная строка — год впереди, номер один
  // знак, так что лексикографический порядок совпадает с хронологическим.
  return [...seen].sort();
}

/** Доля готового от всей карты, 0–100 — одна цифра для шапки страницы. */
export function donePercent(items: readonly RoadmapItem[]): number {
  if (items.length === 0) return 0;
  const counts = countByStatus(items);
  return Math.round((counts.done / items.length) * 100);
}
