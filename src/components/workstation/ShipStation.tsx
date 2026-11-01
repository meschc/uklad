import { useState } from "react";
import { Truck } from "lucide-react";
import { useEditor } from "@/lib/store";
import { groupRequestsByTarget } from "@/lib/fulfillment";
import type { FulfillmentRequest } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { card } from "@/components/ui/card";
import { eyebrow } from "@/components/ui/eyebrow";
import { EmptyState } from "@/components/fulfillment/ScreenShell";

/**
 * Отгрузка за столом: собранные заявки одного назначения уезжают одной
 * машиной (`shipRequests`). Отгрузил тот, кто вошёл по бейджу, — выбирать его
 * из списка незачем. Машину, если её назвал продавец, подставляем сами.
 */
export function ShipStation({ staffId }: { staffId: string }) {
  const t = useT();
  const requests = useEditor((s) => s.requests);
  const ready = groupRequestsByTarget(requests.filter((r) => r.status === "done"));

  if (ready.length === 0) {
    return (
      <EmptyState
        icon={<Truck className="size-5" />}
        title={t("ws.ship.emptyTitle")}
        body={t("ws.ship.empty")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {ready.map((g) => (
        <ShipGroup
          key={g.target ?? "—"}
          target={g.target ?? t("ws.ship.noTarget")}
          items={g.items}
          staffId={staffId}
        />
      ))}
    </div>
  );
}

function ShipGroup({
  target,
  items,
  staffId,
}: {
  target: string;
  items: FulfillmentRequest[];
  staffId: string;
}) {
  const t = useT();
  const products = useEditor((s) => s.products);
  const shipRequests = useEditor((s) => s.shipRequests);
  // Разные машины в одной группе не склеиваем — тогда поле пустое.
  const named = [...new Set(items.map((r) => r.vehicle).filter(Boolean))];
  const [vehicle, setVehicle] = useState(named.length === 1 ? (named[0] as string) : "");

  // Недостача — собрано меньше, чем заказано: такую машину не отправляют молча.
  const short = items.reduce((n, r) => n + Math.max(0, r.qty - (r.pickedQty ?? r.qty)), 0);

  const ship = () =>
    shipRequests(
      items.map((r) => r.id),
      { vehicle: vehicle.trim() || undefined, staffId },
    );

  return (
    <section className={card({ className: "flex flex-col gap-3" })}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{target}</h3>
        <span className={eyebrow({ tone: "muted" })}>
          {t("ws.ship.count", { n: items.length })}
        </span>
      </div>
      {/* Проверка перед погрузкой: сколько заказано и сколько реально собрано. */}
      <ul className="flex flex-col gap-1 text-sm">
        {items.map((r) => {
          const got = r.pickedQty ?? r.qty;
          return (
            <li key={r.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">
                {products.find((p) => p.id === r.productId)?.name ?? "—"}
              </span>
              <span className={cn("tabular-nums", got < r.qty && "font-medium text-destructive")}>
                {got} / {r.qty}
              </span>
            </li>
          );
        })}
      </ul>
      {short > 0 && <p className="text-xs text-destructive">{t("ws.ship.short", { n: short })}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t("ship.vehicle")}</span>
          <Input
            value={vehicle}
            placeholder={t("ship.vehiclePlaceholder")}
            onChange={(e) => setVehicle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ship();
            }}
          />
        </label>
        <Button variant={short > 0 ? "outline" : "default"} onClick={ship}>
          <Truck />
          {t(short > 0 ? "ws.ship.confirmShort" : "ship.confirm")}
        </Button>
      </div>
    </section>
  );
}
