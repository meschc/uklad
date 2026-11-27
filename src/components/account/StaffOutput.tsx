import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { selectRole, useEditor } from "@/lib/store";
import { useWithArchive } from "@/lib/store/archive";
import { staffReport, staffReportCsv, type StaffOutput as OutputRow } from "@/lib/staffReport";
import { PayPanel } from "./PayPanel";
import { staffWorkload } from "@/lib/fulfillment";
import { startOfDay, startOfMonth } from "@/lib/workstation";
import { currentProcess } from "@/lib/staffProcess";
import { formatTime } from "@/components/workstation/useNow";
import type { WorkstationKind } from "@/lib/types";
import { BOM } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SortTh, useDataTable } from "@/components/ui/data-table";
import { Table, TableHeader, Tr, Td } from "@/components/ui/table";

/**
 * Вкладка «Выработка»: часы, простой, пики, ошибки и брак по людям за период и
 * выгрузка для зарплаты. Считает `staffReport` из журнала смен; оплаты по
 * пикам нет намеренно — склад считает её сам по выгрузке.
 */
type Period = "today" | "week" | "month" | "prevMonth";

const DAY = 86_400_000;

function periodRange(p: Period, now: number): [number, number] {
  if (p === "today") return [startOfDay(now), now + 1];
  if (p === "week") return [startOfDay(now) - 6 * DAY, now + 1];
  const month = startOfMonth(now);
  if (p === "month") return [month, now + 1];
  return [startOfMonth(month - 1), month];
}

const hoursText = (ms: number) => (ms / 3_600_000).toFixed(1);
const money = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;
/** Всё, что прибавляется к ставке: ночные, праздничные, премии, надбавки. */
const plusOf = (r: OutputRow) => (r.nightPay ?? 0) + (r.holidayPay ?? 0) + r.bonus + r.allowance;

const STATIONS: WorkstationKind[] = [
  "receiving",
  "picking",
  "pack",
  "sorting",
  "marking",
  "returns",
  "shipping",
];

