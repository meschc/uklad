import type { ExpectedShipment } from "@/lib/types";
import { type TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Полоса активной поставки: сколько ждали, сколько уже приняли и кнопка «сдать».
 *
 * Цифра «за смену» отдельно от общей: приёмку одной поставки нередко ведут в
 * две руки и в два захода, и «принято 40 из 100» без «мною сейчас — 12» не
 * отвечает на вопрос кладовщика о собственной работе.
 */
export function ShipmentBar({
  shipment,
  received,
  onClose,
  done,
  t,
}: {
  shipment: ExpectedShipment;
  received: number;
  onClose: () => void;
  done: boolean;
  t: TFunc;
}) {
  const expected = shipment.lines.reduce((s, l) => s + l.expectedQty, 0);
  const got = shipment.lines.reduce((s, l) => s + l.receivedQty, 0);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
        done ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card",
      )}
    >
      <div className="min-w-0 text-xs">
        <p className="truncate font-medium">{shipment.title || t("recv.pick.untitled")}</p>
        <p className="text-muted-foreground">
          {t("recv.bar.progress", { got, expected })}
          {received > 0 && ` · ${t("recv.bar.session", { n: received })}`}
        </p>
      </div>
      <Button size="sm" variant={done ? "default" : "outline"} onClick={onClose}>
        {t(done ? "recv.bar.finish" : "recv.bar.finishEarly")}
      </Button>
    </div>
  );
}
