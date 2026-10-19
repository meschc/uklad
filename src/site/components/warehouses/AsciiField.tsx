import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Поле ASCII-знаков на синем: по нему медленно идут волны, а сверху вниз
 * проходит полоса «сканера» и на миг высвечивает знаки. Только на синих
 * фонах — первый экран и карточка тарифа «Склад» (решение Кирилла 19 окт:
 * без фигур из знаков и без рамки вокруг окна кабинета, «пускай просто
 * будет»).
 *
 * Canvas, а не DOM: несколько тысяч знаков 20 раз в секунду DOM не потянет.
 * Под текстом поле гаснет: блоки из `quiet` приглушают свои клетки, а на
 * широком экране без них гаснет левая треть. Кадры не рисуются, пока поле
 * вне экрана или вкладка скрыта; при `prefers-reduced-motion` рисуется один
 * неподвижный кадр.
 */

const RAMP = "  .·:-=+*#%";
const LINE = 1.2;
const FPS = 20;

/** Постоянный «шум» клетки: ломает ровные строки одинаковых знаков. */
const grain = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function AsciiField({
  quiet,
  strength = 1,
  font = 14,
  className,
}: {
  /** Блоки текста, под которыми поле почти гаснет. */
  quiet?: RefObject<HTMLElement | null>[];
  /** Множитель яркости: на карточке тарифа поле тише, чем на первом экране. */
  strength?: number;
  font?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ch = font * LINE;
    let w = 0;
    let h = 0;
    let cw = font * 0.6;
    let cols = 0;
    let rows = 0;
    /** Яркость клетки: 1 — поле видно, меньше — под текстом тише. */
    let mask = new Float32Array(0);
    let visible = true;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = "top";
      cw = ctx.measureText("M").width || cw;
      cols = Math.ceil(w / cw);
      rows = Math.ceil(h / ch);

      mask = new Float32Array(cols * rows);
      const wide = w >= 1024;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++)
          mask[y * cols + x] =
            wide && !quiet ? Math.min(1, Math.max(0.1, (x / cols - 0.3) * 2.2)) : 1;

      const box = canvas.getBoundingClientRect();
      for (const q of quiet ?? []) {
        const r = q.current?.getBoundingClientRect();
        if (!r) continue;
        const pad = 24;
        const c0 = Math.max(0, Math.floor((r.left - box.left - pad) / cw));
        const c1 = Math.min(cols, Math.ceil((r.right - box.left + pad) / cw));
        const r0 = Math.max(0, Math.floor((r.top - box.top - pad) / ch));
        const r1 = Math.min(rows, Math.ceil((r.bottom - box.top + pad) / ch));
        for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) mask[y * cols + x] = 0.1;
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // Полоса сканера: проходит поле за ~7 с и уходит за край перед повтором.
      const scan = ((t / 7000) % 1.3) * rows;

      for (let y = 0; y < rows; y++) {
        const near = Math.max(0, 1 - Math.abs(y - scan) / 1.5);
        for (let x = 0; x < cols; x++) {
          const v =
            Math.sin(x * 0.21 + t * 0.0007) +
            Math.sin(y * 0.29 - t * 0.0005) +
            Math.sin((x - y) * 0.13 + t * 0.0004) +
            Math.sin(Math.hypot(x - cols * 0.72, (y - rows * 0.45) * 1.6) * 0.22 - t * 0.0015);
          const n = (v + 4) / 8 + (grain(x, y) - 0.5) * 0.22;
          const m = mask[y * cols + x];
          // Сканер светит только там, где поле видно, — не под текстом.
          const lit = near > 0 && m > 0.6 && grain(y, x) < near * 0.7;
          const level = Math.min(1, Math.max(0, n * n * 1.5 * m + (lit ? 0.45 : 0)));
          const i = Math.floor(level * (RAMP.length - 1));
          if (i < 2) continue;
          ctx.fillStyle = `rgba(255,255,255,${((0.1 + level * 0.45) * strength).toFixed(3)})`;
          ctx.fillText(RAMP[i], x * cw, y * ch);
        }
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 1000 / FPS) return;
      last = now;
      draw(now);
    };

    resize();
    draw(2400);

    const ro = new ResizeObserver(() => {
      resize();
      draw(last || 2400);
    });
    ro.observe(canvas);

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);

    if (!still) raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [quiet, strength, font]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
