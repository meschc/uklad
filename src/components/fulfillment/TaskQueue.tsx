import { useMemo } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  ListChecks,
  Package,
  Split,
  Truck,
  Wrench,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey, type TFunc } from "@/lib/i18n";
import { taskQueue, type QueueGroup, type QueueItem, type QueueProcess } from "@/lib/taskQueue";
import type { AppView, DisputeKind, ServiceKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { useNow } from "@/components/workstation/useNow";
import { EmptyState } from "./ScreenShell";
import { useServiceName } from "./useServiceName";

/** Сколько строк процесса видно сразу: дальше — «ещё N», полный список у процесса. */
const SHOWN = 5;

const ICON: Record<QueueProcess, typeof Inbox> = {
  receiving: Inbox,
  picking: ClipboardList,
  packing: Package,
  sorting: Split,
  shipping: Truck,
  inventory: ListChecks,
  work: Wrench,
  approvals: ClipboardCheck,
};

/** Единица «сколько» у процесса: штуки, посылки или заявки. */
const UNITS: Record<QueueProcess, MsgKey> = {
  receiving: "queue.units.pcs",
  picking: "queue.units.pcs",
  packing: "queue.units.pcs",
  sorting: "queue.units.parcels",
  shipping: "queue.units.orders",
  inventory: "queue.units.pcs",
  work: "queue.units.qty",
  approvals: "queue.units.pcs",
};

/** Подпись, когда в данных пусто: поставка без названия, заявка без назначения. */
const NO_LABEL: Record<QueueProcess, MsgKey> = {
  receiving: "queue.noLabel.receiving",
  picking: "tasks.noTarget",
  packing: "queue.noLabel.tote",
  sorting: "tasks.noTarget",
  shipping: "tasks.noTarget",
  inventory: "queue.noLabel.packing",
  work: "queue.noLabel.packing",
  approvals: "queue.noLabel.packing",
};

/** Куда ведёт процесс в кабинете. Упаковку, сортировку и погрузку ведёт стол. */
type Open = { view: AppView } | { section: "requests" | "work" };
const OPEN: Partial<Record<QueueProcess, Open>> = {
  receiving: { view: "receiving" },
  picking: { section: "requests" },
  work: { section: "work" },
  approvals: { view: "approvals" },
};

/** Сколько ждёт: минуты, часы, дни — крупнее не нужно. */
function waited(t: TFunc, ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return t("queue.wait.min", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("queue.wait.h", { n: h });
  return t("queue.wait.d", { n: Math.floor(h / 24) });
}

/**
 * «Очередь» в «Заданиях»: что ждёт склад по всем процессам, одним экраном.
 * Руководитель видит, где копится работа, и уходит в процесс, у которого есть
 * свой экран; у стола (упаковка, сортировка, погрузка, пересчёт) очередь та же
 * — сотрудник получает её после бейджа.
 */
export function TaskQueue({ onSection }: { onSection: (s: "requests" | "work") => void }) {
  const t = useT();
  const now = useNow(60_000);
  const expectedShipments = useEditor((s) => s.expectedShipments);
  const requests = useEditor((s) => s.requests);
  const boxes = useEditor((s) => s.boxes);
  const outboundBoxes = useEditor((s) => s.outboundBoxes);
  const tasks = useEditor((s) => s.tasks);
  const disputes = useEditor((s) => s.disputes);
  const receiving = useEditor((s) => s.receiving);

  const groups = useMemo(
    () =>
      taskQueue(
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

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="size-5" />}
        title={t("queue.emptyTitle")}
        body={t("queue.emptyBody")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <QueueSection key={g.process} group={g} now={now} onSection={onSection} />
      ))}
    </div>
  );
}

function QueueSection({
  group,
  now,
  onSection,
}: {
  group: QueueGroup;
  now: number;
  onSection: (s: "requests" | "work") => void;
}) {
  const t = useT();
  const goToView = useEditor((s) => s.goToView);
  const Icon = ICON[group.process];
  const open = OPEN[group.process];
  const rest = group.items.length - SHOWN;
  return (
    <section className="flex flex-col gap-2" aria-label={t(`queue.process.${group.process}`)}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className={eyebrow({ tone: "current" })}>{t(`queue.process.${group.process}`)}</h2>
        <span className="text-xs text-muted-foreground">{group.items.length}</span>
        {open && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => ("view" in open ? goToView(open.view) : onSection(open.section))}
          >
            {t("queue.open")}
            <ArrowRight className="size-3.5" />
          </Button>
        )}
      </div>
      <ul className="flex flex-col">
        {group.items.slice(0, SHOWN).map((item) => (
          <QueueRow key={item.key} process={group.process} item={item} now={now} />
        ))}
      </ul>
      {rest > 0 && <p className="text-xs text-muted-foreground">{t("queue.more", { n: rest })}</p>}
    </section>
  );
}

function QueueRow({ process, item, now }: { process: QueueProcess; item: QueueItem; now: number }) {
  const t = useT();
  const svcName = useServiceName();
  const staff = useEditor((s) => s.warehouse.staff);
  const who = item.staffId ? staff?.find((p) => p.id === item.staffId)?.name : undefined;
  const label =
    process === "work" && item.label
      ? svcName(item.label as ServiceKind)
      : process === "approvals" && item.label
        ? t(`disputes.kind.${item.label as DisputeKind}`)
        : (item.label ?? t(NO_LABEL[process]));
  return (
    <li className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-3 sm:gap-x-4 gap-y-0.5 border-t border-border/60 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_8rem_10rem]">
      <span className="col-span-3 font-medium sm:col-span-1 sm:truncate">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        {item.units > 0 ? t(UNITS[process], { n: item.units }) : "—"}
      </span>
      <span className="text-xs text-muted-foreground">
        {process === "inventory"
          ? t("queue.notCounted", { d: waited(t, now - item.since) })
          : t("queue.waits", { d: waited(t, now - item.since) })}
      </span>
      <span className={cn("text-xs", item.active ? "text-primary" : "text-muted-foreground")}>
        {who ?? (item.active ? t("queue.active") : t("queue.waiting"))}
      </span>
    </li>
  );
}
