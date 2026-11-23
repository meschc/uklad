import type { ParcelCard } from "@/lib/parcelCard";
import type { TFunc } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CodeText } from "./CodeTail";

/**
 * Карточка найденной посылки (Кирилл 23.11): что за заказ, чей, что внутри и
 * что делать дальше. Одна и та же у старшего за столом и в «Что это?».
 */
export function ParcelCardView({ card, t }: { card: ParcelCard; t: TFunc }) {
  const next =
    card.state === "cancelled"
      ? t("parcel.next.cancelled")
      : card.state === "shipped"
        ? t("parcel.next.shipped")
        : card.sortCode
          ? t("parcel.next.toPoint", { point: card.sortCode })
          : t("parcel.next.toSort");
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-medium">
          <CodeText text={card.box.code} />
        </p>
        <span
          className={cn(
            "text-sm font-medium",
            card.state === "cancelled" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {t(`parcel.state.${card.state}`)}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{t("parcel.orders")}</dt>
        <dd>{card.orders.join(", ") || "—"}</dd>
        <dt className="text-muted-foreground">{t("parcel.source")}</dt>
        <dd>{card.sources.map((s) => t(`order.source.${s}`)).join(", ") || "—"}</dd>
        <dt className="text-muted-foreground">{t("parcel.seller")}</dt>
        <dd>{card.sellers.join(", ") || "—"}</dd>
      </dl>
      <ul className="flex flex-col gap-1 text-sm">
        {card.lines.map((l) => (
          <li key={l.productId} className="flex justify-between gap-3">
            <span className="truncate">{l.product?.name ?? l.productId}</span>
            <span className="tabular-nums">× {l.qty}</span>
          </li>
        ))}
      </ul>
      <p className={cn("text-sm font-medium", card.state === "cancelled" && "text-destructive")}>
        {next}
      </p>
    </section>
  );
}
