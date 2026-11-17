import { describe, expect, it, vi } from "vitest";
import type { WarehouseTask } from "../../types";
import type { EditorState } from "../../store/state";
import type { OpQueue } from "../opQueue";
import type { StorePort } from "../repository";
import { createWorkTasksRepository } from "../workTasksRepository";
import { deskTasks } from "../../workTasks";

/**
 * Работы у стола: отметка ставится сразу, на сервер уходит операцией. В демо
 * (без сервера) операции нет, правила те же — как у `deskTasks.js`.
 */

const task = (over: Partial<WarehouseTask> = {}): WarehouseTask => ({
  id: "t1",
  kind: "marking",
  status: "open",
  qty: 10,
  createdAt: 1,
  ...over,
});

function stand(tasks: WarehouseTask[], source: "server" | "local" = "server", staffId = "ivan") {
  const state = {
    tasks,
    session: { source },
    stationSession: staffId ? { staffId } : null,
    putTask: (t: WarehouseTask) => {
      state.tasks = state.tasks.map((x) => (x.id === t.id ? t : x));
    },
  };
  const port: StorePort = { get: () => state as unknown as EditorState, set: () => {} };
  const enqueue = vi.fn();
  const ops = { enqueue } as unknown as OpQueue;
  return { state, repo: createWorkTasksRepository(port, ops), enqueue };
}

describe("workTasksRepository", () => {
  it("взять: в работе на того, кто за столом, и операция task_take", async () => {
    const { state, repo, enqueue } = stand([task()]);
    expect(await repo.take("t1")).toEqual({ ok: true, data: undefined });
    expect(state.tasks[0]).toMatchObject({ status: "in_progress", staffId: "ivan" });
    expect(enqueue).toHaveBeenCalledWith(
      "task_take",
      expect.objectContaining({ taskId: "t1", staffId: "ivan" }),
    );
  });

  it("сделал меньше заданного — в счёт уходит сделанное; больше — отказ", async () => {
    const { state, repo, enqueue } = stand([task({ status: "in_progress", staffId: "ivan" })]);
    expect((await repo.done("t1", 11)).ok).toBe(false);
    expect(await repo.done("t1", 7)).toEqual({ ok: true, data: undefined });
    expect(state.tasks[0]).toMatchObject({ status: "done", qty: 7 });
    expect(enqueue).toHaveBeenCalledWith("task_done", expect.objectContaining({ qty: 7 }));
  });

  it("чужую не взять, без входа по бейджу — отказ, в демо без операции", async () => {
    expect(await stand([task({ staffId: "petr" })]).repo.take("t1")).toEqual({
      ok: false,
      error: "ws.task.taken",
    });
    expect(await stand([task()], "server", "").repo.take("t1")).toEqual({
      ok: false,
      error: "ws.task.nobody",
    });
    const demo = stand([task()], "local");
    await demo.repo.take("t1");
    expect(demo.enqueue).not.toHaveBeenCalled();
    expect(demo.state.tasks[0].status).toBe("in_progress");
  });

  it("стол показывает свои в работе, назначенные и свободные — чужих и закрытых нет", () => {
    const list = deskTasks(
      [
        task({ id: "free", createdAt: 1 }),
        task({ id: "mine", staffId: "ivan", createdAt: 3 }),
        task({ id: "active", status: "in_progress", staffId: "ivan", createdAt: 5 }),
        task({ id: "other", staffId: "petr" }),
        task({ id: "closed", status: "done" }),
      ],
      "ivan",
    );
    expect(list.map((t) => t.id)).toEqual(["active", "mine", "free"]);
  });
});
