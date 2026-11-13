import { useMemo, useState } from "react";
import { Check, ListChecks, Play, Plus, RotateCcw, UserCheck, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { myStaffId, serviceSpec, taskKinds } from "@/lib/operations";
import type { ServiceKind, WarehouseTask } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableFilters, TableSearch, useDataTable } from "@/components/ui/data-table";
import { Segmented } from "@/components/ui/segmented";
import { card } from "@/components/ui/card";
import { EmptyState } from "./ScreenShell";
import { useServiceName } from "./useServiceName";
import { LIMITS } from "@/lib/numberLimits";

/**
 * Работы склада — задания на операции, которые система сама не видит:
 * маркировка, переупаковка, возвраты, свои услуги склада.
 *
 * Жили вкладкой экрана «Операции и услуги», и Кирилл (12 ноя) их там не нашёл:
 * «задания формируются со страницы операций и услуг, а должны быть в своём
 * меню». Теперь это вкладка экрана «Задания», рядом с заявками на сборку, а
 * «Услуги и цены» — только настройка того, что склад продаёт и почём.
 *
 * Задание можно взять себе одной кнопкой и переназначить прямо в строке —
 * раньше исполнителя выбирали только при создании.
 */

const SELECT =
  "h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function WorkTasksPanel() {
  const t = useT();
  const svcName = useServiceName();
  const tasks = useEditor((s) => s.tasks);
  const settings = useEditor((s) => s.serviceSettings);
  const staff = useEditor((s) => s.warehouse.staff);
  const partners = useEditor((s) => s.warehouse.partners);
  const setTaskStatus = useEditor((s) => s.setTaskStatus);
  const [filter, setFilter] = useState<"active" | "done">("active");

  const kinds = useMemo(() => taskKinds(settings), [settings]);
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of staff ?? []) m.set(p.id, p.name);
    for (const p of partners ?? []) m.set(p.id, p.name);
    return m;
  }, [staff, partners]);

  const shown = tasks.filter((x) =>
    filter === "active"
      ? x.status === "open" || x.status === "in_progress"
      : x.status === "done" || x.status === "cancelled",
  );
  // Новые сверху; поиск — по услуге, продавцу, исполнителю и заметке.
  const taskTable = useDataTable(
    shown,
    [
      { id: "kind", value: (x) => svcName(x.kind), facet: (v) => v },
      {
        id: "assignee",
        value: (x) => (x.staffId ? nameOf.get(x.staffId) : undefined),
        facet: (v) => v,
      },
      {
        id: "who",
        value: (x) => [x.partnerId, x.staffId].map((id) => (id ? nameOf.get(id) : "")).join(" "),
      },
      { id: "note", value: (x) => x.note },
      { id: "at", value: (x) => x.doneAt ?? x.createdAt },
    ],
    [{ id: "at", desc: true }],
  );

  return (
    <div className="flex flex-col gap-4">
      {kinds.length > 0 ? (
        <NewTaskForm kinds={kinds} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("ops.task.noKinds")}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: t("ops.task.filter.active") },
            { value: "done", label: t("ops.task.filter.done") },
          ]}
        />
        <TableFilters
          facets={taskTable.facets}
          filters={taskTable.filters}
          onChange={taskTable.setFilter}
          labels={{ kind: t("ops.task.kind"), assignee: t("tasks.assignee") }}
          allLabel={(col) => t("common.filterAll", { col })}
        />
        <TableSearch
          className="ml-auto"
          value={taskTable.query}
          onChange={taskTable.setQuery}
          placeholder={t("common.search")}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title={t("ops.task.empty")}
          body={t("ops.task.emptyBody")}
        />
      ) : (
        <ul className={cn(card({ pad: "none" }), "divide-y divide-border")}>
          {taskTable.rows.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              staffName={task.staffId ? nameOf.get(task.staffId) : undefined}
              partnerName={task.partnerId ? nameOf.get(task.partnerId) : undefined}
              onStatus={(st) => setTaskStatus(task.id, st)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  staffName,
  partnerName,
  onStatus,
}: {
  task: WarehouseTask;
  staffName?: string;
  partnerName?: string;
  onStatus: (s: WarehouseTask["status"]) => void;
}) {
  const t = useT();
  const svcName = useServiceName();
  const settings = useEditor((s) => s.serviceSettings);
  const staff = useEditor((s) => s.warehouse.staff);
  const user = useEditor((s) => s.session.user);
  const updateTask = useEditor((s) => s.updateTask);
  const me = myStaffId(staff, user);
  const active = task.status === "open" || task.status === "in_progress";
  const unit = serviceSpec(task.kind, settings)?.unit ?? "unit";
  // Исполнитель — в своём поле, поэтому в подписи только продавец и заметка.
  const meta = [partnerName, active ? undefined : staffName, task.note].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {svcName(task.kind)}{" "}
          <span className="tabular-nums text-muted-foreground">
            · {task.qty} {t(`ops.unit.${unit}` as MsgKey)}
          </span>
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      {active && (
        <div className="flex items-center gap-1.5">
          <select
            className={cn(SELECT, "w-44")}
            aria-label={t("tasks.assignee")}
            value={task.staffId ?? ""}
            onChange={(e) => updateTask(task.id, { staffId: e.target.value })}
          >
            <option value="">{t("ops.task.none")}</option>
            {(staff ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {/* «Взять себе» — одной кнопкой, без поиска себя в списке
              (Кирилл 12 ноя: «не могу назначить своё задание»). */}
          {me && task.staffId !== me && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateTask(task.id, { staffId: me })}
            >
              <UserCheck /> {t("tasks.takeMine")}
            </Button>
          )}
        </div>
      )}
      <span className="text-xs text-muted-foreground">
        {t(`ops.task.status.${task.status}` as MsgKey)}
      </span>
      <div className="flex gap-1.5">
        {task.status === "open" && (
          <Button size="sm" variant="outline" onClick={() => onStatus("in_progress")}>
            <Play /> {t("ops.task.start")}
          </Button>
        )}
        {(task.status === "open" || task.status === "in_progress") && (
          <>
            <Button size="sm" onClick={() => onStatus("done")}>
              <Check /> {t("ops.task.done")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("ops.task.cancel")}
              title={t("ops.task.cancel")}
              onClick={() => onStatus("cancelled")}
            >
              <X />
            </Button>
          </>
        )}
        {(task.status === "done" || task.status === "cancelled") && (
          <Button size="sm" variant="ghost" onClick={() => onStatus("open")}>
            <RotateCcw /> {t("ops.task.reopen")}
          </Button>
        )}
      </div>
    </li>
  );
}

