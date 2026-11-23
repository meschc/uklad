import type { FulfillmentRequest, WarehouseTask } from "./types";
import { groupRequestsByTarget } from "./fulfillment";
import { taskQueue, type QueueInput, type QueueItem, type QueueProcess } from "./taskQueue";

/**
 * Единый список заданий склада (Кирилл 22.11: «задания — один модуль»).
 *
 * Раньше «Задания» были тремя вкладками — очередь, заявки и работы склада, —
 * и у каждой был свой вид. Здесь они одна таблица: строка — задание любого
 * процесса, а чипы сверху выбирают процесс или срез («мои», «просрочено»,
 * «завершённые»). Очередь по-прежнему не заводит своих записей (`taskQueue`):
 * открытая работа берётся из данных, а завершённая — из тех же записей, у
 * которых работа уже сделана. Модуль чистый: о сторе и сервере не знает.
 */

type TaskStatus = "waiting" | "active" | "done";

export interface TaskListRow extends QueueItem {
  process: QueueProcess;
  status: TaskStatus;
  /** Дни (начало суток), на которые назначены машины заявок строки — для календаря. */
  days: number[];
  /** Работа склада завершена или отменена: для подписи («отменено»). */
  cancelled?: boolean;
}

/** Чип списка: срез или процесс. */
export type TaskChip = "open" | "mine" | "overdue" | "done" | QueueProcess;

const dayStart = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Дни машин заявок назначения: ключ строки сборки — `pick:<назначение>`. */
function daysOf(requests: readonly FulfillmentRequest[], target: string | null): number[] {
  const set = new Set<number>();
  for (const r of requests) {
    if ((r.note?.trim() || null) === target && r.truckDate != null) set.add(dayStart(r.truckDate));
  }
  return [...set].sort((a, b) => a - b);
}

/** Завершённые работы склада: сделана или отменена. */
function doneWork(tasks: readonly WarehouseTask[]): TaskListRow[] {
  return tasks
    .filter((x) => x.status === "done" || x.status === "cancelled")
    .map((x) => ({
      key: x.id,
      process: "work" as const,
      label: x.kind,
      units: x.qty,
      since: x.doneAt ?? x.createdAt,
      active: false,
      staffId: x.staffId,
      status: "done" as const,
      days: [],
      cancelled: x.status === "cancelled",
    }));
}

/** Завершённые заявки — по назначению: всё уехало или отменено. */
function doneRequests(requests: readonly FulfillmentRequest[]): TaskListRow[] {
  const closed = requests.filter((r) => r.status === "shipped" || r.status === "cancelled");
  return groupRequestsByTarget(closed).map((g) => ({
    key: `done:pick:${g.target ?? ""}`,
    process: "picking" as const,
    label: g.target,
    units: g.items.reduce((n, r) => n + r.qty, 0),
    since: Math.max(...g.items.map((r) => r.updatedAt ?? r.createdAt)),
    active: false,
    status: "done" as const,
    days: daysOf(closed, g.target),
    cancelled: g.items.every((r) => r.status === "cancelled"),
  }));
}

/** Все задания: открытые из очереди и завершённые. Порядок — как в очереди. */
export function taskListRows(input: QueueInput, now: number): TaskListRow[] {
  const open: TaskListRow[] = taskQueue(input, now).flatMap((g) =>
    g.items.map((item) => ({
      ...item,
      process: g.process,
      status: (item.active ? "active" : "waiting") as TaskStatus,
      days:
        g.process === "picking"
          ? daysOf(
              input.requests.filter((r) => r.status === "new" || r.status === "in_progress"),
              item.label,
            )
          : [],
    })),
  );
  const done = [...doneWork(input.tasks), ...doneRequests(input.requests)].sort(
    (a, b) => b.since - a.since,
  );
  return [...open, ...done];
}

/** Срок раньше сегодняшнего дня, и задание не завершено. */
export const isOverdue = (row: TaskListRow, now: number) =>
  row.status !== "done" && row.due != null && row.due < dayStart(now);

/** Какие строки показывает чип. «Мои» — те, где исполнитель записан и это я. */
export function filterRows(
  rows: readonly TaskListRow[],
  chip: TaskChip,
  now: number,
  me?: string,
): TaskListRow[] {
  switch (chip) {
    case "open":
      return rows.filter((r) => r.status !== "done");
    case "done":
      return rows.filter((r) => r.status === "done");
    case "mine":
      return rows.filter((r) => r.status !== "done" && !!me && r.staffId === me);
    case "overdue":
      return rows.filter((r) => isOverdue(r, now));
    default:
      return rows.filter((r) => r.status !== "done" && r.process === chip);
  }
}

/** Сколько строк у каждого чипа — число на чипе не должно расходиться со списком. */
export function chipCount(
  rows: readonly TaskListRow[],
  chip: TaskChip,
  now: number,
  me?: string,
): number {
  return filterRows(rows, chip, now, me).length;
}
