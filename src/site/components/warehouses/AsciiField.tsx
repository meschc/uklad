import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Фон первого экрана: поле ASCII-знаков, по которому медленно идут волны,
 * а сверху вниз проходит полоса «сканера» и на миг высвечивает знаки.
 * Попросил Кирилл 19 окт вместо белых полос — движение без картинки и без
 * градиента, в том же белом по синему.
 *
 * Canvas, а не DOM: несколько тысяч знаков 20 раз в секунду DOM не потянет.
 * Левая часть, где заголовок, гаснет маской — текст читается поверх поля.
 * Кадры не рисуются, пока экран вне поля зрения или вкладка скрыта; при
 * `prefers-reduced-motion` рисуется один неподвижный кадр.
 */

const RAMP = "  .·:-=+*#%";
const FONT_PX = 14;
const LINE = 1.2;

/** Постоянный «шум» клетки: ломает ровные строки одинаковых знаков. */
const grain = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const FPS = 20;

export function AsciiField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let cw = 8;
    const ch = FONT_PX * LINE;
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
      ctx.font = `${FONT_PX}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = "top";
      cw = ctx.measureText("M").width || 8;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cols = Math.ceil(w / cw);
      const rows = Math.ceil(h / ch);
      const wide = w >= 1024;
      // Полоса сканера: проходит экран за ~7 с и уходит за край перед повтором.
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
          // Маска: слева, под заголовком, поле почти гаснет.
          const mask = wide ? Math.min(1, Math.max(0.1, (x / cols - 0.3) * 2.2)) : 0.38;
          // Сканер светит только там, где поле видно, — не под текстом.
          const lit = near > 0 && mask > 0.6 && grain(y, x) < near * 0.7;
          const level = Math.min(1, Math.max(0, n * n * 1.5 * mask + (lit ? 0.45 : 0)));
          const i = Math.floor(level * (RAMP.length - 1));
          if (i < 2) continue;
          ctx.fillStyle = `rgba(255,255,255,${(0.1 + level * 0.45).toFixed(3)})`;
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
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
