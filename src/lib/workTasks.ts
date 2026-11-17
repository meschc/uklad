import type { WarehouseTask } from "./types";

/**
 * Работы склада у стола — те же правила, что у сервера (`deskTasks.js`):
 * стол ставит отметку у себя сразу, а сервер принимает её операцией и
 * решает окончательно. Право по роли знает только сервер: стол показывает
 * человеку его работы и свободные, а чужую роль отрежет сервер.
 */

export type TaskProblem = "taken" | "closed" | "qty";

const foreign = (t: WarehouseTask, staffId: string) => !!t.staffId && t.staffId !== staffId;

/**
 * Работы человека за столом: сначала его в работе, потом назначенные ему,
 * потом свободные — их может взять любой. Чужие не показываем.
 */
export function deskTasks(tasks: readonly WarehouseTask[], staffId: string): WarehouseTask[] {
  const rank = (t: WarehouseTask) =>
    t.status === "in_progress" ? 0 : t.staffId === staffId ? 1 : 2;
  return tasks
    .filter((t) => (t.status === "open" || t.status === "in_progress") && !foreign(t, staffId))
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
}

/** Взять работу: в работе, на этого человека. */
export function takeTask(
  t: WarehouseTask,
  staffId: string,
  at: number,
): WarehouseTask | { problem: TaskProblem } {
  if (t.status === "in_progress" && t.staffId === staffId) return t;
  if (t.status !== "open") return { problem: "closed" };
  if (foreign(t, staffId)) return { problem: "taken" };
  return { ...t, status: "in_progress", staffId, startedAt: at };
}

/** Сделано: сколько — не больше заданного, больше решает руководитель. */
export function finishTask(
  t: WarehouseTask,
  staffId: string,
  at: number,
  qty: number = t.qty,
): WarehouseTask | { problem: TaskProblem } {
  if (t.status !== "open" && t.status !== "in_progress") return { problem: "closed" };
  if (foreign(t, staffId)) return { problem: "taken" };
  if (!Number.isInteger(qty) || qty < 1 || qty > t.qty) return { problem: "qty" };
  return { ...t, status: "done", staffId, qty, startedAt: t.startedAt ?? at, doneAt: at };
}
