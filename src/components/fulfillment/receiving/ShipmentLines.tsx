import { useEditor } from "@/lib/store";
import type { ExpectedShipment } from "@/lib/types";
import { type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Строки поставки под полем скана: что ещё не добрано.
 *
 * Товары берутся из стора здесь, а не приходят пропсом: таблица — единственное
 * место экрана, которому нужен весь каталог, и тащить его через мастер значило
 * бы пересобирать экран на каждую правку карточки товара.
 */
export function ShipmentLines({ shipment, t }: { shipment: ExpectedShipment; t: TFunc }) {
  const products = useEditor((s) => s.products);
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted/50">
          <tr className="text-left">
            <th className="px-2.5 py-1.5 font-medium">{t("table.col.name")}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">{t("recv.lines.expected")}</th>
            <th className="px-2.5 py-1.5 text-right font-medium">{t("recv.lines.received")}</th>
          </tr>
        </thead>
        <tbody>
          {shipment.lines.map((l) => {
            const p = products.find((x) => x.id === l.productId);
            const full = l.receivedQty >= l.expectedQty;
            return (
              <tr key={l.id} className="border-t border-border/60">
                <td className="px-2.5 py-1.5">
                  {p?.name ?? "—"}{" "}
                  <span className="font-mono text-[10px] text-muted-foreground">{p?.sku}</span>
                </td>
                <td className="px-2.5 py-1.5 text-right tabular-nums">{l.expectedQty}</td>
                <td
                  className={cn(
                    "px-2.5 py-1.5 text-right font-medium tabular-nums",
                    full && "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {l.receivedQty}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
