import { useEditor } from "@/lib/store";
import type { ExpectedShipment } from "@/lib/types";
import { type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Table, TableHeader, Th, Tr, Td } from "@/components/ui/table";

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
    <Table size="sm" fill>
      <TableHeader>
        <Th>{t("table.col.name")}</Th>
        <Th className="text-right">{t("recv.lines.expected")}</Th>
        <Th className="text-right">{t("recv.lines.received")}</Th>
      </TableHeader>
      <tbody>
        {shipment.lines.map((l) => {
          const p = products.find((x) => x.id === l.productId);
          const full = l.receivedQty >= l.expectedQty;
          return (
            <Tr key={l.id}>
              <Td>
                {p?.name ?? "—"}{" "}
                <span className="font-mono text-2xs text-muted-foreground">{p?.sku}</span>
              </Td>
              <Td className="text-right tabular-nums">{l.expectedQty}</Td>
              <Td className={cn("text-right font-medium tabular-nums", full && "text-success")}>
                {l.receivedQty}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
