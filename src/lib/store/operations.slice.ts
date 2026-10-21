import { nowMs, uid } from "../utils";
import type { WarehouseTask } from "../types";
import type { OperationsSlice, SliceCreator } from "./state";

/**
 * Задания на операции и настройка услуг склада.
 *
 * Отдельным срезом, а не внутри приёмки или заявок: задание — общая единица
 * работы для любой операции, включая те, которых в системе раньше не было
 * (маркировка, возвраты, упаковка). Факты, которые система пишет сама
 * (приёмка, сборка, рейсы), сюда не дублируются — журнал собирает их из
 * своих срезов (`operationLog`).
 */
export const createOperationsSlice: SliceCreator<OperationsSlice> = (set) => ({
  tasks: [],
  serviceSettings: { enabled: {}, prices: {} },

  createTask: (input) => {
    const task: WarehouseTask = {
      id: uid("task"),
      kind: input.kind,
      status: "open",
      qty: Math.max(1, Math.round(input.qty) || 1),
      partnerId: input.partnerId || undefined,
      staffId: input.staffId || undefined,
      note: input.note?.trim() || undefined,
      createdAt: nowMs(),
    };
    set((s) => ({ tasks: [task, ...s.tasks] }));
    return task.id;
  },

  setTaskStatus: (id, status) =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const now = nowMs();
        if (status === "open") return { ...t, status, startedAt: undefined, doneAt: undefined };
        if (status === "in_progress")
          return { ...t, status, startedAt: t.startedAt ?? now, doneAt: undefined };
        if (status === "done") return { ...t, status, startedAt: t.startedAt ?? now, doneAt: now };
        return { ...t, status, doneAt: undefined };
      }),
    })),

  updateTask: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...patch };
        if ("qty" in patch) next.qty = Math.max(1, Math.round(patch.qty ?? 1) || 1);
        if ("staffId" in patch) next.staffId = patch.staffId || undefined;
        if ("partnerId" in patch) next.partnerId = patch.partnerId || undefined;
        if ("note" in patch) next.note = patch.note?.trim() || undefined;
        return next;
      }),
    })),

  setServiceEnabled: (kind, on) =>
    set((s) => ({
      serviceSettings: {
        ...s.serviceSettings,
        enabled: { ...s.serviceSettings.enabled, [kind]: on },
      },
    })),

  setServicePrice: (kind, price) =>
    set((s) => {
      const prices = { ...s.serviceSettings.prices };
      if (price == null || !Number.isFinite(price) || price < 0) delete prices[kind];
      else prices[kind] = price;
      return { serviceSettings: { ...s.serviceSettings, prices } };
    }),
});
