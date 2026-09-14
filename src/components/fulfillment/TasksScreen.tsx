import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ClipboardList,
  List,
  MapPin,
  Play,
  ScanLine,
  Truck,
  X,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { requestsRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { formatAddress } from "@/lib/address";
import { groupRequestsByTarget, stockByProduct } from "@/lib/fulfillment";
import type { RequestStatus } from "@/lib/types";
import { useT, type TFunc } from "@/lib/i18n";
import { cn, nowMs } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { ScreenShell, EmptyState } from "./ScreenShell";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { ShipDialog } from "./ShipDialog";
import { RequestCalendar } from "./RequestCalendar";

/**
 * «Задания» (п.7.3) — общий обзор заявок продавца во ВСЕХ статусах, включая
 * выполненные. Рабочий экран для того, что уже «в работе», — «Сборка»: здесь
 * кладовщик только видит картину и берёт заявку в работу.
 *
 * Группировка по назначению (п.5): одна машина увозит всё, что адресовано
 * одному получателю, поэтому «что едет вместе» — это назначение, а дата только
 * говорит когда. Внутри группы даты отгрузки видны в шапке, а просроченные
 * подсвечиваются.
 */

// Порядок = путь заявки: ждёт → собирается → собрана → уехала → отменена.
const STATUS_ORDER: RequestStatus[] = ["new", "in_progress", "done", "shipped", "cancelled"];

export function TasksScreen() {
  const requests = useEditor((s) => s.requests);
  const products = useEditor((s) => s.products);
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const showToast = useEditor((s) => s.showToast);
  const goToView = useEditor((s) => s.goToView);
  const t = useT();

  // Смена статуса идёт через репозиторий (п.3.2.1). Здесь нет формы, которую
  // жалко потерять, и нет окна, куда встало бы сообщение, — поэтому отказ
  // показываем тостом, а кнопки на время команды заняты: с сетью двойное
  // «взять в работу» по одной заявке — обычное дело.
  const status = useCommand((id: string, next: RequestStatus) =>
    requestsRepository.setStatus(id, next),
  );
  const setStatus = async (id: string, next: RequestStatus) => {
    const res = await status.run(id, next);
    if (!res.ok) showToast(res.error);
  };

  const [filter, setFilter] = useState<RequestStatus | "all">("all");
  // Заявки, которые грузим в машину прямо сейчас (открытый диалог отгрузки).
  const [shipping, setShipping] = useState<string[] | null>(null);
  // Список или календарь (п.10.4) — одни и те же заявки, разный взгляд.
  const [view, setView] = useState<"list" | "calendar">("list");
  const [day, setDay] = useState<number | null>(null);

  const stock = useMemo(() => stockByProduct(placements, boxes), [placements, boxes]);

  const visible = requests
    .filter((r) => filter === "all" || r.status === filter)
    // Выбранный в календаре день сужает тот же список, а не открывает второй.
    .filter((r) => day == null || (r.truckDate != null && sameDay(r.truckDate, day)));

  // Внутри группы сначала то, что ждёт работы: сортируем ДО группировки —
  // группировка порядок сохраняет.
  const groups = useMemo(
    () =>
      groupRequestsByTarget(
        [...visible].sort(
          (x, y) =>
            STATUS_ORDER.indexOf(x.status) - STATUS_ORDER.indexOf(y.status) ||
            y.createdAt - x.createdAt,
        ),
      ),
    [visible],
  );

  const counts = STATUS_ORDER.map((s) => ({
    status: s,
    n: requests.filter((r) => r.status === s).length,
  }));

  return (
    <ScreenShell
      title={t("tasks.title")}
      subtitle={t("tasks.subtitle")}
      wide
      actions={
        <Button size="sm" variant="outline" onClick={() => goToView("picking")}>
          <ScanLine className="size-3.5" />
          {t("tasks.toPicking")}
        </Button>
      }
    >
      {/* Список или календарь: представления одних и тех же заявок (п.10.4).
          self-start — иначе тело ScreenShell (flex-колонка) растянет
          переключатель во всю ширину экрана. */}
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
          {
            value: "calendar" as const,
            label: t("tasks.view.calendar"),
            icon: <CalendarDays />,
          },
        ]}
      />

      {view === "calendar" && (
        <div className={card()}>
          <RequestCalendar requests={requests} selectedDay={day} onPickDay={setDay} />
        </div>
      )}

      {/* Фильтр по статусу */}
      <div className="flex flex-wrap items-center gap-1">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={t("tasks.filter.all")}
          n={requests.length}
        />
        {counts.map((c) => (
          <FilterChip
            key={c.status}
            active={filter === c.status}
            onClick={() => setFilter(c.status)}
            label={t(`tasks.filter.${c.status}`)}
            n={c.n}
          />
        ))}
      </div>

      {requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title={t("tasks.emptyTitle")}
          body={t("tasks.emptyBody")}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.target ?? "—"} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin className="size-3.5 text-muted-foreground" />
                <h2 className={eyebrow({ size: "base", tone: "current" })}>
                  {g.target ?? t("tasks.noTarget")}
                </h2>
                <span className="text-[11px] text-muted-foreground">
                  {t("tasks.groupCount", { n: g.items.length })}
                </span>
                {/* Даты отгрузки — подписью к назначению: их в группе может быть
                    несколько, и просроченную видно сразу. */}
                {g.shipDates.length === 0 ? (
                  <span className="text-[11px] text-muted-foreground">{t("tasks.noShipDate")}</span>
                ) : (
                  g.shipDates.map((d) => (
                    <span
                      key={d}
                      className={cn(
                        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        isOverdue(d)
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <CalendarClock className="size-3" />
                      {t("tasks.shipDate", { d: new Date(d).toLocaleDateString() })}
                      {isOverdue(d) ? ` · ${t("tasks.overdue")}` : ""}
                    </span>
                  ))
                )}
                {/* Погрузка: собранное по этому назначению уезжает одной
                    машиной. Кнопка появляется, только когда есть что грузить. */}
                {(() => {
                  const ready = g.items.filter((r) => r.status === "done");
                  if (!ready.length) return null;
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-7"
                      onClick={() => setShipping(ready.map((r) => r.id))}
                    >
                      <Truck className="size-3.5" />
                      {t("ship.action", { n: ready.length })}
                    </Button>
                  );
                })()}
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">{t("table.col.name")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("tasks.col.qty")}</th>
                      <th className="px-3 py-2 font-medium">{t("tasks.col.where")}</th>
                      <th className="px-3 py-2 font-medium">{t("tasks.col.status")}</th>
                      <th className="w-32 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((r) => {
                      const p = products.find((x) => x.id === r.productId);
                      const have = stock.get(r.productId)?.qty ?? 0;
                      return (
                        <tr key={r.id} className="border-t border-border/60">
                          <td className="px-3 py-2">
                            <div className="font-medium">{p?.name ?? "—"}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {p?.sku}
                            </div>
                            {/* Бронь под поставку: заявку нельзя читать как
                                обычную — товара на складе ещё нет. */}
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {r.reservedShipmentId && (
                                <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                                  {t("req.reservedBadge")}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className={cn(have < r.qty && "text-destructive")}>
                              {r.pickedQty ? `${r.pickedQty}/` : ""}
                              {r.qty}
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              {t("tasks.inStock", { n: have })}
                            </div>
                          </td>
                          {/* Назначение вынесено в шапку группы — в строке
                              остаётся только адрес, если он назначен. */}
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {r.targetAddress ? formatAddress(warehouse, r.targetAddress) : "—"}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={r.status} partial={r.partial} t={t} />
                          </td>
                          <td className="px-3 py-2">
                            {r.status === "new" && (
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={status.pending}
                                  onClick={() => setStatus(r.id, "in_progress")}
                                >
                                  <Play className="size-3" />
                                  {t("tasks.take")}
                                </Button>
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  title={t("tasks.cancel")}
                                  aria-label={t("tasks.cancel")}
                                  disabled={status.pending}
                                  onClick={() => setStatus(r.id, "cancelled")}
                                >
                                  <X className="size-3.5" />
                                </Button>
                              </div>
                            )}
                            {r.status === "in_progress" && (
                              <div className="flex justify-end">
                                <Button size="sm" onClick={() => goToView("picking")}>
                                  <ScanLine className="size-3" />
                                  {t("tasks.pick")}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {shipping && <ShipDialog requestIds={shipping} onClose={() => setShipping(null)} />}
    </ScreenShell>
  );
}

export function StatusBadge({
  status,
  partial,
  t,
}: {
  status: RequestStatus;
  partial?: boolean;
  t: TFunc;
}) {
  const tone: Record<RequestStatus, string> = {
    new: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    in_progress: "bg-primary/10 text-primary",
    done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    // Отгружено — финал пути: спокойный синий, чтобы отличать от «собрано».
    shipped: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
    cancelled: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", tone[status])}
    >
      {t(`req.status.${status}`)}
      {status === "done" && partial ? ` · ${t("req.partial")}` : ""}
    </span>
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
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isOverdue(ts: number): boolean {
  return ts < dayStart(nowMs());
}

function sameDay(a: number, b: number): boolean {
  return dayStart(a) === dayStart(b);
}
