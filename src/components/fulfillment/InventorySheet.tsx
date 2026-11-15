import type { ReactNode } from "react";
import type { Warehouse } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Строка акта, уже переведённая в текст экрана: лист только рисует. */
export interface InventorySheetRow {
  time: string;
  place: string;
  tote: string;
  sku: string;
  name: string;
  book: number;
  fact: number;
  decision: string;
  staff: string;
}

/**
 * Лист акта инвентаризации — альбомный A4: граф больше, чем у накладной.
 * Кегль — физический размер на бумаге, как у `DocumentSheet`.
 */
export function InventorySheet({
  act,
  warehouse,
  className,
}: {
  act: { number: string; day: string; rows: InventorySheetRow[] };
  warehouse: Warehouse;
  className?: string;
}) {
  const t = useT();
  const book = act.rows.reduce((s, r) => s + r.book, 0);
  const fact = act.rows.reduce((s, r) => s + r.fact, 0);
  const diffs = act.rows.filter((r) => r.book !== r.fact).length;
  return (
    <div
      className={cn("print-sheet flex flex-col gap-3 bg-white p-[10mm] text-black", className)}
      style={{ width: "297mm", minHeight: "210mm" }}
    >
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-2">
        <div>
          <p className="text-[15px] font-bold uppercase leading-tight">{t("doc.kind.inventory")}</p>
          <p className="mt-0.5 font-mono text-[11px]">
            {t("doc.number")} {act.number} {t("doc.from")}{" "}
            {new Date(`${act.day}T12:00:00`).toLocaleDateString(
              t.lang === "en" ? "en-GB" : "ru-RU",
            )}
          </p>
        </div>
        <div className="shrink-0 text-right text-[10px] leading-snug">
          <p className="font-semibold">{warehouse.name}</p>
          {warehouse.address && <p>{warehouse.address}</p>}
        </div>
      </header>

      <p className="text-[10px]">
        {t("doc.inv.summary", { n: act.rows.length, diffs })} {t("doc.inv.placeNote")}
      </p>

      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="bg-neutral-100">
            <Th className="w-6">№</Th>
            <Th className="w-10">{t("doc.inv.col.time")}</Th>
            <Th className="w-20">{t("doc.inv.col.place")}</Th>
            <Th className="w-24">{t("doc.inv.col.tote")}</Th>
            <Th className="w-20">{t("doc.col.sku")}</Th>
            <Th>{t("doc.col.name")}</Th>
            <Th className="w-12 text-right">{t("doc.inv.col.book")}</Th>
            <Th className="w-12 text-right">{t("doc.col.fact")}</Th>
            <Th className="w-12 text-right">{t("doc.col.diff")}</Th>
            <Th className="w-48">{t("doc.inv.col.decision")}</Th>
            <Th className="w-28">{t("doc.inv.col.staff")}</Th>
          </tr>
        </thead>
        <tbody>
          {act.rows.map((r, i) => {
            const diff = r.fact - r.book;
            return (
              <tr key={i} className="align-top">
                <Td className="tabular-nums">{i + 1}</Td>
                <Td className="tabular-nums">{r.time}</Td>
                <Td className="font-mono">{r.place}</Td>
                <Td className="font-mono">{r.tote || "—"}</Td>
                <Td className="font-mono">{r.sku}</Td>
                <Td>{r.name}</Td>
                <Td className="text-right tabular-nums">{r.book}</Td>
                <Td className="text-right tabular-nums">{r.fact}</Td>
                <Td className={cn("text-right tabular-nums", diff !== 0 && "font-bold")}>
                  {diff === 0 ? "—" : diff > 0 ? `+${diff}` : diff}
                </Td>
                <Td>{r.decision}</Td>
                <Td>{r.staff}</Td>
              </tr>
            );
          })}
          <tr className="bg-neutral-100 font-semibold">
            <Td colSpan={6}>{t("doc.total")}</Td>
            <Td className="text-right tabular-nums">{book}</Td>
            <Td className="text-right tabular-nums">{fact}</Td>
            <Td className="text-right tabular-nums">{fact - book || "—"}</Td>
            <Td colSpan={2}> </Td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-8 pt-4 text-[10px]">
        {(["doc.inv.sign.counted", "doc.inv.sign.checked"] as const).map((key) => (
          <div key={key} className="flex flex-col gap-6">
            <span className="font-semibold">{t(key)}</span>
            <div className="flex items-end gap-2">
              <span className="h-4 flex-1 border-b border-black" />
              <span className="w-28 shrink-0 border-b border-black text-center text-[8px] text-neutral-500">
                {t("doc.sign.name")}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-4 text-[8px] text-neutral-500">{t("doc.disclaimer")}</p>
    </div>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={cn("border border-neutral-400 px-1.5 py-1 text-left font-semibold", className)}>
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("border border-neutral-400 px-1.5 py-1", className)}>
      {children}
    </td>
  );
}
