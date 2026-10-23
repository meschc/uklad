import { useMemo } from "react";
import { Package } from "lucide-react";
import { useEditor } from "@/lib/store";
import { stockByProduct } from "@/lib/fulfillment";
import type { Box } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { EmptyState } from "./ScreenShell";

/**
 * «Весь товар» продавца: каждый товар на каждом складе одной таблицей. Таблица
 * номенклатуры показывает один активный склад, а продавцу нужно видеть свой
 * товар целиком, где бы он ни лежал. Работа неактивных складов лежит в
 * `warehouseData`, поэтому тара собирается со всех складов (без повторов —
 * демо-склады до первого открытия делят одну историю).
 */
export function AllGoodsTab() {
  const t = useT();
  const products = useEditor((s) => s.products);
  const placements = useEditor((s) => s.placements);
  const activeBoxes = useEditor((s) => s.boxes);
  const warehouseData = useEditor((s) => s.warehouseData);
  const warehouse = useEditor((s) => s.warehouse);
  const others = useEditor((s) => s.otherWarehouses);

  const rows = useMemo(() => {
    const all = [warehouse, ...others];
    const whByFloor = new Map<string, string>();
    for (const w of all) for (const f of w.floors) whByFloor.set(f.id, w.name);
    const whName = new Map(all.map((w) => [w.id, w.name]));

    const boxes = new Map<string, Box>();
    for (const b of activeBoxes) boxes.set(b.id, b);
    for (const d of Object.values(warehouseData))
      for (const b of d.boxes) if (!boxes.has(b.id)) boxes.set(b.id, b);
    const stock = stockByProduct(placements, [...boxes.values()]);

    const out: { key: string; sku: string; name: string; wh: string; qty: number }[] = [];
    for (const p of products) {
      const perWh = new Map<string, number>();
      for (const loc of stock.get(p.id)?.locations ?? []) {
        const wh = whByFloor.get(loc.addr.floorId) ?? "—";
        perWh.set(wh, (perWh.get(wh) ?? 0) + loc.qty);
      }
      if (perWh.size === 0) {
        const wh = p.warehouseId ? (whName.get(p.warehouseId) ?? "—") : "—";
        perWh.set(wh, 0);
      }
      for (const [wh, qty] of perWh)
        out.push({ key: `${p.id}:${wh}`, sku: p.sku, name: p.name, wh, qty });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name) || a.wh.localeCompare(b.wh));
  }, [products, placements, activeBoxes, warehouseData, warehouse, others]);

  if (rows.length === 0)
    return <EmptyState icon={<Package className="size-5" />} title={t("seller.all.empty")} />;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <p className="mb-3 text-sm text-muted-foreground">{t("seller.all.hint")}</p>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t("table.col.name")}</th>
              <th className="px-3 py-2 font-medium">{t("table.col.sku")}</th>
              <th className="px-3 py-2 font-medium">{t("seller.all.warehouse")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("table.col.qty")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/60">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.sku}</td>
                <td className="px-3 py-2">{r.wh}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
