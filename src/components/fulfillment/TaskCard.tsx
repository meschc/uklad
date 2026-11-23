import { useMemo } from "react";
import { ArrowRight, Check, FileText, Play, RotateCcw, UserCheck, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { myStaffId, serviceSpec } from "@/lib/operations";
import type { TaskListRow } from "@/lib/taskList";
import type { AppView, DisputeKind, ServiceKind, WarehouseTask } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { eyebrow } from "@/components/ui/eyebrow";
import { RequestGroupCard } from "./RequestGroupCard";
import { useServiceName } from "./useServiceName";

/**
 * Карточка любого задания — одна панель справа на все процессы (Кирилл
 * 22.11: «карточка любого задания в панели справа»). Внутри — то, что можно
 * сделать с заданием здесь (сборка: заявки назначения; работа склада: взять,
 * переназначить, начать, закончить), и «Документы» — сквозной блок: листы и
 * накладные, которые связаны с этим заданием. Процессы со своим экраном
 * (приёмка, подтверждения) ведут туда кнопкой, а упаковку, сортировку,
 * погрузку и пересчёт делает стол — карточка говорит об этом прямо.
 */

/** Куда ведёт процесс в кабинете. */
const OPEN: Partial<Record<TaskListRow["process"], AppView>> = {
  receiving: "receiving",
  approvals: "approvals",
};

const AT_DESK = new Set<TaskListRow["process"]>(["packing", "sorting", "shipping", "inventory"]);

/** Название задания: вид работы и спорного — словами, остальное — из данных. */
export function useTaskTitle(): (row: TaskListRow) => string {
  const t = useT();
  const svcName = useServiceName();
  return (row) =>
    row.process === "work" && row.label
      ? svcName(row.label as ServiceKind)
      : row.process === "approvals" && row.label
        ? t(`disputes.kind.${row.label as DisputeKind}`)
        : (row.label ?? t(NO_LABEL[row.process]));
}

/** Подпись, когда в данных пусто: поставка без названия, заявка без назначения. */
const NO_LABEL: Record<TaskListRow["process"], MsgKey> = {
  receiving: "queue.noLabel.receiving",
  picking: "tasks.noTarget",
  packing: "queue.noLabel.tote",
  sorting: "tasks.noTarget",
  shipping: "tasks.noTarget",
  inventory: "queue.noLabel.packing",
  work: "queue.noLabel.packing",
  approvals: "queue.noLabel.packing",
};

export function TaskCard({ row, onClose }: { row: TaskListRow; onClose: () => void }) {
  const t = useT();
  const goToView = useEditor((s) => s.goToView);
  const title = useTaskTitle()(row);
  const open = OPEN[row.process];
  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="min-w-0">
          <p className={eyebrow({ tone: "muted", size: "xs" })}>
            {t(`queue.process.${row.process}`)}
          </p>
          <h2 className="break-words text-base font-semibold">{title}</h2>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label={t("tasks.card.close")} onClick={onClose}>
          <X />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4">
        {row.process === "picking" ? (
          <RequestGroupCard target={row.label} closed={row.status === "done"} />
        ) : row.process === "work" ? (
          <WorkTaskBody taskId={row.key} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {AT_DESK.has(row.process) ? t("tasks.card.atDesk") : t("tasks.card.hasScreen")}
          </p>
        )}
        {open && (
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onClose();
                goToView(open);
              }}
            >
              {t("queue.open")}
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        )}
        <TaskDocuments row={row} onClose={onClose} />
      </div>
    </DialogShell>
  );
}

/**
 * Документы задания — одним блоком в любой карточке. Откуда берутся ссылки:
 * приёмка → лист приёмки поставки; сборка → лист сборки назначения и накладные
 * рейсов уехавших заявок. У остальных заданий документа нет — блока нет.
 */
