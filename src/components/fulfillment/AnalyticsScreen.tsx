import { useMemo } from "react";
import { AlertTriangle, ClipboardList, Gauge, PackagePlus, Timer, Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  formatDuration,
  occupancyStats,
  receivingStats,
  requestStats,
  storageCost,
} from "@/lib/fulfillment";
import { useT } from "@/lib/i18n";
import { eyebrow } from "@/components/ui/eyebrow";
import { card } from "@/components/ui/card";
import { ScreenShell } from "./ScreenShell";
import { BarChart, Donut, FillBar, StatCard } from "./charts";

/**
 * Дашборд склада (п.9). Считаем только то, что реально есть в сторе после
 * приёмки и сборки — ничего не выдумываем. Занятость берём из общего
 * `occupancyStats`, который стоит на том же `allCells`, что и тепловая карта:
 * второй версии расчёта в проекте быть не должно.
 */
/** Период, за который считаем стоимость хранения (тот же, что у приёмки). */
const STORAGE_PERIOD_DAYS = 14;

export function AnalyticsScreen() {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const events = useEditor((s) => s.receivingEvents);
  const requests = useEditor((s) => s.requests);
  const shipments = useEditor((s) => s.expectedShipments);
  // Рейсы = сколько раз машина уехала со склада.
  const trips = useEditor((s) => s.shipments).length;

  const occ = useMemo(
    () => occupancyStats(warehouse, placements, boxes),
    [warehouse, placements, boxes],
  );
  const recv = useMemo(() => receivingStats(events), [events]);
  const req = useMemo(() => requestStats(requests), [requests]);

  const cost = storageCost(occ.occupied, warehouse.storageRatePerCell, STORAGE_PERIOD_DAYS);
  const openShipments = shipments.filter((s) => s.status !== "closed").length;
  const discPct = Math.round(recv.discrepancyShare * 100);
  // Доля частично закрытых считается от ВСЕХ собранных заявок — и тех, что
  // ещё стоят на складе, и тех, что уже уехали. `req.partial` считается по
  // тому же множеству; делить только на «собрана» значило бы получить долю
  // больше 100%, как только часть заявок отгрузили.
  const pickedTotal = req.done + req.shipped;
  const partialPct = pickedTotal ? Math.round((req.partial / pickedTotal) * 100) : 0;

  return (
    <ScreenShell title={t("an.title")} subtitle={t("an.subtitle")} wide>
      {/* Верхний ряд: четыре числа, отвечающие на четыре разных вопроса */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={<Gauge className="size-3" />}
          label={t("an.fill")}
          value={`${Math.round(occ.fill * 100)}%`}
          hint={t("an.fillHint", { used: occ.occupied, total: occ.cells })}
          tone={occ.fill > 0.9 ? "warn" : "neutral"}
        />
        <StatCard
          icon={<PackagePlus className="size-3" />}
          label={t("an.received")}
          value={recv.units}
          hint={t("an.receivedHint", { n: recv.events })}
        />
        <StatCard
          icon={<AlertTriangle className="size-3" />}
          label={t("an.discrepancy")}
          value={`${discPct}%`}
          hint={t("an.discrepancyHint", {
            short: recv.shortage,
            over: recv.overage,
          })}
          tone={discPct > 15 ? "bad" : discPct > 0 ? "warn" : "good"}
        />
        <StatCard
          icon={<Timer className="size-3" />}
          label={t("an.pickTime")}
          value={formatDuration(req.avgPickMs, t.lang)}
          hint={t("an.pickTimeHint", { n: partialPct })}
        />
        {/* Вывоз: сколько уехало и сколько собрано, но ещё стоит на складе —
            это разные вещи, и «ждёт погрузки» важнее всего для начальника. */}
        <StatCard
          icon={<Truck className="size-3" />}
          label={t("an.shipped")}
          value={req.shipped}
          hint={t("an.shippedHint", { n: trips, waiting: req.done })}
          tone={req.done > 0 ? "warn" : "neutral"}
        />
      </div>

      {/* Приёмка за период */}
      <section className={card({ className: "flex flex-col gap-3" })}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">{t("an.receivingTitle")}</h2>
          <p className="text-[11px] text-muted-foreground">{t("an.receivingSubtitle")}</p>
        </div>
        <BarChart data={recv.byDay} emptyLabel={t("an.noReceiving")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label={t("an.events")} value={recv.events} />
          <MiniStat label={t("an.units")} value={recv.units} />
          <MiniStat
            label={t("an.shortage")}
            value={recv.shortage}
            tone={recv.shortage ? "warn" : undefined}
          />
          <MiniStat
            label={t("an.overage")}
            value={recv.overage}
            tone={recv.overage ? "warn" : undefined}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Заявки продавца */}
        <section className={card({ className: "flex flex-col gap-3" })}>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <ClipboardList className="size-3.5 text-muted-foreground" />
            {t("an.requestsTitle")}
          </h2>
          <Donut
            centerValue={requests.length}
            centerLabel={t("an.total")}
            segments={[
              {
                label: t("req.status.new"),
                value: req.new,
                color: "hsl(38 92% 55%)",
              },
              {
                label: t("req.status.in_progress"),
                value: req.inProgress,
                color: "hsl(var(--primary))",
              },
              {
                label: t("req.status.done"),
                value: req.done,
                color: "hsl(152 60% 45%)",
              },
              {
                label: t("req.status.shipped"),
                value: req.shipped,
                color: "hsl(200 80% 50%)",
              },
              {
                label: t("req.status.cancelled"),
                value: req.cancelled,
                color: "hsl(var(--muted-foreground))",
              },
            ]}
          />
          <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
            <Row label={t("an.leadTime")} value={formatDuration(req.avgLeadMs, t.lang)} />
            <Row label={t("an.pickTimeShort")} value={formatDuration(req.avgPickMs, t.lang)} />
            <Row label={t("an.partialShare")} value={`${partialPct}% (${req.partial})`} />
            <Row label={t("an.openShipments")} value={openShipments} />
          </dl>
        </section>

        {/* Занятость по этажам */}
        <section className={card({ className: "flex flex-col gap-3" })}>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Gauge className="size-3.5 text-muted-foreground" />
            {t("an.occupancyTitle")}
          </h2>
          <div className="flex flex-col gap-2.5">
            {occ.byFloor.map((f) => (
              <FillBar key={f.floorId} label={f.name} value={f.occupied} total={f.cells} />
            ))}
          </div>
          {/* Стоимость хранения (п.10.5): занятые ячейки × тариф × дни.
              Сознательно узкая метрика — не бухгалтерия. */}
          <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">
                {t("an.storageCost", { d: STORAGE_PERIOD_DAYS })}
              </dt>
              <dd className="font-medium tabular-nums">
                {cost == null
                  ? t("an.storageNoRate")
                  : t("an.money", { n: Math.round(cost).toLocaleString(t.lang) })}
              </dd>
            </div>
            {cost != null && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t("an.storageRate")}</dt>
                <dd className="tabular-nums text-muted-foreground">
                  {t("an.storageRateValue", { n: warehouse.storageRatePerCell ?? 0 })}
                </dd>
              </div>
            )}
          </dl>
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
            {t("an.occupancyNote")}
            {cost == null ? ` ${t("an.storageHint")}` : ""}
          </p>
        </section>
      </div>
    </ScreenShell>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className={eyebrow({ size: "xs", weight: "normal" })}>{label}</div>
      <div
        className={
          tone === "warn"
            ? "text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400"
            : "text-lg font-bold tabular-nums"
        }
      >
        {value}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
