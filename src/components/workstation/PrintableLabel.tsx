import { useEditor } from "@/lib/store";
import type { LabelPrinter } from "@/lib/labelPrinter";
import type { LabelTemplate } from "@/lib/types";
import { LabelPrint } from "@/components/fulfillment/LabelPrint";

/**
 * Этикетка стола в том виде, в каком она уходит на ленту: на экране скрыта,
 * в печати остаётся одна она. Рисует её тот же компонент, что и экран
 * «Наклейки» (`LabelCard`): код во всю короткую сторону, номер крупно, строки
 * разнесены по краям. Своей вёрстки у стола нет — две этикетки расходились бы
 * при первой же правке.
 *
 * Размер страницы равен размеру ленты (`@page`), поэтому системное окно печати
 * сразу предлагает нужную бумагу.
 */
export function PrintableLabel({
  code,
  lines,
  items,
  printer,
}: {
  code?: string;
  lines?: string[];
  /** Несколько этикеток подряд — ярлыки грузовых мест отгрузки. */
  items?: { code: string; lines: string[] }[];
  printer: Pick<LabelPrinter, "widthMm" | "heightMm">;
}) {
  const warehouseName = useEditor((s) => s.warehouse.name);
  const tpl: LabelTemplate = {
    id: "workstation",
    name: "workstation",
    widthMm: printer.widthMm,
    heightMm: printer.heightMm,
    layout: printer.widthMm >= printer.heightMm ? "horizontal" : "vertical",
    codeType: "qr",
    // Склад не печатаем: на столе важнее товар и заказ, они идут своими строками.
    elements: ["code"],
    codeScale: 0.6,
    createdAt: 0,
  };
  return (
    <LabelPrint
      tpl={tpl}
      items={items ?? [{ code: code ?? "", lines: lines ?? [] }]}
      kind="custom"
      warehouseName={warehouseName}
    />
  );
}
