import { useMemo, useState } from "react";
import { ClipboardList, PackageCheck, Printer, Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import {
  buildPickDoc,
  buildReceivingDoc,
  buildShipmentDoc,
  type DocKind,
  type DocModel,
} from "@/lib/documents";
import { groupRequestsByTarget } from "@/lib/fulfillment";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { DocumentSheet } from "./DocumentSheet";
import { ScreenShell, EmptyState } from "./ScreenShell";

/**
 * Документы склада (п.12): лист сборки, накладная на отгрузку, лист приёмки.
 *
 * Экран сознательно устроен как «выбрал источник → увидел лист → напечатал»:
 * документ на складе никогда не сочиняют с нуля, его всегда формируют по уже
 * существующей пачке заявок, рейсу или поставке. Поэтому здесь нет конструктора
 * документа — есть выбор того, по чему его составить.
 */

/** Масштаб предпросмотра: A4 в 210 мм не влезает в колонку экрана целиком. */
const PREVIEW_SCALE = 0.62;

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

  const [kind, setKind] = useState<DocKind>("pick");
  const [sourceId, setSourceId] = useState<string | null>(null);

  // Источники документа — своя пачка на каждый тип. Лист сборки составляют по
  // открытым заявкам (собранное перепечатывать незачем), накладную — по
  // состоявшемуся рейсу, лист приёмки — по любой поставке, включая открытую:
  // именно с ним и идут сверять машину на рампе.
  const sources = useMemo(() => {
    if (kind === "pick") {
      return groupRequestsByTarget(
        requests.filter((r) => r.status === "new" || r.status === "in_progress"),
      ).map((g) => ({
        id: g.target ?? "—",
        title: g.target ?? t("doc.src.noTarget"),
        hint: t("doc.src.positions", { n: g.items.length }),
      }));
    }
    if (kind === "shipment") {
      return [...shipments]
        .sort((a, b) => b.shippedAt - a.shippedAt)
        .map((s) => ({
          id: s.id,
          title: s.destination || t("doc.src.noTarget"),
          hint: new Date(s.shippedAt).toLocaleDateString(),
        }));
    }
    return [...expected]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => ({
        id: s.id,
        title: s.title ?? t("doc.src.shipment"),
        hint: t("doc.src.positions", { n: s.lines.length }),
      }));
  }, [kind, requests, shipments, expected, t]);

  const activeId = sourceId && sources.some((s) => s.id === sourceId)
    ? sourceId
    : (sources[0]?.id ?? null);

  const doc: DocModel | null = useMemo(() => {
    if (!activeId) return null;
    if (kind === "pick") {
      const group = groupRequestsByTarget(
        requests.filter((r) => r.status === "new" || r.status === "in_progress"),
      ).find((g) => (g.target ?? "—") === activeId);
      if (!group) return null;
      return buildPickDoc(
        group.items,
        products,
        warehouse,
        placements,
        boxes,
        activeId,
      );
    }
    if (kind === "shipment") {
      const ship = shipments.find((s) => s.id === activeId);
      return ship ? buildShipmentDoc(ship, requests, products) : null;
    }
    const exp = expected.find((s) => s.id === activeId);
    return exp
      ? buildReceivingDoc(exp, events, products, warehouse, boxes)
      : null;
  }, [
    kind,
    activeId,
    requests,
    shipments,
    expected,
    products,
    warehouse,
    placements,
    boxes,
    events,
  ]);

  return (
    <ScreenShell title={t("doc.title")} subtitle={t("doc.subtitle")} wide>
      <style>{`@page { size: A4 portrait; margin: 0; }`}</style>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Segmented
          size="md"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setSourceId(null);
          }}
          options={[
            {
              value: "pick" as DocKind,
              label: t("doc.kind.pickShort"),
              icon: <ClipboardList />,
            },
            {
              value: "shipment" as DocKind,
              label: t("doc.kind.shipmentShort"),
              icon: <Truck />,
            },
            {
              value: "receiving" as DocKind,
              label: t("doc.kind.receivingShort"),
              icon: <PackageCheck />,
            },
          ]}
        />
        <Button
          className="ml-auto h-9"
          variant="outline"
          disabled={!doc}
          onClick={() => window.print()}
        >
          <Printer className="size-3.5" />
          {t("doc.print")}
        </Button>
      </div>

      {sources.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-5" />}
          title={t("doc.emptyTitle")}
          body={t(`doc.empty.${kind}`)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <ul className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-card p-2 scrollbar-thin">
            {sources.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSourceId(s.id)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                    s.id === activeId
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-accent",
                  )}
                >
                  <span className="truncate text-xs font-medium">{s.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {s.hint}
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
                <div
                  style={{
                    transform: `scale(${PREVIEW_SCALE})`,
                    transformOrigin: "top left",
                  }}
                >
                  <DocumentSheet
                    doc={doc}
                    warehouse={warehouse}
                    className="shadow-lg"
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
          <DocumentSheet doc={doc} warehouse={warehouse} />
        </div>
      )}
    </ScreenShell>
  );
}
