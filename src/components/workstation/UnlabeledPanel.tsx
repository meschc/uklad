import { Tags } from "lucide-react";
import type { UnlabeledScan } from "@/lib/unlabeled";
import type { OutboundBox } from "@/lib/types";
import { useEditor } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { CodeTail } from "@/components/fulfillment/CodeTail";

/**
 * Сортировщик отсканировал товар вместо посылки: этикетки на нём нет. Панель
 * показывает, чью этикетку он потерял (`lib/unlabeled.ts`): посылку с этим
 * товаром и её соседей по таре — что упаковали перед ней и после, с товаром
 * и артикулом. Этого хватает, чтобы сортировщик разобрался сам: вскрыл
 * посылку, сверил товар с этикеткой и переложил.
 */
export function UnlabeledPanel({ scan, onDone }: { scan: UnlabeledScan; onDone: () => void }) {
  const t = useT();
  const { product, leads } = scan;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning-fill/70 bg-warning-fill/15 p-4">
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
          <ul className="flex flex-col gap-4 text-sm">
            {leads.map((l) => (
              <li key={l.box.id} className="flex flex-col gap-2">
                <Neighbours title={t("ws.sort.unlabeledBefore")} boxes={l.before} />
                <div className="flex flex-col gap-0.5">
                  <ParcelRow box={l.box} />
                  <span className="text-muted-foreground">
                    {l.box.sortCode
                      ? t("ws.sort.unlabeledSorted", { point: l.box.sortCode })
                      : t("ws.sort.unlabeledWaiting")}
                  </span>
                </div>
                <Neighbours
                  title={t(l.ordered ? "ws.sort.unlabeledAfter" : "ws.sort.unlabeledTote")}
                  boxes={l.after}
                />
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

function Neighbours({ title, boxes }: { title: string; boxes: OutboundBox[] }) {
  const t = useT();
  if (boxes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-l-2 border-warning/50 pl-3">
      <span className={eyebrow({ tone: "muted", size: "xs" })}>{title}</span>
      {boxes.map((b) => (
        <span key={b.id} className="flex flex-col">
          <ParcelRow box={b} />
          <span className="text-xs text-muted-foreground">
            {b.sortCode
              ? t("ws.sort.unlabeledIn", { point: b.sortCode })
              : t("ws.sort.unlabeledWaiting")}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Код посылки и что в ней по учёту: товар и артикул — то же, что на этикетке. */
function ParcelRow({ box }: { box: OutboundBox }) {
  const products = useEditor((s) => s.products);
  const items = box.lines.map((l) => {
    const p = products.find((x) => x.id === l.productId);
    return { key: l.productId, name: p?.name ?? l.productId, sku: p?.sku, qty: l.qty };
  });
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <CodeTail code={box.code} className="font-semibold" />
      {items.map((it) => (
        <span key={it.key} className="min-w-0 break-words">
          {it.name}
          {it.sku && <span className="ml-2 font-mono text-muted-foreground">{it.sku}</span>}
          {it.qty > 1 && <span className="ml-1 tabular-nums"> × {it.qty}</span>}
        </span>
      ))}
    </span>
  );
}
