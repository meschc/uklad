import { useEffect, useMemo, useRef, useState } from "react";

/**
 * ASCII-фон экрана входа (п.29). Волна из символов разной плотности: без
 * картинок и без внешних библиотек — только текст, поэтому он одинаково
 * выглядит в любой теме и ничего не весит.
 *
 * Сетка считается по фактическому размеру контейнера, поэтому полотно всегда
 * заполняет борд целиком, без обрезков и без прокрутки. Курсор внутри полотна
 * поднимает волну — фон отвечает на движение, а не просто крутится сам по себе.
 *
 * Анимация уважает `prefers-reduced-motion`: при включённой настройке рисуется
 * один статичный кадр.
 */

const CHARS = " ·:-=+*#%@";
/** Ширина и высота символа при `font-size: 1em` для моноширинного шрифта. */
const CHAR_W_RATIO = 0.62;
const LINE_H = 1;
const SPEED = 0.0012;
/** Насколько далеко (в клетках) чувствуется курсор. */
const POINTER_RADIUS = 14;

interface Grid {
  cols: number;
  rows: number;
}

function frame(time: number, grid: Grid, pointer: { x: number; y: number } | null): string {
  const lines: string[] = [];
  for (let y = 0; y < grid.rows; y++) {
    let line = "";
    for (let x = 0; x < grid.cols; x++) {
      // Две бегущие волны + «стеллажный» вертикальный ритм: движение похоже на
      // ряды склада, а не на абстрактный шум.
      const wave =
        Math.sin(x * 0.18 + time * SPEED) +
        Math.sin(y * 0.32 - time * SPEED * 0.7) +
        Math.sin((x + y) * 0.09 + time * SPEED * 0.4);
      const shelf = x % 6 === 0 ? 0.6 : 0;
      let v = (wave + 3) / 6 + shelf * 0.15;

      if (pointer) {
        // Радиальная волна от курсора: у самого указателя плотность максимальна
        // и спадает к краю радиуса.
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < POINTER_RADIUS) {
          const falloff = 1 - d / POINTER_RADIUS;
          v += falloff * falloff * (0.55 + 0.35 * Math.sin(d * 0.9 - time * 0.006));
        }
      }

      const idx = Math.max(0, Math.min(CHARS.length - 1, Math.round(v * (CHARS.length - 1))));
      line += CHARS[idx];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

export function AsciiBackdrop({
  className,
  fontSize = 14,
}: {
  className?: string;
  /** Размер символа в px — от него считается плотность сетки. */
  fontSize?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState<Grid>({ cols: 40, rows: 20 });
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);

  // Просьбу «меньше движения» читаем один раз при первом рендере: от неё
  // зависит, запускать ли цикл кадров вообще, а не только что в нём рисовать.
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Неподвижный кадр — чистая функция от сетки, поэтому считается прямо в
  // рендере, а не складывается в состояние эффектом. В состоянии живёт только
  // то, что нарисовали анимация и курсор; пока такого кадра нет, показываем
  // неподвижный. Смена сетки его обнуляет: старый кадр другого размера.
  const still = useMemo(() => frame(0, grid, null), [grid]);
  const [animated, setAnimated] = useState<string | null>(null);
  const [lastGrid, setLastGrid] = useState(grid);
  if (grid !== lastGrid) {
    setLastGrid(grid);
    setAnimated(null);
  }
  const text = animated ?? still;

  // Сетка под размер контейнера: пересчитывается на любой ресайз окна.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const { width, height } = host.getBoundingClientRect();
      setGrid({
        cols: Math.max(8, Math.floor(width / (fontSize * CHAR_W_RATIO))),
        rows: Math.max(4, Math.ceil(height / (fontSize * LINE_H))),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [fontSize]);

  useEffect(() => {
    if (reduced) return;
    const loop = (time: number) => {
      setAnimated(frame(time, grid, pointerRef.current));
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [grid, reduced]);

  const onMove = (e: React.PointerEvent) => {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    pointerRef.current = {
      x: (e.clientX - r.left) / (fontSize * CHAR_W_RATIO),
      y: (e.clientY - r.top) / (fontSize * LINE_H),
    };
    // Перерисовываем сразу, не дожидаясь кадра: отклик на курсор должен быть
    // мгновенным, и он остаётся даже там, где rAF приторможен (фон, вкладка).
    setAnimated(frame(performance.now(), grid, pointerRef.current));
  };

  return (
    <div
      ref={hostRef}
      onPointerMove={onMove}
      onPointerLeave={() => {
        pointerRef.current = null;
      }}
      className={className}
      style={{ overflow: "hidden" }}
    >
      <pre
        aria-hidden
        style={{
          margin: 0,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: `${fontSize}px`,
          lineHeight: LINE_H,
          letterSpacing: 0,
          userSelect: "none",
        }}
      >
        {text}
      </pre>
    </div>
  );
}
