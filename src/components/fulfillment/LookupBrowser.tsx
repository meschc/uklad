import { useMemo, useState } from "react";
import { Boxes, Layers, Package, PackageCheck, Search, Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";

type Tab = "products" | "pallets" | "boxes" | "receiving" | "shipments";

/** Сколько строк показать без поиска: дальше — уточнить запрос. */
const ROWS = 12;

interface Row {
  id: string;
  title: string;
  cols: string[];
  pick: () => void;
}

const day = (ms: number) => new Date(ms).toLocaleDateString("ru-RU");

/**
 * Выбор из списка на экране «Что это?» (Кирилл 12 ноя: «чтобы не вбивать
 * вручную и не сканировать, а выбрать из списка»). Товар, паллета и тара
 * открываются тем же ответом, что и по скану; приёмка и отгрузка — своим
 * документом.
 */
export function LookupBrowser({ onCode }: { onCode: (code: string) => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("products");
  const [query, setQuery] = useState("");
  const products = useEditor((s) => s.products);
  const pallets = useEditor((s) => s.pallets);
  const boxes = useEditor((s) => s.boxes);
  const inbound = useEditor((s) => s.expectedShipments);
  const trips = useEditor((s) => s.shipments);
  const openDoc = useEditor((s) => s.openDoc);

  const rows = useMemo<Row[]>(() => {
    switch (tab) {
      case "products":
        return products.map((p) => ({
          id: p.id,
          title: p.name,
          cols: [p.sku, p.barcode],
          pick: () => onCode(p.barcode),
        }));
      case "pallets":
        return pallets.map((p) => ({
          id: p.id,
          title: p.barcode,
          cols: [t("lookup.browse.boxesN", { n: p.boxIds.length }), day(p.createdAt)],
          pick: () => onCode(p.barcode),
        }));
      case "boxes":
        return boxes.map((b) => ({
          id: b.id,
          title: b.barcode,
          cols: [
            t("lookup.browse.unitsN", { n: b.lines.reduce((s, l) => s + l.qty, 0) }),
            day(b.createdAt),
          ],
          pick: () => onCode(b.barcode),
        }));
      case "receiving":
        return inbound.map((x) => ({
          id: x.id,
          title: x.title ?? day(x.createdAt),
          cols: [t("lookup.browse.linesN", { n: x.lines.length }), day(x.createdAt)],
          pick: () => openDoc("receiving", x.id),
        }));
      case "shipments":
        return trips.map((x) => ({
          id: x.id,
          title: x.destination,
          cols: [x.vehicle ?? "—", day(x.shippedAt)],
          pick: () => openDoc("shipment", x.id),
        }));
    }
  }, [tab, products, pallets, boxes, inbound, trips, onCode, openDoc, t]);

  const q = query.trim().toLowerCase();
  const found = q
    ? rows.filter((r) => [r.title, ...r.cols].some((c) => c.toLowerCase().includes(q)))
    : rows;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("lookup.browse.title")}</h2>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={tab}
          onChange={(v) => {
            setTab(v);
            setQuery("");
          }}
          ariaLabel={t("lookup.browse.title")}
          options={[
            { value: "products", label: t("lookup.browse.products"), icon: <Package /> },
            { value: "pallets", label: t("lookup.browse.pallets"), icon: <Layers /> },
            { value: "boxes", label: t("lookup.browse.boxes"), icon: <Boxes /> },
            { value: "receiving", label: t("lookup.browse.receiving"), icon: <PackageCheck /> },
            { value: "shipments", label: t("lookup.browse.shipments"), icon: <Truck /> },
          ]}
        />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            maxLength={80}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            aria-label={t("common.search")}
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div key={tab} className="flex animate-tab-in flex-col divide-y divide-border/60">
        {found.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">{t("lookup.browse.empty")}</p>
        )}
        {found.slice(0, ROWS).map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={r.pick}
            className={cn(
              "flex items-baseline gap-3 rounded-md px-2 py-2 text-left transition-colors duration-fast hover:bg-muted/60",
            )}
          >
            <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
            {r.cols.map((c, i) => (
              <span
                key={i}
                className="shrink-0 whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground"
              >
                {c}
              </span>
            ))}
          </button>
        ))}
        {found.length > ROWS && (
          <p className="py-2 text-xs text-muted-foreground">
            {t("lookup.browse.more", { n: found.length - ROWS })}
          </p>
        )}
      </div>
    </section>
  );
}
