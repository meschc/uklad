import { finishTask, takeTask } from "../workTasks";
import { nowMs, uid } from "../utils";
import { onServer } from "./badgeRepository";
import { deskOps, type OpQueue } from "./opQueue";
import { storePort, type StorePort } from "./repository";
import { fail, ok, type Result } from "./result";

/**
 * Работы склада у стола: «взял» и «сделал». Отметка ставится у стола сразу,
 * а на сервер уходит операцией с ключом повтора (`task_take`, `task_done`,
 * `cabinet/deskTasks.js`) — снимок стол не пишет. За кого — решает сервер по
 * тому, кто за столом; без входа по бейджу работы не взять.
 */
export interface WorkTasksRepository {
  take: (taskId: string) => Promise<Result<void>>;
  /** Закрыть работу. `qty` — сколько сделали, не больше заданного. */
  done: (taskId: string, qty?: number) => Promise<Result<void>>;
}

export function createWorkTasksRepository(
  port: StorePort = storePort,
  ops: OpQueue = deskOps,
): WorkTasksRepository {
  const run = (
    kind: "task_take" | "task_done",
    prefix: string,
    taskId: string,
    qty: number | undefined,
  ): Result<void> => {
    const s = port.get();
    const by = s.stationSession?.staffId;
    if (!by) return fail("ws.task.nobody");
    const task = s.tasks.find((t) => t.id === taskId);
    if (!task) return fail("ws.task.closed");
    const at = nowMs();
    const next =
      kind === "task_take" ? takeTask(task, by, at) : finishTask(task, by, at, qty ?? task.qty);
    if ("problem" in next) return fail(`ws.task.${next.problem}`);
    if (next === task) return ok(undefined);
    s.putTask(next);
    if (onServer(port)) {
      ops.enqueue(kind, {
        eventId: uid(prefix),
        staffId: by,
        at,
        taskId,
        ...(kind === "task_done" ? { qty: next.qty } : {}),
      });
    }
    return ok(undefined);
  };
  return {
    take: async (taskId) => run("task_take", "tt", taskId, undefined),
    done: async (taskId, qty) => run("task_done", "td", taskId, qty),
  };
}

export const workTasksRepository = createWorkTasksRepository();
