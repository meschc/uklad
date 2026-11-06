import type { LabelTemplate } from "@/lib/types";
import { LabelCard, type LabelKind } from "./LabelCard";

/**
 * Печатная версия пачки наклеек: на экране скрыта, в печати остаётся она одна,
 * каждая наклейка — отдельной страницей. Размер страницы равен размеру ленты:
 * печать идёт на рулон, а не на A4. Стиль живёт здесь, а не в index.css,
 * потому что зависит от шаблона.
 *
 * Общая для экрана «Наклейки», «Что это?» и стола: наклейка везде одна и та же.
 */
export function LabelPrint({
  tpl,
  items,
  kind,
  warehouseName,
}: {
  tpl: LabelTemplate;
  items: { code: string; lines?: string[]; headline?: string }[];
  kind: LabelKind;
  warehouseName: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="print-root print-flow hidden print:block">
      <style>{`@page { size: ${tpl.widthMm}mm ${tpl.heightMm}mm; margin: 0; }`}</style>
      {items.map((it, i) => (
        <LabelCard
          key={it.code}
          tpl={tpl}
          code={it.code}
          kind={kind}
          warehouseName={warehouseName}
          index={i + 1}
          total={items.length}
          lines={it.lines}
          headline={it.headline}
          className="border-0"
        />
      ))}
    </div>
  );
}