function TaskDocuments({ row, onClose }: { row: TaskListRow; onClose: () => void }) {
  const t = useT();
  const openDoc = useEditor((s) => s.openDoc);
  const requests = useEditor((s) => s.requests);
  const trips = useEditor((s) => s.shipments);
  const docs = useMemo(() => {
    const out: { kind: "pick" | "receiving" | "shipment"; id: string; label: MsgKey }[] = [];
    if (row.process === "receiving") {
      out.push({ kind: "receiving", id: row.key, label: "doc.kind.receiving" });
    }
    if (row.process === "picking") {
      const target = row.label;
      if (row.status !== "done" && target) {
        out.push({ kind: "pick", id: target, label: "doc.kind.pick" });
      }
      const ids = new Set(
        requests.filter((r) => (r.note?.trim() || null) === target).map((r) => r.id),
      );
      for (const trip of trips) {
        if (trip.requestIds.some((id) => ids.has(id))) {
          out.push({ kind: "shipment", id: trip.id, label: "doc.kind.shipment" });
        }
      }
    }
    return out;
  }, [row, requests, trips]);
  if (docs.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={t("tasks.card.docs")}>
      <h3 className={eyebrow({ tone: "muted", size: "xs" })}>{t("tasks.card.docs")}</h3>
      <div className="flex flex-wrap gap-2">
        {docs.map((d) => (
          <Button
            key={`${d.kind}:${d.id}`}
            size="sm"
            variant="outline"
            onClick={() => {
              onClose();
              openDoc(d.kind, d.id);
            }}
          >
            <FileText />
            {t(d.label)}
          </Button>
        ))}
      </div>
    </section>
  );
}

function WorkTaskBody({ taskId }: { taskId: string }) {
  const t = useT();
  const task = useEditor((s) => s.tasks.find((x) => x.id === taskId));
  const settings = useEditor((s) => s.serviceSettings);
  const staff = useEditor((s) => s.warehouse.staff);
  const partners = useEditor((s) => s.warehouse.partners);
  const user = useEditor((s) => s.session.user);
  const setTaskStatus = useEditor((s) => s.setTaskStatus);
  const updateTask = useEditor((s) => s.updateTask);
  const me = myStaffId(staff, user);
  if (!task) return <p className="text-sm text-muted-foreground">{t("tasks.card.gone")}</p>;
  const active = task.status === "open" || task.status === "in_progress";
  const unit = serviceSpec(task.kind, settings)?.unit ?? "unit";
  const partner = partners?.find((p) => p.id === task.partnerId)?.name;
  const set = (st: WarehouseTask["status"]) => setTaskStatus(task.id, st);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{t("ops.task.qty")}</dt>
        <dd className="tabular-nums">
          {task.qty} {t(`ops.unit.${unit}` as MsgKey)}
        </dd>
        <dt className="text-muted-foreground">{t("tasks.card.status")}</dt>
        <dd>{t(`ops.task.status.${task.status}` as MsgKey)}</dd>
        {partner && (
          <>
            <dt className="text-muted-foreground">{t("ops.task.partner")}</dt>
            <dd>{partner}</dd>
          </>
        )}
        {task.note && (
          <>
            <dt className="text-muted-foreground">{t("ops.task.note")}</dt>
            <dd className="break-words">{task.note}</dd>
          </>
        )}
      </dl>
      {active && (
        <div className="flex flex-col gap-2">
          <span className={eyebrow({ weight: "medium" })}>{t("tasks.assignee")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-56"
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
            </Select>
            {/* «Взять себе» — одной кнопкой, без поиска себя в списке (Кирилл 12 ноя). */}
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
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {task.status === "open" && (
          <Button size="sm" variant="outline" onClick={() => set("in_progress")}>
            <Play /> {t("ops.task.start")}
          </Button>
        )}
        {active && (
          <>
            <Button size="sm" onClick={() => set("done")}>
              <Check /> {t("ops.task.done")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => set("cancelled")}
            >
              <X /> {t("ops.task.cancel")}
            </Button>
          </>
        )}
        {!active && (
          <Button size="sm" variant="ghost" onClick={() => set("open")}>
            <RotateCcw /> {t("ops.task.reopen")}
          </Button>
        )}
      </div>
    </div>
  );
}
