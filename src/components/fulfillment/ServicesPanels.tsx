import { useMemo, useState } from "react";
import { Plus, Receipt, Trash2, X } from "lucide-react";
import { DialogFooter, DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { CustomServiceKind, ServiceUnit } from "@/lib/types";
import { useEditor } from "@/lib/store";
import {
  allServices,
  isCustomKind,
  isServiceOn,
  operationLog,
  serviceReport,
} from "@/lib/operations";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn, nowMs } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { SortTh, useDataTable } from "@/components/ui/data-table";
import { card } from "@/components/ui/card";
import { EmptyState } from "./ScreenShell";
import { useWithArchive } from "@/lib/store/archive";
import { ArchiveNote } from "./ArchiveNote";
import { ReportExport } from "./ReportExport";
import { useServiceName } from "./useServiceName";
import { LIMITS } from "@/lib/numberLimits";
import { Select } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-picker";
import { toIso, type DateRange } from "@/components/ui/dates";

/**
 * Вкладки «Услуги» и «Отчёт» экрана операций. Вынесены отдельно: это
 * настройка и расчёт, а не работа смены, и меняются они по другим причинам.
 */

const money = (n: number, lang: string) =>
  n.toLocaleString(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 2 });

/** Какие операции склад оказывает и почём — по строке на услугу. */
export function ServicesPanel() {
  const t = useT();
  const svcName = useServiceName();
  const settings = useEditor((s) => s.serviceSettings);
  const setEnabled = useEditor((s) => s.setServiceEnabled);
  const setPrice = useEditor((s) => s.setServicePrice);
  const setTwoStage = useEditor((s) => s.setTwoStageReceiving);
  const removeCustom = useEditor((s) => s.removeCustomService);
  const restoreCustom = useEditor((s) => s.restoreCustomService);
  const showToast = useEditor((s) => s.showToast);
  const [adding, setAdding] = useState(false);
  const removeService = (kind: CustomServiceKind) => {
    const service = settings.custom?.find((c) => c.kind === kind);
    removeCustom(kind);
    if (service)
      showToast("ops.custom.removed", { name: service.name }, () => restoreCustom(service));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- флажок внутри подписи */}
      <label className={cn(card({ pad: "md" }), "flex cursor-pointer items-start gap-2.5")}>
        <input
          type="checkbox"
          checked={!!settings.twoStageReceiving}
          onChange={(e) => setTwoStage(e.target.checked)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">{t("ops.services.twoStage")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("ops.services.twoStageHint")}
          </span>
        </span>
      </label>
      {/* Кнопка над списком, форма — панелью справа (Кирилл 13 ноя): так
          действие видно сразу, а не после прокрутки всего каталога. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("ops.services.hint")}</p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> {t("ops.custom.add")}
        </Button>
      </div>
      <ul className={cn(card({ pad: "none" }), "divide-y divide-border")}>
        {allServices(settings).map((s) => {
          const on = isServiceOn(settings, s.kind);
          const unit = t(`ops.unit.${s.unit}` as MsgKey);
          const price = settings.prices?.[s.kind];
          return (
            <li key={s.kind} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              {}
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setEnabled(s.kind, e.target.checked)}
                  className="size-4 accent-primary"
                />
                <span className="text-sm">{svcName(s.kind)}</span>
                {s.auto && (
                  <span className="text-xs text-muted-foreground">{t("ops.services.auto")}</span>
                )}
              </label>
              <Input
                max={LIMITS.money.max}
                type="number"
                min={0}
                step="0.5"
                inputMode="decimal"
                disabled={!on}
                aria-label={t("ops.services.price", { unit })}
                placeholder={t("ops.services.noPrice")}
                // Ключ по цене: после стирания поле должно показать пустоту,
                // а не последнее набранное.
                key={`${s.kind}:${price ?? ""}`}
                defaultValue={price ?? ""}
                onBlur={(e) => {
                  const raw = e.target.value.trim().replace(",", ".");
                  setPrice(s.kind, raw === "" ? null : Number(raw));
                }}
                className="w-28 text-right tabular-nums"
              />
              <span className="w-24 whitespace-nowrap text-xs text-muted-foreground">
                ₽ / {unit}
              </span>
              {isCustomKind(s.kind) ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("ops.custom.remove")}
                  title={t("ops.custom.remove")}
                  onClick={() => isCustomKind(s.kind) && removeService(s.kind)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : (
                <span className="w-8" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
      {adding && <CustomServicePanel onClose={() => setAdding(false)} />}
    </div>
  );
}

const UNITS: ServiceUnit[] = ["unit", "order", "box", "pallet", "cell", "trip", "vehicle"];

/**
 * Своя услуга — название и единица (Кирилл 12 ноя: «это просто поле новое,
 * которое потом можно добавить в задание»). Цена ставится в строке каталога,
 * как у остальных: одно место для всех цен.
 */
function CustomServicePanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const add = useEditor((s) => s.addCustomService);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<ServiceUnit>("unit");
  const ok = name.trim().length >= 2;
  return (
    <DialogShell size="sm" onClose={onClose}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          add(name, unit);
          onClose();
        }}
      >
        <DialogHeader>
          <h2 className="text-sm font-semibold">{t("ops.custom.title")}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("support.close")}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4 p-5">
          <p className="text-sm text-muted-foreground">{t("ops.custom.hint")}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-name">{t("ops.custom.name")}</Label>
            <Input
              id="svc-name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- панель открыта ради этого поля
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="svc-unit">{t("ops.custom.unit")}</Label>
            <Select
              id="svc-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value as ServiceUnit)}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {t(`ops.unit.${u}` as MsgKey)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!ok}>
            <Plus /> {t("ops.custom.add")}
          </Button>
        </DialogFooter>
      </form>
    </DialogShell>
  );
}

