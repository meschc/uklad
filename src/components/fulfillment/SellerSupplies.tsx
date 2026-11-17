import { useMemo, useState } from "react";
import { FileWarning, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { nowMs } from "@/lib/utils";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useT, type TFunc } from "@/lib/i18n";
import { hasDiscrepancy, supplyAct, type SupplyActLine } from "@/lib/supplyAct";
import type { ExpectedShipment, Product } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogShell } from "@/components/ui/dialog-shell";
import { eyebrow } from "@/components/ui/eyebrow";

/** Закрытые поставки с расхождением держим в списке месяц: дальше это история. */
const KEEP_CLOSED_MS = 30 * 24 * 3_600_000;

interface Row {
  shipment: ExpectedShipment;
  lines: SupplyActLine[];
  flagged: boolean;
}

/**
 * Поставки продавца на склад: что едет и что пришло не так, как заявлено
 * (Кирилл 17.11). Расхождение — отметка у поставки и акт по своим строкам:
 * заявлено, принято, разница и что с излишком. Числа — только свои строки.
 */
export function SellerSupplies({ mine }: { mine: ReadonlySet<string> }) {
  const t = useT();
  const products = useWarehouseProducts();
  const expected = useEditor((s) => s.expectedShipments);
  const disputes = useEditor((s) => s.disputes);
  const [openId, setOpenId] = useState<string | null>(null);
  // Граница «месяц назад» — на момент открытия экрана, не на каждой отрисовке.
  const [since] = useState(() => nowMs() - KEEP_CLOSED_MS);

  const rows = useMemo(() => {
    return expected
      .map((shipment): Row => {
        const lines = supplyAct(shipment, mine, disputes ?? []);
        return { shipment, lines, flagged: hasDiscrepancy(shipment, lines) };
      })
      .filter(
        (r) =>
          r.lines.length > 0 &&
          (r.shipment.status !== "closed" ||
            (r.flagged && (r.shipment.closedAt ?? r.shipment.createdAt) >= since)),
      );
  }, [expected, disputes, mine, since]);

  if (rows.length === 0) return null;
  const open = rows.find((r) => r.shipment.id === openId);

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2.5">
      <p className={eyebrow()}>{t("seller.suppliesTitle")}</p>
      {rows.map(({ shipment: s, lines, flagged }) => (
        <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate">{s.title ?? t("supply.noName")}</span>
          <span className="flex shrink-0 items-center gap-2 tabular-nums text-muted-foreground">
            {flagged && (
              <Button
                size="sm"
                className="border-0 bg-warning-fill text-warning-foreground hover:bg-warning-fill/90"
                onClick={() => setOpenId(s.id)}
              >
                <FileWarning className="size-3.5" />
                {t("supply.act.flag")}
              </Button>
            )}
            {t(`supply.status.${s.status}`)} · {sum(lines, "received")}/{sum(lines, "expected")}
          </span>
        </div>
      ))}
      {open && (
        <SupplyActPanel row={open} products={products} t={t} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}

const sum = (lines: readonly SupplyActLine[], k: "expected" | "received") =>
  lines.reduce((n, l) => n + l[k], 0);

function SupplyActPanel({
  row,
  products,
  t,
  onClose,
}: {
  row: Row;
  products: Product[];
  t: TFunc;
  onClose: () => void;
}) {
  const { shipment: s, lines } = row;
  const closed = s.status === "closed";
  const shown = lines.filter((l) => l.diff > 0 || (closed && l.diff < 0));
  return (
    <DialogShell size="lg" scroll onClose={onClose}>
      <DialogHeader align="start">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t("supply.act.title")}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {s.title ?? t("supply.noName")}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t("support.close")}>
          <X className="size-4" />
        </Button>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        <p className="text-xs text-muted-foreground">
          {t(closed ? "supply.act.bodyClosed" : "supply.act.bodyOpen")}
        </p>
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">{t("table.col.name")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("supply.act.expected")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("supply.act.received")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("supply.act.diff")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const p = products.find((x) => x.id === l.productId);
                return (
                  <tr key={l.lineId} className="border-t border-border/60 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{p?.name ?? "—"}</div>
                      <div className="font-mono text-2xs text-muted-foreground">{p?.sku}</div>
                      {l.diff > 0 && (
                        <div className="mt-0.5 text-2xs text-muted-foreground">
                          {t(`supply.act.overage.${l.overage ?? "pending"}`)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.expected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{l.received}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {l.diff > 0 ? `+${l.diff}` : l.diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DialogShell>
  );
}
