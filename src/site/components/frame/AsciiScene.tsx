import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Генератор ASCII-сцен для баннеров витрины (Кирилл 23 окт). Работает как
 * ASCII-конвертер картинок: фигуры — плоские двуцветные силуэты (лист A4,
 * конверт, телефон, стеллаж…) — рисуются в маленький невидимый холст, где
 * один пиксель равен одной клетке сетки знаков. Яркость клетки выбирает знак
 * из шкалы плотности, как на первом экране лендинга: пусто → «.» → «%».
 * Крупная картинка складывается из множества таких «пикселей».
 *
 * Фигуры сами плывут вверх, листы «печатаются» строка за строкой, курсор
 * расталкивает фигуры и подсвечивает знаки рядом. Кадры не рисуются вне
 * экрана и в скрытой вкладке; при `prefers-reduced-motion` — один кадр.
 */

export type SceneKind = "docs" | "contacts" | "racks";

/** Шкала плотности — та же, что у поля на лендинге (`AsciiField`). */
const RAMP = "  .·:-=+*#%";
const FPS = 30;
/** Радиус, в котором курсор расталкивает фигуры, px. */
const REACH = 180;

type Draw = (c: CanvasRenderingContext2D, s: number, t: number) => void;

interface Sprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Размер фигуры, px; крупные ближе, ярче и быстрее. */
  size: number;
  draw: Draw;
  /** Своё время фигуры: печать строк, покачивание. */
  t: number;
  tilt: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// Фигуры рисуются вокруг нуля. Толщина линий — не тоньше клетки, иначе
// силуэт рассыпается в шум.

/** Лист A4 со строками, которые печатаются по очереди. */
const sheet: Draw = (c, s, t) => {
  const w = s * 0.7;
  const h = s;
  const lw = Math.max(9, s * 0.06);
  c.lineWidth = lw;
  c.strokeRect(-w / 2, -h / 2, w, h);
  c.fillRect(-w / 2 + lw * 1.8, -h / 2 + lw * 1.8, w * 0.45, lw * 1.3);
  const lines = 6;
  const typed = (t * 1.6) % (lines + 3);
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.75;
  for (let i = 0; i < lines; i++) {
    const k = Math.min(1, Math.max(0, typed - i));
    const len = (w - lw * 3.6) * (i % 3 === 2 ? 0.6 : 1) * k;
    c.fillRect(-w / 2 + lw * 1.8, -h / 2 + lw * 4.2 + i * lw * 1.9, len, lw * 0.8);
  }
  c.globalAlpha = a;
};

const envelope: Draw = (c, s) => {
  const w = s;
  const h = s * 0.66;
  c.lineWidth = Math.max(9, s * 0.07);
  c.lineJoin = "round";
  c.strokeRect(-w / 2, -h / 2, w, h);
  c.beginPath();
  c.moveTo(-w / 2, -h / 2);
  c.lineTo(0, h * 0.1);
  c.lineTo(w / 2, -h / 2);
  c.stroke();
};

const phone: Draw = (c, s) => {
  const w = s * 0.5;
  const h = s;
  c.lineWidth = Math.max(9, s * 0.07);
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, w * 0.2);
  c.stroke();
  c.fillRect(-w * 0.15, h / 2 - h * 0.13, w * 0.3, h * 0.05);
};

const bubble: Draw = (c, s) => {
  const w = s;
  const h = s * 0.62;
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, h * 0.35);
  c.moveTo(-w * 0.25, h / 2 - 2);
  c.lineTo(-w * 0.38, h / 2 + s * 0.22);
  c.lineTo(-w * 0.05, h / 2 - 2);
  c.fill();
};

