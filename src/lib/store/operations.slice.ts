import { nowMs, uid } from "../utils";
import { LIMITS } from "@/lib/numberLimits";
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

  putTask: (task) => set((s) => ({ tasks: s.tasks.map((t) => (t.id === task.id ? task : t)) })),

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

  setTwoStageReceiving: (on) =>
    set((s) => ({
      serviceSettings: { ...s.serviceSettings, twoStageReceiving: on || undefined },
    })),

  addCustomService: (name, unit) => {
    const kind = `custom:${uid("svc")}` as const;
    set((s) => ({
      serviceSettings: {
        ...s.serviceSettings,
        custom: [...(s.serviceSettings.custom ?? []), { kind, name: name.trim(), unit }],
      },
    }));
    return kind;
  },

  removeCustomService: (kind) =>
    set((s) => ({
      serviceSettings: {
        ...s.serviceSettings,
        custom: (s.serviceSettings.custom ?? []).filter((c) => c.kind !== kind),
      },
    })),

  restoreCustomService: (service) =>
    set((s) => {
      const list = s.serviceSettings.custom ?? [];
      if (list.some((c) => c.kind === service.kind)) return {};
      return { serviceSettings: { ...s.serviceSettings, custom: [...list, service] } };
    }),

  updateService: (kind, { name, note }) =>
    set((s) => {
      const cur = s.serviceSettings;
      const clean = (v: string | undefined) => v?.trim().slice(0, 500) || undefined;
      const notes = { ...cur.notes };
      const n = clean(note);
      if (n) notes[kind] = n;
      else delete notes[kind];
      if (kind.startsWith("custom:")) {
        const nm = clean(name)?.slice(0, 80);
        return {
          serviceSettings: {
            ...cur,
            notes,
            custom: (cur.custom ?? []).map((c) => (c.kind === kind && nm ? { ...c, name: nm } : c)),
          },
        };
      }
      const names = { ...cur.names };
      const nm = clean(name)?.slice(0, 80);
      if (nm) names[kind] = nm;
      else delete names[kind];
      return { serviceSettings: { ...cur, names, notes } };
    }),

  setServicePrice: (kind, price) =>
    set((s) => {
      const prices = { ...s.serviceSettings.prices };
      if (price == null || !Number.isFinite(price) || price < 0) delete prices[kind];
      else prices[kind] = Math.min(LIMITS.price.max, Math.round(price * 100) / 100);
      return { serviceSettings: { ...s.serviceSettings, prices } };
    }),
});
