import { useState } from "react";
import { useEditor } from "@/lib/store";
import { requestsRepository } from "@/lib/data";
import { useCommand } from "@/lib/useCommand";
import { useT } from "@/lib/i18n";
import type { FulfillmentRequest } from "@/lib/types";
import { Button } from "@/components/ui/button";

/** Можно ли продавцу отменить заявку сам: своя, новая, ничего не снято, без брони. */
const sellerMayCancel = (r: FulfillmentRequest) =>
  r.by === "seller" &&
  r.status === "new" &&
  !r.pickedQty &&
  !r.reservedShipmentId &&
  !(r.startedAt || r.toteId || r.packedAt || r.shipmentId);

/**
 * Отмена своей заявки продавцом — в строке, без окна: первое нажатие
 * спрашивает «Отменить заявку?», второе отменяет. Начатую склад отменяет
 * сам: сервер такую не отменит (`sellerRequests.js`, `started`).
 */
export function SellerCancel({ request }: { request: FulfillmentRequest }) {
  const t = useT();
  const notify = useEditor((s) => s.notify);
  const [sure, setSure] = useState(false);
  const cancel = useCommand(() => requestsRepository.setStatus(request.id, "cancelled"), {
    exclusive: true,
  });
  if (!sellerMayCancel(request)) return null;

  const run = async () => {
    const res = await cancel.run();
    setSure(false);
    if (!res.ok) notify("error", res.error);
  };

  if (!sure) {
    return (
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => setSure(true)}>
        {t("seller.cancel")}
      </Button>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-2xs">
      <span className="text-muted-foreground">{t("seller.cancelSure")}</span>
      <Button size="sm" variant="destructive" disabled={cancel.pending} onClick={run}>
        {t("seller.cancelYes")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setSure(false)}>
        {t("common.no")}
      </Button>
    </div>
  );
}