type Period = "7" | "30" | "all" | "custom";
const DAY = 24 * 60 * 60 * 1000;

/** Отчёт по услугам за период — основа счёта продавцу. */
export function ReportPanel() {
  const t = useT();
  const svcName = useServiceName();
  const settings = useEditor((s) => s.serviceSettings);
  // Счёт за всё время — с архивом старше 45 дней (`store/archive.ts`).
  const tasks = useWithArchive("tasks");
  const pallets = useEditor((s) => s.pallets);
  const boxes = useEditor((s) => s.boxes);
  const receivingEvents = useWithArchive("receivingEvents");
  const requests = useWithArchive("requests");
  const shipments = useWithArchive("shipments");
  const products = useEditor((s) => s.products);
  const outboundBoxes = useWithArchive("outboundBoxes");
  const partners = useEditor((s) => s.warehouse.partners);
  const [period, setPeriod] = useState<Period>("30");
  // Свой период — календарём (Кирилл 13 ноя): счёт продавцу выставляют за
  // месяц или с даты прошлого счёта, а не «за 30 дней от сегодня».
  const [custom, setCustom] = useState<DateRange>();
  const [partnerId, setPartnerId] = useState("");

  const log = useMemo(
    () =>
      operationLog({
        tasks,
        pallets,
        boxes,
        receivingEvents,
        requests,
        shipments,
        products,
        outboundBoxes,
      }),
    [tasks, pallets, boxes, receivingEvents, requests, shipments, products, outboundBoxes],
  );
  const { report, range, entries } = useMemo(() => {
    const now = nowMs();
    const [from, to] =
      period === "custom" && custom
        ? [new Date(`${custom.from}T00:00`).getTime(), new Date(`${custom.to}T23:59:59`).getTime()]
        : [period === "all" ? 0 : now - Number(period) * DAY, now];
    const pid = partnerId || undefined;
    return {
      report: serviceReport(log, settings, { from, to, partnerId: pid }),
      range: { from, to },
      // Те же операции, что попали в отчёт: окно, продавец и только включённые услуги.
      entries: log.filter(
        (e) =>
          e.at >= from &&
          e.at <= to &&
          (!pid || e.partnerId === pid) &&
          isServiceOn(settings, e.kind),
      ),
    };
  }, [log, settings, period, custom, partnerId]);
  const repTable = useDataTable(report.rows, [
    { id: "service", value: (r) => svcName(r.kind) },
    { id: "qty", value: (r) => r.qty },
    { id: "price", value: (r) => r.price },
    { id: "sum", value: (r) => r.sum },
  ]);

  return (
    <div className="flex flex-col gap-4">
      {period === "all" && <ArchiveNote />}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="md"
          value={period === "custom" ? ("" as Period) : period}
          onChange={setPeriod}
          options={[
            { value: "7", label: t("ops.report.period.7") },
            { value: "30", label: t("ops.report.period.30") },
            { value: "all", label: t("ops.report.period.all") },
          ]}
        />
        <DateRangePicker
          value={custom}
          active={period === "custom"}
          onChange={(r) => {
            setCustom(r);
            setPeriod("custom");
          }}
          lang={t.lang}
          max={toIso(new Date())}
          placeholder={t("ops.report.period.custom")}
          aria-label={t("ops.report.period.custom")}
        />
        <Select
          className="w-56"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label={t("ops.task.partner")}
        >
          <option value="">{t("ops.report.allPartners")}</option>
          {(partners ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {report.rows.length > 0 && (
          <ReportExport
            report={report}
            entries={entries}
            from={range.from}
            to={range.to}
            partnerId={partnerId || undefined}
          />
        )}
      </div>

      {report.rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-5" />} title={t("ops.report.empty")} />
      ) : (
        <div className={cn(card({ pad: "none" }), "overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <SortTh table={repTable.table} id="service" className="px-4 font-normal">
                  {t("ops.report.service")}
                </SortTh>
                <SortTh table={repTable.table} id="qty" align="right" className="px-4 font-normal">
                  {t("ops.report.qty")}
                </SortTh>
                <SortTh
                  table={repTable.table}
                  id="price"
                  align="right"
                  className="hidden px-4 font-normal sm:table-cell"
                >
                  {t("ops.report.price")}
                </SortTh>
                <SortTh table={repTable.table} id="sum" align="right" className="px-4 font-normal">
                  {t("ops.report.sum")}
                </SortTh>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {repTable.rows.map((r) => (
                <tr key={r.kind} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{svcName(r.kind)}</td>
                  <td className="px-4 py-2 text-right">{money(r.qty, t.lang)}</td>
                  <td className="hidden whitespace-nowrap px-4 py-2 text-right sm:table-cell">
                    {r.price == null
                      ? "—"
                      : `${money(r.price, t.lang)} ₽ / ${t(`ops.unit.${r.unit}` as MsgKey)}`}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.sum == null ? "—" : `${money(r.sum, t.lang)} ₽`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium">
                <td className="px-4 py-2" colSpan={2}>
                  {t("ops.report.total")}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="px-4 py-2 text-right tabular-nums">
                  {money(report.total, t.lang)} ₽
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {report.unpriced && (
        <p className="text-xs text-muted-foreground">{t("ops.report.unpriced")}</p>
      )}
    </div>
  );
}
