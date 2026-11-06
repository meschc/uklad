import { QrSvg } from "@/components/table/QrSvg";
import type { LabelPrinter } from "@/lib/labelPrinter";

/**
 * Этикетка стола в том виде, в каком она уходит на ленту: на экране скрыта,
 * в печати остаётся одна она. До этого кнопка «Печать» вызывала
 * `window.print()` без блока печати, и на бумагу уходил весь экран стола.
 *
 * Размер страницы равен размеру ленты (`@page`), поэтому системное окно печати
 * сразу предлагает нужную бумагу. Поля фиксированные 1,5 мм, код — самый
 * большой квадрат, какой влезает, номер читаемой строкой под текстом: если
 * этикетка помялась и не сканируется, его наберут руками.
 */

const MM_PX = 96 / 25.4;
const PAD_MM = 1.5;

export function PrintableLabel({
  code,
  lines,
  printer,
}: {
  code: string;
  lines: string[];
  printer: Pick<LabelPrinter, "widthMm" | "heightMm">;
}) {
  const { widthMm: w, heightMm: h } = printer;
  const horizontal = w >= h;
  const inner = { w: w - PAD_MM * 2, h: h - PAD_MM * 2 };
  // Горизонтально код слева и не больше 55% ширины, вертикально — сверху.
  const qr = horizontal ? Math.min(inner.h, inner.w * 0.55) : Math.min(inner.w, inner.h * 0.6);
  const font = Math.max(7, Math.min(w, h) * 0.3);

  return (
    <div className="print-root print-flow hidden print:block">
      <style>{`@page { size: ${w}mm ${h}mm; margin: 0; }`}</style>
      <div
        className="print-label box-border flex overflow-hidden bg-white text-black"
        style={{
          width: `${w}mm`,
          height: `${h}mm`,
          padding: `${PAD_MM}mm`,
          gap: `${PAD_MM}mm`,
          flexDirection: horizontal ? "row" : "column",
          fontSize: `${font}pt`,
          lineHeight: 1.15,
        }}
      >
        <QrSvg code={code} size={Math.round(qr * MM_PX)} showCode={false} />
        <div className="min-w-0 flex-1 overflow-hidden">
          {lines.map((l) => (
            <p key={l} className="truncate font-semibold">
              {l}
            </p>
          ))}
          <p className="break-all font-mono" style={{ fontSize: `${font * 0.85}pt` }}>
            {code}
          </p>
        </div>
      </div>
    </div>
  );
}