function NewTaskForm({ kinds }: { kinds: ServiceKind[] }) {
  const t = useT();
  const svcName = useServiceName();
  const settings = useEditor((s) => s.serviceSettings);
  const staff = useEditor((s) => s.warehouse.staff);
  const partners = useEditor((s) => s.warehouse.partners);
  const createTask = useEditor((s) => s.createTask);
  const [kind, setKind] = useState<ServiceKind>(kinds[0]);
  const [qty, setQty] = useState("1");
  const [partnerId, setPartnerId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [note, setNote] = useState("");

  // Набор операций может поменяться на соседней вкладке — выбранная могла
  // выключиться, тогда берём первую доступную.
  const current = kinds.includes(kind) ? kind : kinds[0];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createTask({ kind: current, qty: Number(qty), partnerId, staffId, note });
    setQty("1");
    setNote("");
  };

  return (
    <form
      onSubmit={submit}
      className={cn(card({ pad: "lg" }), "grid gap-3 sm:grid-cols-[2fr_1fr_2fr_2fr]")}
      aria-label={t("ops.task.new")}
    >
      <Field label={t("ops.task.kind")}>
        <select
          className={SELECT}
          value={current}
          onChange={(e) => setKind(e.target.value as ServiceKind)}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {svcName(k)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={`${t("ops.task.qty")} (${t(`ops.unit.${serviceSpec(current, settings)?.unit ?? "unit"}` as MsgKey)})`}
      >
        <Input
          max={LIMITS.count.max}
          type="number"
          min={1}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          className="tabular-nums"
        />
      </Field>
      <Field label={t("ops.task.partner")}>
        <select className={SELECT} value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">{t("ops.task.none")}</option>
          {(partners ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("ops.task.staff")}>
        <select className={SELECT} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">{t("ops.task.none")}</option>
          {(staff ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-end gap-3 sm:col-span-4">
        <Field label={t("ops.task.note")} className="flex-1">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" size="sm">
          <Plus /> {t("ops.task.create")}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
