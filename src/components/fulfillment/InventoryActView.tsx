import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, FileSpreadsheet, Printer } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useWithArchive } from "@/lib/store/archive";
import { hasCabinetServer } from "@/lib/data/api";
import { inventoryLogRepository } from "@/lib/data/inventoryLogRepository";
import {
  actDay,
  buildInventoryAct,
  type InventoryActRow,
  type InventoryLogEntry,
} from "@/lib/inventoryAct";
import { formatAddress } from "@/lib/address";
import { downloadBook } from "@/lib/sheets";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn, nowMs } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./ScreenShell";
import { InventorySheet, type InventorySheetRow } from "./InventorySheet";

/** Сколько дней журнала берём: акт обычно нужен за недавний пересчёт. */
const LOOKBACK_DAYS = 90;
const PREVIEW_SCALE = 0.62;

type Load =
  | { status: "loading" }
  | { status: "ready"; entries: InventoryLogEntry[] }
  | { status: "forbidden" | "failed" };

const DECISION_KEY: Record<InventoryActRow["decision"], MsgKey> = {
  matched: "doc.inv.dec.matched",
  pending: "doc.inv.dec.pending",
  written_off: "doc.inv.dec.written_off",
  adopted: "doc.inv.dec.adopted",
  closed: "doc.inv.dec.closed",
};

/**
 * Акт инвентаризации за день — из журнала пересчётов на сервере и спорного.
 * PDF — печатью браузера, как остальные документы; Excel — книгой SheetJS.
 * В демо без сервера журнала пересчётов нет, и акта тоже: так и говорим.
 */
export function InventoryActView() {
  const t = useT();
  const server = useEditor((s) => s.session.source === "server") && hasCabinetServer;
  const warehouse = useEditor((s) => s.warehouse);
  const boxes = useEditor((s) => s.boxes);
  const products = useEditor((s) => s.products);
  const disputes = useWithArchive("disputes");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    if (!server) return;
    let live = true;
    const to = nowMs();
    void inventoryLogRepository
      .load(actDay(to - LOOKBACK_DAYS * 86_400_000), actDay(to))
      .then((res) => {
        if (!live) return;
        if (!res.ok) setLoad({ status: "failed" });
        else if (res.data === "forbidden") setLoad({ status: "forbidden" });
        else setLoad({ status: "ready", entries: res.data });
      });
    return () => {
      live = false;
    };
  }, [server]);

  const rows = useMemo(
    () =>
      load.status === "ready"
        ? buildInventoryAct(load.entries, disputes, boxes, warehouse.floors)
        : [],
    [load, disputes, boxes, warehouse.floors],
  );
  const days = useMemo(() => {
    const by = new Map<string, InventoryActRow[]>();
    for (const r of rows) {
      const d = actDay(r.at);
      by.set(d, [...(by.get(d) ?? []), r]);
    }
    return [...by].sort(([a], [b]) => b.localeCompare(a));
  }, [rows]);

  if (!server || load.status !== "ready" || days.length === 0) {
    const body: MsgKey = !server
      ? "doc.inv.demo"
      : load.status === "loading"
        ? "doc.inv.loading"
        : load.status === "forbidden"
          ? "doc.inv.forbidden"
          : load.status === "failed"
            ? "doc.inv.failed"
            : "doc.inv.empty";
    return (
      <EmptyState
        icon={<ClipboardCheck className="size-5" />}
        title={t("doc.kind.inventory")}
        body={t(body)}
      />
    );
  }

  const [activeDay, dayRows] = days.find(([d]) => d === day) ?? days[0];
  const product = (id: string | null) => (id ? products.find((p) => p.id === id) : undefined);
  const staffName = (id: string) => (warehouse.staff ?? []).find((s) => s.id === id)?.name ?? id;
  const locale = t.lang === "en" ? "en-GB" : "ru-RU";
  const number = `${t("doc.inv.prefix")}-${activeDay.slice(2).split("-").join("")}`;
  const sheetRows: InventorySheetRow[] = dayRows.map((r) => ({
    time: new Date(r.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
    place: (r.place && formatAddress(warehouse, r.place)) || "—",
    tote: (r.boxId && boxes.find((b) => b.id === r.boxId)?.barcode) || "",
    sku: product(r.productId)?.sku ?? "—",
    name: r.productId
      ? (product(r.productId)?.name ?? r.productId)
      : t(r.boxId ? "doc.inv.emptyBox" : "doc.inv.emptyCell"),
    book: r.book,
    fact: r.fact,
    decision: t(DECISION_KEY[r.decision]) + (r.note ? ` · ${r.note}` : ""),
    staff: staffName(r.staffId),
  }));
  const act = { number, day: activeDay, rows: sheetRows };

  const toExcel = () =>
    downloadBook(
      [
        {
          name: t("doc.kind.inventory").slice(0, 31),
          matrix: [
            [`${t("doc.kind.inventory")} ${number}`, warehouse.name, activeDay],
            [],
            [
              t("doc.inv.col.time"),
              t("doc.inv.col.place"),
              t("doc.inv.col.tote"),
              t("doc.col.sku"),
              t("doc.col.name"),
              t("doc.inv.col.book"),
              t("doc.col.fact"),
              t("doc.col.diff"),
              t("doc.inv.col.decision"),
              t("doc.inv.col.staff"),
            ],
            ...sheetRows.map((r) => [
              r.time,
              r.place,
              r.tote,
              r.sku,
              r.name,
              r.book,
              r.fact,
              r.fact - r.book,
              r.decision,
              r.staff,
            ]),
          ],
        },
      ],
      `${number}.xlsx`,
    );

  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 0; }`}</style>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">{t("doc.inv.hint")}</p>
        <div className="ml-auto flex gap-2">
          <Button className="h-9" variant="outline" onClick={() => void toExcel()}>
            <FileSpreadsheet className="size-3.5" />
            {t("doc.inv.excel")}
          </Button>
          <Button className="h-9" variant="outline" onClick={() => window.print()}>
            <Printer className="size-3.5" />
            {t("doc.inv.print")}
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ul className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto scrollbar-thin">
          {days.map(([d, list]) => (
            <li key={d}>
              <button
                onClick={() => setDay(d)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  d === activeDay ? "bg-primary/10 text-primary" : "hover:bg-accent",
                )}
              >
                <span className="truncate text-xs font-medium">
                  {new Date(`${d}T12:00:00`).toLocaleDateString(locale)}
                </span>
                <span className="text-2xs text-muted-foreground">
                  {t("doc.inv.dayHint", {
                    n: list.length,
                    diffs: list.filter((r) => r.book !== r.fact).length,
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="overflow-auto rounded-xl border border-border bg-muted/40 p-4 scrollbar-thin">
          <div
            style={{
              width: `calc(297mm * ${PREVIEW_SCALE})`,
              height: `calc(210mm * ${PREVIEW_SCALE})`,
            }}
          >
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
              <InventorySheet act={act} warehouse={warehouse} className="shadow-lg" />
            </div>
          </div>
        </div>
      </div>
      <div className="print-root hidden print:block">
        <InventorySheet act={act} warehouse={warehouse} />
      </div>
    </>
  );
}
