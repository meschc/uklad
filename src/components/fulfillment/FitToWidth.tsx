import { useLayoutEffect, useRef, useState } from "react";

/** Миллиметр в CSS-пикселях: 96 точек на дюйм, 25,4 мм в дюйме. */
const PX_PER_MM = 96 / 25.4;

/**
 * Предпросмотр ярлыка, который не вылезает за колонку.
 *
 * Ярлык рисуется в миллиметрах, в натуральную величину: так видно, что именно
 * выйдет из принтера. Но 150×100 мм — это 567 px, шире колонки предпросмотра,
 * и ярлык обрезался (Кирилл 12 ноя). Здесь он ужимается под ширину колонки, а
 * если помещается — остаётся в натуральную величину. Печать идёт отдельным
 * блоком (`LabelPrint`) и масштаб не наследует.
 */
export function FitToWidth({
  widthMm,
  heightMm,
  children,
}: {
  widthMm: number;
  heightMm: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const w = widthMm * PX_PER_MM;
  const h = heightMm * PX_PER_MM;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / w));
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);

  return (
    <div ref={ref} className="w-full" style={{ height: h * scale }}>
      <div style={{ width: w, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}
