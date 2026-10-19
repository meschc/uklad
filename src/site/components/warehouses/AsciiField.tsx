import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Живое поле квадратов: склад, на котором товар раскладывают по ячейкам.
 *
 * Квадраты стоят в узлах сетки, как коробки по адресам, и время от времени
 * один из них переезжает в свободную ячейку. Курсор (или палец) расталкивает
 * их, после чего они возвращаются на свои места. Попросил Кирилл 19 окт:
 * интерактивное поле, где перемещаются квадраты, а не знаки и не круги.
 *
 * Два режима:
 * - `field` заполняет первый экран. Слева, под заголовком, поле гаснет, чтобы
 *   текст читался;
 * - `frame` кладёт квадраты полосой вокруг окна кабинета и подсвечивает его,
 *   не заходя внутрь: середину закрывает само окно.
 *
 * Canvas, а не DOM: сотни объектов 60 раз в секунду DOM не потянет. Кадры не
 * рисуются, пока поле вне экрана или вкладка скрыта; при
 * `prefers-reduced-motion` остаётся один неподвижный кадр без реакции на
 * курсор.
 */

type Mode = "field" | "frame";

interface Box {
  /** Индекс ячейки, где квадрат стоит или куда едет. */
  cell: number;
  /** Откуда едет и когда выехал: переезд плавный, а не прыжком. */
  from: number;
  moveAt: number;
  /** Смещение от курсора, затухает пружиной. */
  dx: number;
  dy: number;
  size: number;
  alpha: number;
}

const MOVE_MS = 900;
const RADIUS = 120;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function AsciiField({ mode = "field", className }: { mode?: Mode; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = mode === "field" ? 26 : 18;
    let w = 0;
    let h = 0;
    let cells: { x: number; y: number }[] = [];
    let boxes: Box[] = [];
    let taken = new Set<number>();
    let raf = 0;
    let visible = true;
    let nextMove = 0;
    const pointer = { x: -1e4, y: -1e4 };
    let color = "#ffffff";

    /** Ячейки режима `frame`: полоса шириной в три клетки вокруг окна. */
    const inBand = (x: number, y: number) => {
      const pad = step * 3;
      const inner = x > pad && x < w - pad && y > pad && y < h - pad;
      return !inner;
    };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = getComputedStyle(canvas).color || color;

      cells = [];
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          if (mode === "frame" && !inBand(x, y)) continue;
          cells.push({ x, y });
        }
      }

      // Заняты не все ячейки: свободные нужны, чтобы было куда переезжать.
      const share = mode === "field" ? 0.24 : 0.22;
      taken = new Set();
      boxes = [];
      cells.forEach((_, i) => {
        if (Math.random() > share) return;
        taken.add(i);
        boxes.push({
          cell: i,
          from: i,
          moveAt: -MOVE_MS,
          dx: 0,
          dy: 0,
          size:
            mode === "field"
              ? 4 + Math.round(Math.random() * 4)
              : 3 + Math.round(Math.random() * 3),
          alpha: mode === "field" ? 0.15 + Math.random() * 0.35 : 0.25 + Math.random() * 0.55,
        });
      });
    };

    /** Один квадрат уезжает в соседнюю свободную ячейку. */
    const relocate = (now: number) => {
      if (!boxes.length) return;
      const box = boxes[Math.floor(Math.random() * boxes.length)];
      const here = cells[box.cell];
      const near: number[] = [];
      cells.forEach((c, i) => {
        if (taken.has(i)) return;
        const d = Math.abs(c.x - here.x) + Math.abs(c.y - here.y);
        if (d > 0 && d <= step * 3) near.push(i);
      });
      if (!near.length) return;
      const to = near[Math.floor(Math.random() * near.length)];
      taken.delete(box.cell);
      taken.add(to);
      box.from = box.cell;
      box.cell = to;
      box.moveAt = now;
    };

    /** Гасит поле слева, где на широком экране стоит заголовок. */
    const mask = (x: number) => {
      if (mode !== "field" || w < 1024) return 1;
      return Math.min(1, Math.max(0.12, (x / w - 0.25) * 2.4));
    };

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      for (const b of boxes) {
        const a = cells[b.from];
        const z = cells[b.cell];
        const k = ease(Math.min(1, (now - b.moveAt) / MOVE_MS));
        let x = a.x + (z.x - a.x) * k;
        let y = a.y + (z.y - a.y) * k;

        // Курсор расталкивает: чем ближе, тем дальше отлетает.
        const px = x - pointer.x;
        const py = y - pointer.y;
        const d = Math.hypot(px, py);
        if (d < RADIUS && d > 0.01) {
          const push = (1 - d / RADIUS) ** 2 * 36;
          b.dx += ((px / d) * push - b.dx) * 0.2;
          b.dy += ((py / d) * push - b.dy) * 0.2;
        } else {
          b.dx *= 0.9;
          b.dy *= 0.9;
        }
        x += b.dx;
        y += b.dy;

        const moving = k < 1;
        ctx.globalAlpha = Math.min(1, (moving ? b.alpha + 0.3 : b.alpha) * mask(x));
        const s = b.size;
        ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now >= nextMove) {
        relocate(now);
        nextMove = now + (mode === "field" ? 90 : 160);
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && !still) raf = requestAnimationFrame(tick);
    };

    build();
    draw(performance.now());
    if (still) return;

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onLeave = () => {
      pointer.x = -1e4;
      pointer.y = -1e4;
    };
    const onResize = () => {
      build();
      draw(performance.now());
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    const onVisibility = () => !document.hidden && start();

    io.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [mode]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