export function StaffOutput() {
  const t = useT();
  const staff = useEditor((s) => s.warehouse.staff ?? []);
  const warehouseName = useEditor((s) => s.warehouse.name);
  const events = useWithArchive("staffEvents");
  const [period, setPeriod] = useState<Period>("month");
  // «Сейчас» фиксируем при выборе периода: таблица не должна дёргаться на
  // каждом рендере, а свежие события подтянет смена вкладки или периода.
  const [now, setNow] = useState(() => Date.now());
  const [from, to] = periodRange(period, now);
  const policy = useEditor((s) => s.breakPolicy);
  const adjustments = useEditor((s) => s.payAdjustments);
  const rows = useMemo(
    () => staffReport(events, staff, from, to, policy, adjustments),
    [events, staff, from, to, policy, adjustments],
  );
  // Приёмка и рейсы за тот же период — по фактам приёмки и отгрузки (их
  // перенесли сюда из списка сотрудников, Кирилл 13.11).
  const receipts = useWithArchive("receivingEvents");
  const trips = useWithArchive("shipments");
  const workload = useMemo(
    () =>
      staffWorkload(
        receipts.filter((e) => e.timestamp >= from && e.timestamp < to),
        trips.filter((s) => s.shippedAt >= from && s.shippedAt < to),
      ),
    [receipts, trips, from, to],
  );
  const table = useDataTable(rows, [
    { id: "name", value: (r) => r.name },
    { id: "hours", value: (r) => r.workedMs },
    { id: "idle", value: (r) => r.idleMs },
    { id: "peaks", value: (r) => r.packed + r.picked },
    { id: "errors", value: (r) => r.errors },
    { id: "rejects", value: (r) => r.rejects },
    { id: "reprints", value: (r) => r.reprints },
    { id: "receipts", value: (r) => workload.get(r.staffId)?.units ?? 0 },
    { id: "trips", value: (r) => workload.get(r.staffId)?.trips ?? 0 },
    { id: "earned", value: (r) => r.earned ?? -1 },
    { id: "plus", value: (r) => plusOf(r) },
    { id: "minus", value: (r) => r.deduction },
    { id: "toPay", value: (r) => r.toPay ?? -1 },
  ]);
  // Панель оплаты сотрудника справа: из чего «к выплате» и корректировки.
  const [panel, setPanel] = useState<string | null>(null);
  const panelRow = rows.find((r) => r.staffId === panel);
  // Корректировки пишет только «Персонал»; смотрящий видит суммы на чтение.
  const canEdit = useEditor((s) => s.session.readOnly !== true && selectRole(s) !== "seller");

  const exportCsv = () => {
    const blob = new Blob([`${BOM}${staffReportCsv(rows)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    a.download = `vyrabotka-${warehouseName}-${day(from)}_${day(to - 1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Period>
          size="sm"
          ariaLabel={t("staff.out.period")}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setNow(Date.now());
          }}
          options={[
            { value: "today", label: t("staff.out.today") },
            { value: "week", label: t("staff.out.week") },
            { value: "month", label: t("staff.out.month") },
            { value: "prevMonth", label: t("staff.out.prevMonth") },
          ]}
        />
        <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={exportCsv}>
          <Download className="size-3.5" />
          {t("staff.out.export")}
        </Button>
      </div>
      <p className="max-w-2xl text-xs text-muted-foreground">{t("staff.out.lead")}</p>
      <Table>
        <TableHeader>
          <SortTh table={table.table} id="name">
            {t("staff.col.name")}
          </SortTh>
          <SortTh table={table.table} id="hours" align="right">
            {t("staff.out.hours")}
          </SortTh>
          <SortTh table={table.table} id="idle" align="right">
            {t("staff.out.idle")}
          </SortTh>
          <SortTh table={table.table} id="peaks" align="right">
            {t("staff.out.peaks")}
          </SortTh>
          <SortTh table={table.table} id="errors" align="right">
            {t("staff.out.errors")}
          </SortTh>
          <SortTh table={table.table} id="rejects" align="right">
            {t("staff.out.rejects")}
          </SortTh>
          <SortTh table={table.table} id="reprints" align="right">
            {t("staff.out.reprints")}
          </SortTh>
          <SortTh table={table.table} id="receipts" align="right">
            {t("staff.wlUnits")}
          </SortTh>
          <SortTh table={table.table} id="trips" align="right">
            {t("staff.wlTrips")}
          </SortTh>
          <SortTh table={table.table} id="earned" align="right">
            {t("staff.out.earned")}
          </SortTh>
          <SortTh table={table.table} id="plus" align="right">
            {t("staff.out.plus")}
          </SortTh>
          <SortTh table={table.table} id="minus" align="right">
            {t("staff.out.minus")}
          </SortTh>
          <SortTh table={table.table} id="toPay" align="right">
            {t("pay.toPay")}
          </SortTh>
        </TableHeader>
        <tbody>
          {table.rows.map((r) => (
            <Tr key={r.staffId}>
              <Td>
                <button
                  type="button"
                  className="text-left font-medium hover:text-primary hover:underline"
                  onClick={() => setPanel(r.staffId)}
                >
                  {r.name}
                </button>
                <p className="text-xs text-muted-foreground">{r.role}</p>
                {(() => {
                  // Участок сам следует за человеком: где последний скан или
                  // отметка в открытой смене, там он и сейчас.
                  const cur = currentProcess(events, r.staffId);
                  return cur ? (
                    <p className="text-xs text-primary">
                      {t("staff.out.now", {
                        station: t(`ws.station.${cur.station}`),
                        time: formatTime(cur.since, t.lang),
                      })}
                    </p>
                  ) : null;
                })()}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.hours")}>
                {hoursText(r.workedMs)}
                {STATIONS.filter((k) => (r.byStation[k] ?? 0) > 0).map((k) => (
                  <span key={k} className="block text-xs text-muted-foreground">
                    {t(`ws.station.${k}`)} {hoursText(r.byStation[k] ?? 0)}
                  </span>
                ))}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.idle")}>
                {hoursText(r.idleMs)}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.peaks")}>
                {r.packed + r.picked}
                <span className="block text-xs text-muted-foreground">
                  {t("staff.out.split", { pack: r.packed, pick: r.picked })}
                </span>
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.errors")}>
                {r.errors}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.rejects")}>
                {r.rejects}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.reprints")}>
                {r.reprints}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.wlUnits")}>
                {workload.get(r.staffId)?.units ?? 0}
                <span className="block text-xs text-muted-foreground">
                  {t("staff.wlReceiptsN", { n: workload.get(r.staffId)?.receipts ?? 0 })}
                </span>
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.wlTrips")}>
                {workload.get(r.staffId)?.trips ?? 0}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.earned")}>
                {r.earned == null ? "—" : `${r.earned.toLocaleString("ru-RU")} ₽`}
                {r.earned != null && (
                  <span className="block text-xs text-muted-foreground">
                    {t("staff.out.paidHours", { h: hoursText(r.paidMs) })}
                  </span>
                )}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.plus")}>
                {plusOf(r) > 0 ? `+${money(plusOf(r))}` : "—"}
                {(r.nightPay ?? 0) > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {t("staff.out.nightShort", { h: hoursText(r.nightMs) })}
                  </span>
                )}
              </Td>
              <Td className="text-right tabular-nums" data-label={t("staff.out.minus")}>
                {r.deduction > 0 ? (
                  <span className="text-destructive">−{money(r.deduction)}</span>
                ) : (
                  "—"
                )}
              </Td>
              <Td className="text-right" data-label={t("pay.toPay")}>
                <button
                  type="button"
                  className="font-semibold tabular-nums hover:text-primary hover:underline"
                  onClick={() => setPanel(r.staffId)}
                >
                  {r.toPay == null ? "—" : money(r.toPay)}
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {panelRow && (
        <PayPanel
          row={panelRow}
          from={from}
          to={to}
          canEdit={canEdit}
          onClose={() => setPanel(null)}
        />
      )}
    </section>
  );
}
