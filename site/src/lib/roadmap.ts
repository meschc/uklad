import type { Milestone, RoadmapItem, Status, Track } from "@/data/types";

/**
 * Счёт по роадмапу: группировка, прогресс вех, фильтр, подписи дат.
 *
 * Логика вынесена из компонентов, потому что ошибается она молча: колонка с
 * неверной сортировкой и веха с процентом «на глаз» выглядят как обычные —
 * заметить расхождение можно только сверив руками. Поэтому тут чистые
 * функции, и они покрыты тестами (`roadmap.test.ts`).
 */

/** Порядок колонок на борде: слева замысел, справа сделанное. */
export const STATUS_ORDER: Status[] = ["idea", "planned", "progress", "done"];

/**
 * Сортировка внутри колонки. У незавершённых наверху то, за что больше
 * голосов — это и есть очередь. У готового наверху то, что вышло позже:
 * голоса за сделанное уже ничего не решают, а свежесть — решает.
 */
function compare(a: RoadmapItem, b: RoadmapItem): number {
  if (a.status === "done" && b.status === "done") {
    const byDate = (b.shippedAt ?? "").localeCompare(a.shippedAt ?? "");
    if (byDate !== 0) return byDate;
  }
  if (b.votes !== a.votes) return b.votes - a.votes;
  return a.title.localeCompare(b.title, "ru");
}

/** Пункты по колонкам. Пустая колонка остаётся в результате — борд её рисует. */
export function groupByStatus(items: RoadmapItem[]): Record<Status, RoadmapItem[]> {
  const out = { idea: [], planned: [], progress: [], done: [] } as Record<
    Status,
    RoadmapItem[]
  >;
  for (const item of items) out[item.status].push(item);
  for (const status of STATUS_ORDER) out[status].sort(compare);
  return out;
}

/** Условия отбора. Пустые значения ничего не отсекают. */
export interface Filter {
  track: Track | "all";
  query: string;
}

/**
 * Отбор по направлению и поиску. Ищем по заголовку и по описанию: человек
 * помнит формулировку «сканер», а не название пункта.
 */
export function filterItems(items: RoadmapItem[], filter: Filter): RoadmapItem[] {
  const q = filter.query.trim().toLowerCase();
  return items.filter((item) => {
    if (filter.track !== "all" && item.track !== filter.track) return false;
    if (!q) return true;
    return `${item.title} ${item.summary}`.toLowerCase().includes(q);
  });
}

/**
 * Готовность вехи. Считаем отдельно сделанное и то, что пишется сейчас: веха,
 * где половина задач в работе, и веха, к которой не притрагивались, — это
 * разные новости, а один процент готовности показал бы обеим ноль.
 */
export interface Progress {
  total: number;
  done: number;
  inProgress: number;
  /** Целые проценты сделанного. У вехи без пунктов — 0, а не деление на ноль. */
  percent: number;
  /** Целые проценты того, что в работе. */
  percentInProgress: number;
}

export function progressOf(items: RoadmapItem[]): Progress {
  const total = items.length;
  const done = items.filter((i) => i.status === "done").length;
  const inProgress = items.filter((i) => i.status === "progress").length;
  const share = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return {
    total,
    done,
    inProgress,
    percent: share(done),
    percentInProgress: share(inProgress),
  };
}

export function milestoneProgress(items: RoadmapItem[], milestone: Milestone): Progress {
  return progressOf(items.filter((i) => i.milestone === milestone.id));
}

/** Сколько пунктов в каждой стадии — для полосы счётчиков над бордом. */
export function countByStatus(items: RoadmapItem[]): Record<Status, number> {
  const out = { idea: 0, planned: 0, progress: 0, done: 0 } as Record<Status, number>;
  for (const item of items) out[item.status] += 1;
  return out;
}

/**
 * Пункты по кварталам, от ближнего к дальнему. Готовое показываем по кварталу
 * выхода, остальное — по ориентиру: на таймлайне это одна ось времени.
 */
export function byQuarter(items: RoadmapItem[]): { quarter: string; items: RoadmapItem[] }[] {
  const map = new Map<string, RoadmapItem[]>();
  for (const item of items) {
    const list = map.get(item.quarter);
    if (list) list.push(item);
    else map.set(item.quarter, [item]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([quarter, list]) => ({ quarter, items: [...list].sort(compare) }));
}

const ROMAN = ["I", "II", "III", "IV"];

/** «2026-Q4» → «IV квартал 2026». Кривое значение возвращаем как есть. */
export function formatQuarter(quarter: string): string {
  const m = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return quarter;
  return `${ROMAN[+m[2] - 1]} квартал ${m[1]}`;
}

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** «2026-09-12» → «12 сентября 2026». Собираем руками: подписи должны читаться
 *  одинаково в любом браузере, а `toLocaleDateString` зависит от локали среды. */
export function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
}

/** Согласование числа для подписей вида «12 задач». */
export function plural(n: number, forms: [string, string, string]): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return forms[0];
  if (d >= 2 && d <= 4 && (dd < 10 || dd >= 20)) return forms[1];
  return forms[2];
}
