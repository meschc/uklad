import { useEffect, useMemo, useState } from "react";
import { FileWarning } from "lucide-react";
import { useEditor } from "@/lib/store";
import { nowMs } from "@/lib/utils";
import { useWarehouseProducts } from "@/lib/warehouseProducts";
import { useT } from "@/lib/i18n";
import { receivingAnswersRepository } from "@/lib/data";
import { hasDiscrepancy, supplyAct, type SupplyActLine } from "@/lib/supplyAct";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { SupplyActPanel, type ActRow } from "./SupplyActPanel";

/** Закрытые поставки с расхождением держим в списке месяц: дальше это история. */
const KEEP_CLOSED_MS = 30 * 24 * 3_600_000;

interface Row extends ActRow {
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

  // Ответы на акты — с сервера; в демо они уже в сторе.
  useEffect(() => {
    void receivingAnswersRepository.load();
  }, []);

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
              <Button size="sm" variant="warning" onClick={() => setOpenId(s.id)}>
                <FileWarning className="size-3.5" />
                {t("supply.act.flag")}
              </Button>
            )}
            {t(`supply.status.${s.status}`)} · {sum(lines, "received")}/{sum(lines, "expected")}
          </span>
        </div>
      ))}
      {open && <SupplyActPanel row={open} products={products} onClose={() => setOpenId(null)} />}
    </div>
  );
}

const sum = (lines: readonly SupplyActLine[], k: "expected" | "received") =>
  lines.reduce((n, l) => n + l[k], 0);