const glyph =
  (text: string, k = 1): Draw =>
  (c, s) => {
    c.font = `700 ${s * k}px Arial, Helvetica, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 0, 0);
  };

/** Стеллаж: стойки, полки и коробки на части ячеек. */
const rack: Draw = (c, s, t) => {
  const w = s * 1.1;
  const h = s;
  const lw = Math.max(9, s * 0.06);
  c.lineWidth = lw;
  c.strokeRect(-w / 2, -h / 2, w, h);
  for (let r = 1; r < 3; r++) c.fillRect(-w / 2, -h / 2 + (h * r) / 3 - lw / 2, w, lw);
  c.fillRect(-lw / 2, -h / 2, lw, h);
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.7;
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 2; k++) {
      // Коробки появляются и пропадают — склад живёт.
      if (Math.sin(t * 0.7 + r * 2.1 + k * 3.7) < -0.2) continue;
      const bw = w / 2 - lw * 2.2;
      const bh = h / 3 - lw * 2.2;
      c.fillRect(-w / 2 + k * (w / 2) + lw * 1.1, -h / 2 + r * (h / 3) + lw * 1.1, bw, bh);
    }
  c.globalAlpha = a;
};

const box: Draw = (c, s) => {
  const lw = Math.max(9, s * 0.07);
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.6;
  c.fillRect(-s / 2, -s / 2, s, s * 0.8);
  c.globalAlpha = a;
  c.fillRect(-lw / 2, -s / 2, lw, s * 0.8);
};

const DRAWS: Record<SceneKind, { draw: Draw; size: [number, number] }[]> = {
  docs: [{ draw: sheet, size: [110, 210] }],
  contacts: [
    { draw: envelope, size: [120, 220] },
    { draw: phone, size: [120, 200] },
    { draw: bubble, size: [110, 190] },
    { draw: glyph("@"), size: [110, 200] },
    { draw: glyph("+7", 0.8), size: [100, 170] },
  ],
  racks: [
    { draw: rack, size: [130, 230] },
    { draw: rack, size: [130, 230] },
    { draw: box, size: [70, 130] },
  ],
};

function makeSprite(kind: SceneKind, w: number, h: number): Sprite {
  const pool = DRAWS[kind];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return {
    x: rnd(0, w),
    y: rnd(0, h),
    vx: rnd(-6, 6),
    vy: rnd(-14, -5),
    size: rnd(...pick.size),
    draw: pick.draw,
    t: rnd(0, 20),
    tilt: rnd(-0.15, 0.15),
  };
}

export function AsciiScene({
  kind,
  density = 1,
  ink = "255,255,255",
  className,
  style,
}: {
  kind: SceneKind;
  /** Множитель числа фигур. */
  density?: number;
  /** Цвет знаков, «r,g,b»: белый на синем, тёмный на белом. */
  ink?: string;
  className?: string;
  /** Растянуть холст за пределы родителя (подвал тянет сцену под блок заявки). */
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    // Невидимый холст-«картинка»: одна клетка сетки — один пиксель.
    const src = document.createElement("canvas");
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!canvas || !ctx || !sctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = 12;
    const ch = font * 1.2;
    let cw = font * 0.6;
    let w = 0;
    let h = 0;
    let cols = 0;
    let rows = 0;
    let sprites: Sprite[] = [];
    const mouse = { x: -1e4, y: -1e4 };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      cw = ctx.measureText("M").width || cw;
      cols = Math.max(1, Math.ceil(w / cw));
      rows = Math.max(1, Math.ceil(h / ch));
      src.width = cols;
      src.height = rows;
      const count = Math.max(5, Math.round(((w * h) / 60000) * density));
      sprites = Array.from({ length: count }, () => makeSprite(kind, w, h));
    };

    const step = (s: Sprite, dt: number) => {
      const dx = s.x - mouse.x;
      const dy = s.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < REACH && dist > 0.1) {
        const f = (1 - dist / REACH) * 320;
        s.vx += (dx / dist) * f * dt;
        s.vy += (dy / dist) * f * dt;
      }
      const depth = s.size / 160;
      s.vx -= s.vx * 0.9 * dt;
      s.vy += (-10 * depth - s.vy) * 0.8 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.t += dt;
      const r = s.size;
      // Уплывшая за верх фигура возвращается снизу новой.
      if (s.y < -r) Object.assign(s, makeSprite(kind, w, h), { y: h + r });
      if (s.x < -r) s.x = w + r;
      if (s.x > w + r) s.x = -r;
    };

    const draw = (dt: number) => {
      // 1. Картинка: силуэты белым на чёрном в масштабе сетки.
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.globalAlpha = 1;
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, cols, rows);
      sctx.fillStyle = "#fff";
      sctx.strokeStyle = "#fff";
      for (const s of sprites) {
        if (!still) step(s, dt);
        sctx.setTransform(1 / cw, 0, 0, 1 / ch, s.x / cw, s.y / ch);
        sctx.rotate(s.tilt + Math.sin(s.t * 0.5) * 0.04);
        sctx.globalAlpha = Math.min(1, 0.45 + s.size / 400);
        s.draw(sctx, s.size, s.t);
      }
      // Курсор проявляет знаки вокруг себя — «фонарик» по полю.
      if (mouse.x > -1e3) {
        sctx.setTransform(1 / cw, 0, 0, 1 / ch, 0, 0);
        sctx.globalAlpha = 1;
        const g = sctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, REACH * 0.7);
        g.addColorStop(0, "rgba(255,255,255,0.35)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        sctx.fillStyle = g;
        sctx.fillRect(mouse.x - REACH, mouse.y - REACH, REACH * 2, REACH * 2);
      }

      // 2. Перевод в знаки: яркость пикселя → знак из шкалы плотности.
      const px = sctx.getImageData(0, 0, cols, rows).data;
      ctx.clearRect(0, 0, w, h);
      ctx.textBaseline = "top";
      ctx.fillStyle = `rgb(${ink})`;
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const v = px[(y * cols + x) * 4] / 255;
          if (v < 0.08) continue;
          const sym = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
          if (sym === " ") continue;
          ctx.globalAlpha = 0.25 + v * 0.55;
          ctx.fillText(sym, x * cw, y * ch);
        }
      ctx.globalAlpha = 1;
    };

    resize();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let visible = true;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!visible || document.hidden || acc < 1 / FPS) return;
      draw(acc);
      acc = 0;
    };

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(0);
    });
    ro.observe(canvas);
    const host = canvas.parentElement ?? canvas;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -1e4;
      mouse.y = -1e4;
    };

    if (still) draw(0);
    else {
      raf = requestAnimationFrame(loop);
      host.addEventListener("pointermove", onMove);
      host.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [kind, density, ink]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={style}
    />
  );
}
