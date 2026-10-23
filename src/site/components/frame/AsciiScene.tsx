import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Генератор ASCII-сцен для синих баннеров витрины (Кирилл 23 окт): не готовая
 * картинка, а много мелких фигур из знаков, которые сами плывут, печатаются и
 * расступаются перед курсором. Что за фигуры — решает назначение страницы: в
 * правовом разделе это листы A4, на которых строка за строкой появляется
 * текст, в контактах — трубки, конверты, пузыри чата и «@».
 *
 * Canvas, а не DOM: фигур десятки, знаков в них тысячи. Кадры не рисуются вне
 * экрана и в скрытой вкладке; при `prefers-reduced-motion` остаётся один
 * неподвижный кадр.
 */

export type SceneKind = "docs" | "contacts";

const FPS = 30;
/** Радиус, в котором курсор расталкивает фигуры, px. */
const REACH = 160;

interface Sprite {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Глубина: дальние фигуры мельче, тусклее и медленнее. */
  depth: number;
  rows: string[];
  /** Сколько знаков содержимого уже «напечатано». */
  typed: number;
  total: number;
  phase: number;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Лист A4: рамка, заголовок, строки разной длины, подпись. */
function docSheet(): string[] {
  const inner = 8;
  const line = (n: number, ch = "─") => ch.repeat(n).padEnd(inner, " ");
  const body = [line(Math.round(rnd(3, 6)), "═"), line(0)];
  const count = Math.round(rnd(5, 7));
  for (let i = 0; i < count; i++) body.push(line(Math.round(rnd(4, 8))));
  body.push(line(0));
  body.push(Math.random() < 0.5 ? " ✓──    " : "    ~~~ ");
  return [`┌${"─".repeat(inner)}┐`, ...body.map((b) => `│${b}│`), `└${"─".repeat(inner)}┘`];
}

const CONTACT_SPRITES: string[][] = [
  [" _________ ", "/  _____  \\", "|_/     \\_|"],
  ["┌─────────┐", "│╲       ╱│", "│  ╲   ╱  │", "│    ╳    │", "└─────────┘"],
  ["╭────────╮", "│ ──── ─ │", "│ ───    │", "╰─┬──────╯", "  ╵"],
  ["@"],
  ["+7 ··· ···"],
  ["╭───╮", "│ @ │", "╰───╯"],
];

function makeSprite(kind: SceneKind, w: number, h: number): Sprite {
  const rows =
    kind === "docs"
      ? docSheet()
      : CONTACT_SPRITES[Math.floor(Math.random() * CONTACT_SPRITES.length)];
  const total = rows.reduce((s, r) => s + r.length, 0);
  return {
    x: rnd(0, w),
    y: rnd(0, h),
    vx: rnd(-6, 6),
    vy: rnd(-14, -4),
    depth: rnd(0.55, 1.15),
    rows,
    typed: rnd(0, total),
    total,
    phase: rnd(0, Math.PI * 2),
  };
}

/** Строка листа с напечатанными `k` знаками содержимого: рамка видна всегда. */
function typedRow(row: string, k: number): string {
  const inner = row.slice(1, -1);
  return row[0] + inner.slice(0, k).padEnd(inner.length, " ") + row[row.length - 1];
}

export function AsciiScene({
  kind,
  density = 1,
  className,
}: {
  kind: SceneKind;
  /** Множитель числа фигур. */
  density?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const font = kind === "docs" ? 10 : 13;
    let w = 0;
    let h = 0;
    let sprites: Sprite[] = [];
    const mouse = { x: -9999, y: -9999 };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = kind === "docs" ? 15000 : 21000;
      const count = Math.max(8, Math.round(((w * h) / area) * density));
      sprites = Array.from({ length: count }, () => makeSprite(kind, w, h));
    };

    const step = (s: Sprite, dt: number) => {
      // Курсор расталкивает фигуры, потом они снова плывут сами вверх.
      const dx = s.x - mouse.x;
      const dy = s.y - mouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < REACH && dist > 0.1) {
        const f = (1 - dist / REACH) * 260;
        s.vx += (dx / dist) * f * dt;
        s.vy += (dy / dist) * f * dt;
      }
      s.vx -= s.vx * 0.9 * dt;
      s.vy += (-9 * s.depth - s.vy) * 0.8 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.typed += dt * 22;
      if (s.typed > s.total + 30) s.typed = 0;
    };

    const draw = (dt: number, time: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.textBaseline = "top";
      for (const s of sprites) {
        if (!still) step(s, dt);

        const size = font * s.depth;
        const lh = size * 1.12;
        const sw = s.rows[0].length * size * 0.62;
        const sh = s.rows.length * lh;
        // Уплывшая за верх фигура возвращается снизу новой — сцена не
        // повторяется.
        if (s.y < -sh) Object.assign(s, makeSprite(kind, w, h), { y: h + rnd(0, 40) });
        if (s.x < -sw) s.x = w;
        if (s.x > w + sw) s.x = -sw;

        const near = Math.max(
          0,
          1 - Math.hypot(s.x + sw / 2 - mouse.x, s.y + sh / 2 - mouse.y) / REACH,
        );
        const pulse = 0.85 + 0.15 * Math.sin(time / 900 + s.phase);
        const alpha = Math.min(1, (0.14 + 0.2 * s.depth + near * 0.5) * pulse);
        ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;

        let left = still ? s.total : Math.floor(s.typed);
        s.rows.forEach((row, r) => {
          const frame = r === 0 || r === s.rows.length - 1;
          const text = kind === "docs" && !frame ? typedRow(row, Math.max(0, left)) : row;
          if (!frame) left -= row.length - 2;
          ctx.fillText(text, s.x, s.y + r * lh);
        });
      }
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
      draw(acc, now);
      acc = 0;
    };

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      if (still) draw(0, 0);
    });
    ro.observe(canvas);
    const host = canvas.parentElement ?? canvas;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    if (still) draw(0, 0);
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
  }, [kind, density]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
