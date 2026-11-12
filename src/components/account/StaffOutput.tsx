import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useWithArchive } from "@/lib/store/archive";
import { staffReport, staffReportCsv } from "@/lib/staffReport";
import { startOfDay, startOfMonth } from "@/lib/workstation";
import { currentProcess } from "@/lib/staffProcess";
import { formatTime } from "@/components/workstation/useNow";
import type { WorkstationKind } from "@/lib/types";
import { BOM } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SortTh, useDataTable } from "@/components/ui/data-table";

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

const STATIONS: WorkstationKind[] = [
  "receiving",
  "picking",
  "pack",
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
  const rows = useMemo(() => staffReport(events, staff, from, to), [events, staff, from, to]);
  const table = useDataTable(rows, [
    { id: "name", value: (r) => r.name },
    { id: "hours", value: (r) => r.workedMs },
    { id: "idle", value: (r) => r.idleMs },
    { id: "peaks", value: (r) => r.packed + r.picked },
    { id: "errors", value: (r) => r.errors },
    { id: "rejects", value: (r) => r.rejects },
    { id: "earned", value: (r) => r.earned ?? -1 },
  ]);

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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border text-left">
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
              <SortTh table={table.table} id="earned" align="right">
                {t("staff.out.earned")}
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.staffId} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <p className="font-medium">{r.name}</p>
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
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {hoursText(r.workedMs)}
                  {STATIONS.filter((k) => (r.byStation[k] ?? 0) > 0).map((k) => (
                    <span key={k} className="block text-xs text-muted-foreground">
                      {t(`ws.station.${k}`)} {hoursText(r.byStation[k] ?? 0)}
                    </span>
                  ))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{hoursText(r.idleMs)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.packed + r.picked}
                  <span className="block text-xs text-muted-foreground">
                    {t("staff.out.split", { pack: r.packed, pick: r.picked })}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.errors}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.rejects}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.earned == null ? "—" : `${r.earned.toLocaleString("ru-RU")} ₽`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
