import { useEffect, useMemo, useState } from "react";
import { ClipboardList, PackageCheck, Pencil, Printer, Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { buildPickDoc, buildReceivingDoc, type DocModel } from "@/lib/documents";
import { discrepancyDoc, docEntries, resolveDoc, type DocSources } from "@/lib/docFlow";
import { groupRequestsByTarget } from "@/lib/fulfillment";
import type { DocRecord } from "@/lib/types";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { card } from "@/components/ui/card";
import { DocumentSheet } from "./DocumentSheet";
import { DocPanel } from "./DocPanel";
import { ScreenShell, EmptyState } from "./ScreenShell";

/**
 * Документы склада (п.12): лист сборки, накладная на отгрузку, лист приёмки и
 * акт расхождений.
 *
 * Документ на складе не сочиняют с нуля — он рождается из операции
 * (`docFlow.ts`): закрыли поставку — есть лист приёмки, уехал рейс — есть
 * накладная. Поэтому здесь нет кнопки «создать», есть список того, что уже
 * случилось, со статусом: черновик правят в панели справа, подтверждает
 * старший. Лист сборки и лист открытой поставки — рабочие: их печатают, чтобы
 * идти с ними на склад, подтверждать там нечего.
 */

/** Масштаб предпросмотра: A4 в 210 мм не влезает в колонку экрана целиком. */
const PREVIEW_SCALE = 0.62;

type Tab = "pick" | "shipment" | "receiving";
type Status = DocRecord["status"] | "working";

interface Source {
  id: string;
  title: string;
  hint: string;
  status: Status;
  record?: DocRecord;
}

const STATUS_KEY: Record<Status, MsgKey> = {
  draft: "doc.status.draft",
  confirmed: "doc.status.confirmed",
  working: "doc.status.working",
};

const EMPTY_KEY: Record<Tab, MsgKey> = {
  pick: "doc.empty.pick",
  shipment: "doc.empty.shipment",
  receiving: "doc.empty.receiving",
};

export function DocumentsScreen() {
  const t = useT();
  const warehouse = useEditor((s) => s.warehouse);
  const products = useEditor((s) => s.products);
  const requests = useEditor((s) => s.requests);
  const shipments = useEditor((s) => s.shipments);
  const expected = useEditor((s) => s.expectedShipments);
  const placements = useEditor((s) => s.placements);
  const boxes = useEditor((s) => s.boxes);
  const events = useEditor((s) => s.receivingEvents);
  const records = useEditor((s) => s.docRecords);
  const focus = useEditor((s) => s.docFocus);

  const [tab, setTab] = useState<Tab>(focus?.kind ?? "pick");
  const [sourceId, setSourceId] = useState<string | null>(focus?.sourceId ?? null);
  const [act, setAct] = useState(false);
  const [editing, setEditing] = useState(false);

  // Переход из задания или приёмки открывает нужный документ один раз —
  // и когда экран уже открыт. Дальше человек листает сам.
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus && focus !== seenFocus) {
    setSeenFocus(focus);
    setTab(focus.kind);
    setSourceId(focus.sourceId);
    setAct(false);
  }
  useEffect(() => {
    if (focus) useEditor.getState().clearDocFocus();
  }, [focus]);

  const src: DocSources = useMemo(
    () => ({
      warehouse,
      products,
      requests,
      shipments,
      expectedShipments: expected,
      receivingEvents: events,
      boxes,
    }),
    [warehouse, products, requests, shipments, expected, events, boxes],
  );
  const entries = useMemo(() => docEntries(src, records), [src, records]);

  const sources: Source[] = useMemo(() => {
    if (tab === "pick") {
      return groupRequestsByTarget(
        requests.filter((r) => r.status === "new" || r.status === "in_progress"),
      ).map((g) => ({
        id: g.target ?? "—",
        title: g.target ?? t("doc.src.noTarget"),
        hint: t("doc.src.positions", { n: g.items.length }),
        status: "working" as const,
      }));
    }
    const docs: Source[] = entries
      .filter((e) => e.kind === tab)
      .map((e) => ({
        id: e.sourceId,
        title: e.title || t(tab === "shipment" ? "doc.src.noTarget" : "doc.src.shipment"),
        hint: new Date(e.date).toLocaleDateString(t.lang),
        status: e.status,
        record: e.record,
      }));
    if (tab === "shipment") return docs;
    // Открытая поставка — рабочий лист: с ним идут сверять машину на рампе.
    const open: Source[] = expected
      .filter((s) => s.status !== "closed")
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({
        id: s.id,
        title: s.title ?? t("doc.src.shipment"),
        hint: t("doc.src.positions", { n: s.lines.length }),
        status: "working" as const,
      }));
    return [...open, ...docs];
  }, [tab, requests, entries, expected, t]);

  const active = sources.find((s) => s.id === sourceId) ?? sources[0] ?? null;

  const base: DocModel | null = useMemo(() => {
    if (!active) return null;
    if (tab === "pick") {
      const group = groupRequestsByTarget(
        requests.filter((r) => r.status === "new" || r.status === "in_progress"),
      ).find((g) => (g.target ?? "—") === active.id);
      return group
        ? buildPickDoc(group.items, products, warehouse, placements, boxes, active.id)
        : null;
    }
    if (active.status === "working") {
      const exp = expected.find((s) => s.id === active.id);
      return exp ? buildReceivingDoc(exp, events, products, warehouse, boxes) : null;
    }
    return resolveDoc(tab, active.id, src, active.record);
  }, [tab, active, requests, products, warehouse, placements, boxes, expected, events, src]);

  const isDoc = tab !== "pick" && !!active && active.status !== "working";
  const actDoc =
    isDoc && tab === "receiving" && base && active ? discrepancyDoc(base, active.id) : null;
  const doc = act && actDoc ? actDoc : base;
  const confirmed = active?.record?.status === "confirmed" ? active.record : undefined;
  const sheetProps = {
    draft: isDoc && active?.status === "draft",
    confirmedLine: confirmed
      ? t("doc.confirmedBy", {
          who: (warehouse.staff ?? []).find((m) => m.id === confirmed.confirmedBy)?.name ?? "—",
          d: new Date(confirmed.confirmedAt ?? 0).toLocaleDateString(t.lang),
        })
      : undefined,
  };

  return (
    <ScreenShell title={t("doc.title")} subtitle={t("doc.subtitle")} wide>
      <style>{`@page { size: A4 portrait; margin: 0; }`}</style>

      <div className={card({ className: "flex flex-wrap items-center gap-3" })}>
        <Segmented
          size="md"
          value={tab}
          onChange={(k) => {
            setTab(k);
            setSourceId(null);
            setAct(false);
          }}
          options={[
            { value: "pick" as Tab, label: t("doc.kind.pickShort"), icon: <ClipboardList /> },
            { value: "shipment" as Tab, label: t("doc.kind.shipmentShort"), icon: <Truck /> },
            {
              value: "receiving" as Tab,
              label: t("doc.kind.receivingShort"),
              icon: <PackageCheck />,
            },
          ]}
        />
        {/* Акт расхождений — только когда план с фактом не сошёлся. */}
        {actDoc && (
          <Segmented
            size="md"
            value={act ? "act" : "sheet"}
            onChange={(v) => setAct(v === "act")}
            options={[
              { value: "sheet", label: t("doc.kind.receiving") },
              { value: "act", label: t("doc.kind.discrepancy") },
            ]}
          />
        )}
        <div className="ml-auto flex gap-2">
          {isDoc && base && (
            <Button className="h-9" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
              {t(confirmed ? "doc.details" : "doc.edit")}
            </Button>
          )}
          <Button className="h-9" variant="outline" disabled={!doc} onClick={() => window.print()}>
            <Printer className="size-3.5" />
            {t("doc.print")}
          </Button>
        </div>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title={t("doc.emptyTitle")}
          body={t(EMPTY_KEY[tab])}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <ul
            className={card({
              pad: "xs",
              className: "flex max-h-[32rem] flex-col gap-1 overflow-y-auto scrollbar-thin",
            })}
          >
            {sources.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setSourceId(s.id);
                    setAct(false);
                  }}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    s.id === active?.id ? "bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  <span className="truncate text-xs font-medium">{s.title}</span>
                  <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                    {s.hint}
                    {tab !== "pick" && (
                      <StatusChip status={s.status} label={t(STATUS_KEY[s.status])} />
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="overflow-auto rounded-xl border border-border bg-muted/40 p-4 scrollbar-thin">
            {doc ? (
              <div
                style={{
                  width: `calc(210mm * ${PREVIEW_SCALE})`,
                  height: `calc(297mm * ${PREVIEW_SCALE})`,
                }}
              >
                <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}>
                  <DocumentSheet
                    doc={doc}
                    warehouse={warehouse}
                    className="shadow-lg"
                    {...sheetProps}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("doc.pickSource")}</p>
            )}
          </div>
        </div>
      )}

      {/* Печатная версия: только лист, без интерфейса. */}
      {doc && (
        <div className="print-root hidden print:block">
          <DocumentSheet doc={doc} warehouse={warehouse} {...sheetProps} />
        </div>
      )}

      {editing && isDoc && base && active && (
        <DocPanel
          // Ключ по документу: панель другого документа начинается с его полей.
          key={`${tab}:${active.id}`}
          kind={tab as DocRecord["kind"]}
          sourceId={active.id}
          doc={base}
          record={active.record}
          onClose={() => setEditing(false)}
        />
      )}
    </ScreenShell>
  );
}

function StatusChip({ status, label }: { status: Status; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px",
        status === "confirmed" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        status === "draft" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        status === "working" && "bg-muted",
      )}
    >
      {label}
    </span>
  );
}
