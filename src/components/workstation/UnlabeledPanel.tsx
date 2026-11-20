import { Tags } from "lucide-react";
import type { UnlabeledScan } from "@/lib/unlabeled";
import type { OutboundBox } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { CodeTail } from "@/components/fulfillment/CodeTail";

/**
 * Сортировщик отсканировал товар вместо посылки: этикетки на нём нет. Панель
 * показывает, чью этикетку он потерял (`lib/unlabeled.ts`): разложенная
 * посылка с этим товаром — первая подозреваемая, под ней — посылки той же
 * тары, упакованные следом, на них этикетки могли сдвинуться цепочкой.
 */
export function UnlabeledPanel({ scan, onDone }: { scan: UnlabeledScan; onDone: () => void }) {
  const t = useT();
  const { product, leads } = scan;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
      <p className="flex items-center gap-2 text-lg font-semibold">
        <Tags className="size-5 shrink-0 text-warning" />
        <span className="line-clamp-2 min-w-0 break-words" title={product.name}>
          {t("ws.sort.unlabeledTitle", { name: product.name })}
        </span>
      </p>
      <p className="font-mono text-sm text-muted-foreground">{product.sku}</p>
      {leads.length === 0 ? (
        <p className="text-sm">{t("ws.sort.unlabeledNone")}</p>
      ) : (
        <>
          <p className="text-sm">{t("ws.sort.unlabeledHint")}</p>
          <ul className="flex flex-col gap-3 text-sm">
            {leads.map((l) => (
              <li key={l.box.id} className="flex flex-col gap-1">
                <ParcelRow box={l.box} />
                {l.after.length > 0 && (
                  <div className="flex flex-col gap-1 border-l-2 border-warning/50 pl-3">
                    <span className={eyebrow({ tone: "muted", size: "xs" })}>
                      {t("ws.sort.unlabeledAfter")}
                    </span>
                    {l.after.map((b) => (
                      <ParcelRow key={b.id} box={b} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={onDone}>
        {t("ws.sort.unlabeledDone")}
      </Button>
    </div>
  );
}

function ParcelRow({ box }: { box: OutboundBox }) {
  const t = useT();
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <CodeTail code={box.code} className="font-semibold" />
      <span className="text-muted-foreground">
        {box.sortCode
          ? t("ws.sort.unlabeledSorted", { point: box.sortCode })
          : t("ws.sort.unlabeledWaiting")}
      </span>
    </span>
  );
}
