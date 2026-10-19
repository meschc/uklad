import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Поле ASCII-знаков на синем: по нему медленно идут волны, сверху вниз
 * проходит полоса «сканера», а курсор расталкивает знаки вокруг себя и
 * подсвечивает их. Только на синих фонах — первый экран и карточка тарифа
 * «Склад» (Кирилл 19 окт: без фигур из знаков, поле на весь фон и живое).
 *
 * Canvas, а не DOM: несколько тысяч знаков 30 раз в секунду DOM не потянет.
 * Поле лежит под всем блоком целиком; под текстом из `quiet` знаки те же, но
 * прозрачнее — текст читается, а поле не обрывается дырой. Кадры не рисуются,
 * пока поле вне экрана или вкладка скрыта; при `prefers-reduced-motion`
 * рисуется один неподвижный кадр и курсор на поле не влияет.
 */

const RAMP = "  .·:-=+*#%";
const LINE = 1.2;
const FPS = 30;
/** Радиус влияния курсора, px. */
const REACH = 140;
/** Насколько далеко курсор отталкивает знак у самого центра, px. */
const PUSH = 18;

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
  /** Блоки текста, под которыми поле прозрачнее. */
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
    /** Прозрачность клетки: 1 — открытое поле, меньше — под текстом. */
    let mask = new Float32Array(0);
    let visible = true;
    let raf = 0;
    let last = 0;
    // Курсор в координатах поля; `force` плавно растёт, пока курсор над
    // полем, и гаснет, когда он ушёл, — знаки возвращаются на место без рывка.
    const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: false, force: 0 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#fff";
      cw = ctx.measureText("M").width || cw;
      cols = Math.ceil(w / cw);
      rows = Math.ceil(h / ch);

      mask = new Float32Array(cols * rows).fill(1);
      const box = canvas.getBoundingClientRect();
      for (const q of quiet ?? []) {
        const r = q.current?.getBoundingClientRect();
        if (!r) continue;
        const pad = 16;
        const c0 = Math.max(0, Math.floor((r.left - box.left - pad) / cw));
        const c1 = Math.min(cols, Math.ceil((r.right - box.left + pad) / cw));
        const r0 = Math.max(0, Math.floor((r.top - box.top - pad) / ch));
        const r1 = Math.min(rows, Math.ceil((r.bottom - box.top + pad) / ch));
        for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) mask[y * cols + x] = 0.35;
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      // Полоса сканера: проходит поле за ~7 с и уходит за край перед повтором.
      const scan = ((t / 7000) % 1.3) * rows;
      ptr.x += (ptr.tx - ptr.x) * 0.25;
      ptr.y += (ptr.ty - ptr.y) * 0.25;
      ptr.force += ((ptr.on ? 1 : 0) - ptr.force) * 0.12;
      const touch = ptr.force > 0.01;

      for (let y = 0; y < rows; y++) {
        const near = Math.max(0, 1 - Math.abs(y - scan) / 1.5);
        for (let x = 0; x < cols; x++) {
          const v =
            Math.sin(x * 0.21 + t * 0.0007) +
            Math.sin(y * 0.29 - t * 0.0005) +
            Math.sin((x - y) * 0.13 + t * 0.0004) +
            Math.sin(Math.hypot(x - cols * 0.72, (y - rows * 0.45) * 1.6) * 0.22 - t * 0.0015);
          let n = (v + 4) / 8 + (grain(x, y) - 0.5) * 0.22;
          let px = x * cw;
          let py = y * ch;

          if (touch) {
            const dx = px + cw / 2 - ptr.x;
            const dy = py + ch / 2 - ptr.y;
            const d = Math.hypot(dx, dy);
            if (d < REACH) {
              const k = (1 - d / REACH) ** 2 * ptr.force;
              const len = d || 1;
              px += (dx / len) * PUSH * k;
              py += (dy / len) * PUSH * k;
              n += k * 0.6;
            }
          }

          const lit = near > 0 && grain(y, x) < near * 0.7;
          const level = Math.min(1, Math.max(0, n * n * 1.5 + (lit ? 0.45 : 0)));
          const i = Math.floor(level * (RAMP.length - 1));
          if (i < 2) continue;
          ctx.globalAlpha = (0.08 + level * 0.4) * strength * mask[y * cols + x];
          ctx.fillText(RAMP[i], px, py);
        }
      }
      ctx.globalAlpha = 1;
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

    // Canvas не ловит указатель (под ним кнопки), поэтому слушаем окно и
    // проверяем, попал ли курсор в прямоугольник поля.
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      ptr.on = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      if (!ptr.on) return;
      if (ptr.x < -1e3) {
        ptr.x = x;
        ptr.y = y;
      }
      ptr.tx = x;
      ptr.ty = y;
    };
    const leave = () => {
      ptr.on = false;
    };

    if (!still) {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", move, { passive: true });
      document.documentElement.addEventListener("pointerleave", leave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
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
