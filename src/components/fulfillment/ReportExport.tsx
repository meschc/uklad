import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT, type MsgKey } from "@/lib/i18n";
import { downloadBook } from "@/lib/sheets";
import { Button } from "@/components/ui/button";
import type { ServiceReport } from "@/lib/operations";
import type { OperationEntry } from "@/lib/types";

/**
 * Выгрузка отчёта по услугам: Excel (отчёт + его операции строками) и PDF.
 *
 * PDF — через печать браузера в «Сохранить как PDF», как документы склада
 * (`DocumentsScreen`): лист рисуется здесь же в `.print-root`, а своей
 * PDF-библиотеки в бандле нет. Числа те же, что на экране: выгрузка берёт
 * готовый `report`, а не считает заново, иначе файл и экран могли бы разойтись.
 */
export function ReportExport({
  report,
  entries,
  from,
  to,
  partnerId,
}: {
  report: ServiceReport;
  /** Операции того же окна и продавца — строками на второй лист. */
  entries: OperationEntry[];
  from: number;
  to: number;
  partnerId?: string;
}) {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const [busy, setBusy] = useState(false);
  const locale = t.lang === "en" ? "en-US" : "ru-RU";
  const date = (ms: number) => new Date(ms).toLocaleDateString(locale);
  const partnerName = partnerId
    ? (warehouse.partners ?? []).find((p) => p.id === partnerId)?.name
    : undefined;
  const staffName = new Map((warehouse.staff ?? []).map((s) => [s.id, s.name]));
  const partners = new Map((warehouse.partners ?? []).map((p) => [p.id, p.name]));
  const period = `${from ? date(from) : "…"} — ${date(to)}`;
  const seller = partnerName ?? t("ops.report.allPartners");
  const svc = (kind: string) => t(`ops.svc.${kind}` as MsgKey);
  const unit = (u: string) => t(`ops.unit.${u}` as MsgKey);
  const money = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

  const toExcel = async () => {
    setBusy(true);
    try {
      const report_ = [
        [t("ops.export.title"), warehouse.name],
        [t("ops.export.period"), period],
        [t("ops.export.seller"), seller],
        [],
        [
          t("ops.report.service"),
          t("ops.export.unit"),
          t("ops.report.qty"),
          t("ops.report.price"),
          t("ops.report.sum"),
        ],
        ...report.rows.map((r) => [svc(r.kind), unit(r.unit), r.qty, r.price ?? "—", r.sum ?? "—"]),
        [t("ops.report.total"), "", "", "", report.total],
      ];
      const ops = [
        [
          t("ops.export.date"),
          t("ops.report.service"),
          t("ops.report.qty"),
          t("ops.export.seller"),
          t("ops.export.staff"),
        ],
        ...[...entries]
          .sort((a, b) => a.at - b.at)
          .map((e) => [
            new Date(e.at).toLocaleString(locale),
            svc(e.kind),
            e.qty,
            (e.partnerId && partners.get(e.partnerId)) || "",
            (e.staffId && staffName.get(e.staffId)) || "",
          ]),
      ];
      await downloadBook(
        [
          { name: t("ops.export.sheetReport"), matrix: report_ },
          { name: t("ops.export.sheetOps"), matrix: ops },
        ],
        `uklad-services-${new Date(to).toISOString().slice(0, 10)}.xlsx`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void toExcel()}>
          <FileSpreadsheet className="size-4" />
          Excel
        </Button>
        <Button
          size="sm"
          variant="outline"
          title={t("ops.export.pdfHint")}
          onClick={() => window.print()}
        >
          <FileDown className="size-4" />
          PDF
        </Button>
      </div>

      {/* Лист A4 для печати и «Сохранить как PDF»: только отчёт, без интерфейса. */}
      <div className="print-root hidden bg-white p-10 text-sm text-black print:block">
        <h1 className="text-xl font-semibold">{t("ops.export.title")}</h1>
        <p className="mt-1">{warehouse.name}</p>
        <p className="mt-4">
          {t("ops.export.period")}: {period}
        </p>
        <p>
          {t("ops.export.seller")}: {seller}
        </p>
        <table className="mt-6 w-full border-collapse tabular-nums">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1.5 pr-2 font-medium">{t("ops.report.service")}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{t("ops.report.qty")}</th>
              <th className="py-1.5 pr-2 text-right font-medium">{t("ops.report.price")}</th>
              <th className="py-1.5 text-right font-medium">{t("ops.report.sum")}</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.kind} className="border-b border-black/20">
                <td className="py-1.5 pr-2">{svc(r.kind)}</td>
                <td className="py-1.5 pr-2 text-right">{money(r.qty)}</td>
                <td className="py-1.5 pr-2 text-right">
                  {r.price == null ? "—" : `${money(r.price)} ₽ / ${unit(r.unit)}`}
                </td>
                <td className="py-1.5 text-right">{r.sum == null ? "—" : `${money(r.sum)} ₽`}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="pt-3" colSpan={3}>
                {t("ops.report.total")}
              </td>
              <td className="pt-3 text-right">{money(report.total)} ₽</td>
            </tr>
          </tfoot>
        </table>
        {report.unpriced && <p className="mt-4 text-xs">{t("ops.report.unpriced")}</p>}
        <p className="mt-10 text-xs">
          {t("ops.export.made")} {new Date(to).toLocaleString(locale)}
        </p>
      </div>
    </>
  );
}
