import { useEditor } from "@/lib/store";
import { startOfDay } from "@/lib/workstation";
import { useT, type MsgKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { card } from "@/components/ui/card";
import { formatTime } from "./useNow";

/**
 * Свой журнал за сегодня (узел cab-staff-log). Сотрудник видит ровно то же,
 * что увидит руководитель. Время — до секунды: по нему считается время упаковки.
 */
export function StaffLog({ staffId, now }: { staffId: string; now: number }) {
  const t = useT();
  const events = useEditor((s) => s.staffEvents);
  const productList = useEditor((s) => s.products);
  const products = new Map(productList.map((p) => [p.id, p.name]));
  const from = startOfDay(now);
  const today = events.filter((e) => e.staffId === staffId && e.at >= from).reverse();

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{t("ws.log.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("ws.log.body")}</p>
      </div>
      {today.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ws.log.empty")}</p>
      ) : (
        <ol className={card({ pad: "none", className: "divide-y divide-border" })}>
          {today.map((e) => (
            <li
              key={e.id}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 px-4 py-2 text-sm"
            >
              <span className="tabular-nums text-muted-foreground">
                {formatTime(e.at, t.lang, true)}
              </span>
              <span className={cn(e.type === "pack_error" && "text-destructive")}>
                {t(`ws.ev.${e.type}` as MsgKey)}
                {e.productId && products.get(e.productId) && ` · ${products.get(e.productId)}`}
                {e.ms != null && (
                  <span className="ml-2 tabular-nums text-muted-foreground">
                    {t("ws.run.sec", { n: Math.round(e.ms / 1000) })}
                  </span>
                )}
                {e.code && (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{e.code}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
