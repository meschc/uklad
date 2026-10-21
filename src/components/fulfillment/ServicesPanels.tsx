import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { useEditor } from "@/lib/store";
import { isServiceOn, operationLog, SERVICES, serviceReport } from "@/lib/operations";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn, nowMs } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { card } from "@/components/ui/card";
import { EmptyState } from "./ScreenShell";

/**
 * Вкладки «Услуги» и «Отчёт» экрана операций. Вынесены отдельно: это
 * настройка и расчёт, а не работа смены, и меняются они по другим причинам.
 */

const SELECT =
  "h-8 cursor-pointer rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const money = (n: number, lang: string) =>
  n.toLocaleString(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 2 });

/** Какие операции склад оказывает и почём — по строке на услугу. */
export function ServicesPanel() {
  const t = useT();
  const settings = useEditor((s) => s.serviceSettings);
  const setEnabled = useEditor((s) => s.setServiceEnabled);
  const setPrice = useEditor((s) => s.setServicePrice);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("ops.services.hint")}</p>
      <ul className={cn(card({ pad: "none" }), "divide-y divide-border")}>
        {SERVICES.map((s) => {
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
                <span className="text-sm">{t(`ops.svc.${s.kind}` as MsgKey)}</span>
                {s.auto && (
                  <span className="text-xs text-muted-foreground">{t("ops.services.auto")}</span>
                )}
              </label>
              <Input
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Period = "7" | "30" | "all";
const DAY = 24 * 60 * 60 * 1000;

/** Отчёт по услугам за период — основа счёта продавцу. */
export function ReportPanel() {
  const t = useT();
  const settings = useEditor((s) => s.serviceSettings);
  const tasks = useEditor((s) => s.tasks);
  const pallets = useEditor((s) => s.pallets);
  const boxes = useEditor((s) => s.boxes);
  const receivingEvents = useEditor((s) => s.receivingEvents);
  const requests = useEditor((s) => s.requests);
  const shipments = useEditor((s) => s.shipments);
  const products = useEditor((s) => s.products);
  const partners = useEditor((s) => s.warehouse.partners);
  const [period, setPeriod] = useState<Period>("30");
  const [partnerId, setPartnerId] = useState("");

  const log = useMemo(
    () => operationLog({ tasks, pallets, boxes, receivingEvents, requests, shipments, products }),
    [tasks, pallets, boxes, receivingEvents, requests, shipments, products],
  );
  const report = useMemo(() => {
    const to = nowMs();
    const from = period === "all" ? 0 : to - Number(period) * DAY;
    return serviceReport(log, settings, { from, to, partnerId: partnerId || undefined });
  }, [log, settings, period, partnerId]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "7", label: t("ops.report.period.7") },
            { value: "30", label: t("ops.report.period.30") },
            { value: "all", label: t("ops.report.period.all") },
          ]}
        />
        <select
          className={SELECT}
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
        </select>
      </div>

      {report.rows.length === 0 ? (
        <EmptyState icon={<Receipt className="size-5" />} title={t("ops.report.empty")} />
      ) : (
        <div className={cn(card({ pad: "none" }), "overflow-x-auto")}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-normal">{t("ops.report.service")}</th>
                <th className="px-4 py-2 text-right font-normal">{t("ops.report.qty")}</th>
                <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">
                  {t("ops.report.price")}
                </th>
                <th className="px-4 py-2 text-right font-normal">{t("ops.report.sum")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {report.rows.map((r) => (
                <tr key={r.kind} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">{t(`ops.svc.${r.kind}` as MsgKey)}</td>
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
