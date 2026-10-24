import { useMemo, useState } from "react";
import { Check, ListChecks, Play, Plus, RotateCcw, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { serviceSpec, taskKinds } from "@/lib/operations";
import type { ServiceKind, WarehouseTask } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { card } from "@/components/ui/card";
import { ScreenShell, EmptyState } from "./ScreenShell";
import { ReportPanel, ServicesPanel } from "./ServicesPanels";

/**
 * «Операции» — задания на операции склада и учёт услуг.
 *
 * Три вкладки, потому что это три разных вопроса одного человека — начальника
 * склада: что сейчас надо сделать, что склад вообще делает и почём, сколько
 * набежало продавцу за месяц. Приёмка, сборка и отгрузка заданиями здесь не
 * заводятся — их система считает сама, по своим экранам.
 */

type Tab = "tasks" | "services" | "report";

const SELECT =
  "h-8 w-full cursor-pointer rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function OperationsScreen() {
  const t = useT();
  const [tab, setTab] = useState<Tab>("tasks");
  return (
    <ScreenShell wide title={t("ops.title")} subtitle={t("ops.subtitle")}>
      <div>
        <Segmented
          size="md"
          value={tab}
          onChange={setTab}
          ariaLabel={t("ops.title")}
          options={[
            { value: "tasks", label: t("ops.tab.tasks") },
            { value: "services", label: t("ops.tab.services") },
            { value: "report", label: t("ops.tab.report") },
          ]}
        />
      </div>
      {tab === "tasks" && <TasksPanel />}
      {tab === "services" && <ServicesPanel />}
      {tab === "report" && <ReportPanel />}
    </ScreenShell>
  );
}

function TasksPanel() {
  const t = useT();
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

  return (
    <div className="flex flex-col gap-4">
      {kinds.length > 0 ? (
        <NewTaskForm kinds={kinds} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("ops.task.noKinds")}</p>
      )}

      <div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: t("ops.task.filter.active") },
            { value: "done", label: t("ops.task.filter.done") },
          ]}
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
          {shown.map((task) => (
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
  const unit = serviceSpec(task.kind)?.unit ?? "unit";
  const meta = [partnerName, staffName, task.note].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {t(`ops.svc.${task.kind}` as MsgKey)}{" "}
          <span className="tabular-nums text-muted-foreground">
            · {task.qty} {t(`ops.unit.${unit}` as MsgKey)}
          </span>
        </p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
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
              {t(`ops.svc.${k}` as MsgKey)}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={`${t("ops.task.qty")} (${t(`ops.unit.${serviceSpec(current)?.unit ?? "unit"}` as MsgKey)})`}
      >
        <Input
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

export function Field({
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
