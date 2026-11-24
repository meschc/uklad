import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, List, Plus, Wrench } from "lucide-react";
import { useEditor } from "@/lib/store";
import { hasCabinetServer } from "@/lib/data/api";
import { myStaffId } from "@/lib/operations";
import {
  chipCount,
  filterRows,
  isOverdue,
  taskListRows,
  type TaskChip,
  type TaskListRow,
} from "@/lib/taskList";
import type { QueueProcess } from "@/lib/taskQueue";
import { useT, type MsgKey, type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { card } from "@/components/ui/card";
import { TableScroll, TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW } from "@/components/ui/table-scroll";
import { SortTh, TableFilters, TableSearch, useDataTable } from "@/components/ui/data-table";
import { useNow } from "@/components/workstation/useNow";
import { ScreenShell, EmptyState } from "./ScreenShell";
import { RequestCalendar } from "./RequestCalendar";
import { RequestDialog } from "./RequestDialog";
import { NewWorkTask } from "./NewWorkTask";
import { TaskCard, useTaskTitle } from "./TaskCard";

/**
 * «Задания» — один модуль на всё, что склад должен сделать (Кирилл 22.11).
 *
 * Раньше было три вкладки с тремя видами: очередь, заявки на сборку и работы
 * склада. Теперь одна таблица: строка — задание любого процесса, чипы над ней
 * выбирают процесс или срез («мои», «просрочено», «завершённые»), поиск и
 * фильтр по исполнителю — общие. Карточка любого задания открывается в панели
 * справа (`TaskCard`), документы — блоком внутри неё. Календарь заявок
 * остался: он сужает ту же таблицу по дню машины.
 *
 * Состав строк — `lib/taskList.ts`: своих записей у очереди нет, открытая
 * работа берётся из данных процессов.
 */

const PROCESSES: QueueProcess[] = [
  "receiving",
  "picking",
  "packing",
  "sorting",
  "shipping",
  "inventory",
  "work",
  "approvals",
];

function sameDay(a: number, b: number): boolean {
  const d = (ts: number) => {
    const x = new Date(ts);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  return d(a) === d(b);
}

/** Сколько ждёт: минуты, часы, дни — крупнее не нужно. */
function waited(t: TFunc, ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return t("queue.wait.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("queue.wait.h", { n: h });
  return t("queue.wait.d", { n: Math.floor(h / 24) });
}

export function TasksScreen() {
  const t = useT();
  const now = useNow(60_000);
  const title = useTaskTitle();
  const expectedShipments = useEditor((s) => s.expectedShipments);
  const requests = useEditor((s) => s.requests);
  const boxes = useEditor((s) => s.boxes);
  const outboundBoxes = useEditor((s) => s.outboundBoxes);
  const tasks = useEditor((s) => s.tasks);
  const disputes = useEditor((s) => s.disputes);
  const receiving = useEditor((s) => s.receiving);
  const staff = useEditor((s) => s.warehouse.staff);
  const user = useEditor((s) => s.session.user);
  const me = myStaffId(staff, user);

  const [chip, setChip] = useState<TaskChip>("open");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [day, setDay] = useState<number | null>(null);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [creatingWork, setCreatingWork] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const all = useMemo(
    () =>
      taskListRows(
        {
          expectedShipments,
          requests,
          boxes,
          outboundBoxes: outboundBoxes ?? [],
          tasks,
          disputes,
          receiving,
        },
        now,
      ),
    [expectedShipments, requests, boxes, outboundBoxes, tasks, disputes, receiving, now],
  );

  const staffName = (id?: string) => (id ? staff?.find((p) => p.id === id)?.name : undefined);
  const visible = useMemo(
    () =>
      filterRows(all, chip, now, me)
        // Выбранный в календаре день сужает ту же таблицу, а не открывает вторую.
        .filter((r) => day == null || r.days.some((d) => sameDay(d, day))),
    [all, chip, now, me, day],
  );
  // Продавец — у строк сборки: назначение собирает заявки разных продавцов (Кирилл:
  // склад работает на нескольких, заявки разбирают по одному).
  const products = useEditor((s) => s.products);
  const partners = useEditor((s) => s.warehouse.partners);
  const sellerOf = (key: string) => {
    if (!key.includes("pick:")) return undefined;
    const target = key.slice(key.indexOf("pick:") + 5);
    const names = new Set<string>();
    for (const q of requests) {
      if ((q.note?.trim() || "") !== target) continue;
      const pid = products.find((x) => x.id === q.productId)?.partnerId;
      const n = partners?.find((x) => x.id === pid)?.name;
      if (n) names.add(n);
    }
    return names.size ? [...names].sort().join(", ") : undefined;
  };
  const table = useDataTable(
    visible,
    [
      { id: "title", value: (r) => title(r) },
      { id: "process", value: (r) => t(`queue.process.${r.process}` as MsgKey) },
      { id: "units", value: (r) => r.units },
      { id: "since", value: (r) => r.due ?? r.since },
      { id: "assignee", value: (r) => staffName(r.staffId), facet: (v) => v },
      { id: "seller", value: (r) => sellerOf(r.key), facet: (v) => v },
    ],
    [],
  );
  const opened = openKey ? (all.find((r) => r.key === openKey) ?? null) : null;

  const chips: { id: TaskChip; label: string }[] = [
    { id: "open", label: t("tasks.chip.open") },
    ...(me ? [{ id: "mine" as const, label: t("tasks.chip.mine") }] : []),
    { id: "overdue", label: t("tasks.chip.overdue") },
    ...PROCESSES.map((p) => ({ id: p as TaskChip, label: t(`queue.process.${p}` as MsgKey) })),
    { id: "done", label: t("tasks.chip.done") },
  ];

  return (
    <ScreenShell
      title={t("tasks.title")}
      subtitle={t("tasks.unifiedSubtitle")}
      wide
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => setCreatingWork(true)}>
            <Wrench className="size-3.5" />
            {t("tasks.newWork")}
          </Button>
          {/* «К сборке» на общем экране сбивал с толку (Кирилл 14.11): здесь
              создают задание, а собирают — на рабочем месте. */}
          <Button size="sm" onClick={() => setCreatingRequest(true)}>
            <Plus className="size-3.5" />
            {t("tasks.newRequest")}
          </Button>
        </>
      }
    >
      {creatingRequest && <RequestDialog onClose={() => setCreatingRequest(false)} />}
      {creatingWork && <NewWorkTask onClose={() => setCreatingWork(false)} />}

      {/* Список или календарь — взгляды на одни и те же задания. self-start —
          иначе тело ScreenShell (flex-колонка) растянет переключатель. */}
      <Segmented
        className="self-start"
        value={view}
        onChange={(v) => {
          setView(v);
          if (v === "list") setDay(null);
        }}
        ariaLabel={t("tasks.viewMode")}
        options={[
          { value: "list" as const, label: t("tasks.view.list"), icon: <List /> },
          { value: "calendar" as const, label: t("tasks.view.calendar"), icon: <CalendarDays /> },
        ]}
      />
      {view === "calendar" && (
        <div className={card()}>
          <RequestCalendar requests={requests} selectedDay={day} onPickDay={setDay} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t("tasks.chips")}>
        {chips.map((c) => {
          const n = chipCount(all, c.id, now, me);
          // Процесс без заданий не показываем чипом, но выбранный остаётся виден.
          if (n === 0 && c.id !== chip && PROCESSES.includes(c.id as QueueProcess)) return null;
          return (
            <FilterChip
              key={c.id}
              active={chip === c.id}
              onClick={() => setChip(c.id)}
              label={c.label}
              n={n}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <TableSearch
          value={table.query}
          onChange={table.setQuery}
          placeholder={t("common.search")}
        />
        <TableFilters
          facets={table.facets}
          filters={table.filters}
          onChange={table.setFilter}
          labels={{ assignee: t("tasks.assignee"), seller: t("ops.task.partner") }}
          allLabel={(col) => t("common.filterAll", { col })}
        />
      </div>

      {all.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title={t("tasks.emptyTitle")}
          // Переключатель ролей есть только в демо: на сервере роль из сессии.
          body={t(hasCabinetServer ? "tasks.emptyBodyServer" : "tasks.emptyBody")}
        />
      ) : table.rows.length === 0 ? (
        // Почему пусто и что делать (правило Кирилла 21.11).
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title={t("tasks.noneForFilter")}
          body={t("tasks.noneForFilterBody")}
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setChip("open");
                setDay(null);
                table.setQuery("");
              }}
            >
              {t("tasks.resetFilters")}
            </Button>
          }
        />
      ) : (
        <TableScroll>
          <table className="table-stack w-auto border-collapse text-sm">
            <thead className={TABLE_HEAD}>
              <tr className={TABLE_HEAD_ROW}>
                <SortTh table={table.table} id="title">
                  {t("tasks.col.task")}
                </SortTh>
                <SortTh table={table.table} id="process">
                  {t("tasks.col.process")}
                </SortTh>
                <SortTh table={table.table} id="units" align="right">
                  {t("tasks.col.qty")}
                </SortTh>
                <SortTh table={table.table} id="since">
                  {t("tasks.col.when")}
                </SortTh>
                <SortTh table={table.table} id="assignee">
                  {t("tasks.assignee")}
                </SortTh>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <Row
                  key={r.key}
                  row={r}
                  now={now}
                  title={title(r)}
                  who={staffName(r.staffId)}
                  onOpen={() => setOpenKey(r.key)}
                />
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      {opened && <TaskCard row={opened} onClose={() => setOpenKey(null)} />}
    </ScreenShell>
  );
}

function Row({
  row,
  now,
  title,
  who,
  onOpen,
}: {
  row: TaskListRow;
  now: number;
  title: string;
  who?: string;
  onOpen: () => void;
}) {
  const t = useT();
  const late = isOverdue(row, now);
  const state =
    row.status === "done"
      ? row.cancelled
        ? t("tasks.state.cancelled")
        : t("tasks.state.done")
      : row.status === "active"
        ? t("queue.active")
        : t("queue.waiting");
  return (
    <tr className={cn(TABLE_ROW, "hover:bg-accent/40")}>
      <td className="px-3 py-2">
        <button
          type="button"
          className="text-left font-medium hover:text-primary hover:underline max-md:min-h-11 max-md:min-w-11"
          onClick={onOpen}
        >
          {title}
        </button>
        <p className={cn("text-xs", late ? "text-destructive" : "text-muted-foreground")}>
          {state}
          {row.status !== "done" ? ` · ${t("queue.waits", { d: waited(t, now - row.since) })}` : ""}
          {late ? ` · ${t("tasks.overdue")}` : ""}
        </p>
      </td>
      <td className="px-3 py-2 text-muted-foreground" data-label={t("tasks.col.process")}>
        {t(`queue.process.${row.process}` as MsgKey)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums" data-label={t("tasks.col.qty")}>
        {row.units > 0 ? row.units : "—"}
      </td>
      <td className="px-3 py-2 text-muted-foreground" data-label={t("tasks.col.when")}>
        {row.due != null
          ? new Date(row.due).toLocaleDateString()
          : new Date(row.since).toLocaleDateString()}
      </td>
      <td className="px-3 py-2 text-muted-foreground" data-label={t("tasks.assignee")}>
        {who ?? "—"}
      </td>
    </tr>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  n,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  n: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors max-md:min-h-11",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );
}
