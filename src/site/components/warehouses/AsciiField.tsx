import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Живое ASCII-поле: склад, нарисованный знаками.
 *
 * По полю медленно идут волны рассыпанных символов ` .·:-=+*#%`, а из них
 * время от времени складываются квадраты — ячейки-коробки, плотно набранные
 * знаками. Квадрат собирается из россыпи, держится и снова рассыпается.
 * Курсор (или палец) разбивает знаки под собой обратно в россыпь. Попросил
 * Кирилл 19 окт: анимация остаётся символьной, а квадраты — рисунок из
 * символов, никаких заливок.
 *
 * Три режима:
 * - `field` — фон первого экрана. Над текстом, переданным в `quiet`, поле
 *   гаснет, и квадраты там не появляются;
 * - `frame` — подсветка окна кабинета: знаки по полосе вокруг окна
 *   складываются в рамку. Середину закрывает само окно;
 * - `card` — тонкий фон карточки тарифа, чтобы цены читались.
 *
 * Canvas, а не DOM: тысячи знаков 20 раз в секунду DOM не потянет. Кадры не
 * рисуются, пока поле вне экрана или вкладка скрыта; при
 * `prefers-reduced-motion` остаётся один неподвижный кадр без реакции на
 * курсор. Цвет берётся из CSS `color` холста.
 */

type Mode = "field" | "frame" | "card";

const RAMP = "  .·:-=+*#%";
const LOOSE = ".·:-=+";
const FPS = 20;
const RADIUS = 90;
/** Сборка, удержание и распад квадрата, мс. */
const BUILD = 1800;
const HOLD = 3200;
const FALL = 1400;
const LIFE = BUILD + HOLD + FALL;

const SETUP: Record<Mode, { font: number; noise: number; ink: number; boxes: number }> = {
  field: { font: 14, noise: 0.5, ink: 0.95, boxes: 1 / 220 },
  frame: { font: 12, noise: 0.45, ink: 0.9, boxes: 0 },
  card: { font: 12, noise: 0.22, ink: 0.32, boxes: 1 / 150 },
};

/** Постоянный «шум» клетки: ломает ровные строки одинаковых знаков. */
const grain = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Box {
  c: number;
  r: number;
  w: number;
  h: number;
  born: number;
}

export function AsciiField({
  mode = "field",
  quiet,
  over,
  overColor = "#ffffff",
  className,
}: {
  mode?: Mode;
  /** Блоки текста, под которыми поле гаснет (только `field`). */
  quiet?: RefObject<HTMLElement | null>[];
  /**
   * Блок, на который холст заходит сверху (синий первый экран под рамкой
   * окна): строки над его нижним краем рисуются цветом `overColor`, иначе
   * синие знаки пропали бы на синем.
   */
  over?: RefObject<HTMLElement | null>;
  overColor?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const set = SETUP[mode];
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ch = set.font * 1.2;
    let cw = set.font * 0.6;
    let cols = 0;
    let rows = 0;
    let w = 0;
    let h = 0;
    let color = "#ffffff";
    /** Яркость клетки: 1 — поле видно, меньше — под текстом тише. */
    let mask = new Float32Array(0);
    /** До какого момента клетка разбита курсором. */
    let hit = new Float64Array(0);
    let boxes: Box[] = [];
    /** Кольцо рамки (режим `frame`): отступ в клетках от края холста. */
    let ring = { c: 0, r: 0 };
    /** Строки выше этой рисуются цветом `overColor`. */
    let overRows = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    const pointer = { x: -1e4, y: -1e4 };

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${set.font}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textBaseline = "top";
      cw = ctx.measureText("M").width || cw;
      color = getComputedStyle(canvas).color || color;
      cols = Math.ceil(w / cw);
      rows = Math.ceil(h / ch);

      mask = new Float32Array(cols * rows).fill(1);
      hit = new Float64Array(cols * rows);
      const box = canvas.getBoundingClientRect();
      for (const q of quiet ?? []) {
        const el = q.current;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const pad = 28;
        const c0 = Math.max(0, Math.floor((r.left - box.left - pad) / cw));
        const c1 = Math.min(cols, Math.ceil((r.right - box.left + pad) / cw));
        const r0 = Math.max(0, Math.floor((r.top - box.top - pad) / ch));
        const r1 = Math.min(rows, Math.ceil((r.bottom - box.top + pad) / ch));
        for (let y = r0; y < r1; y++) for (let x = c0; x < c1; x++) mask[y * cols + x] = 0.14;
      }

      if (mode === "frame") {
        // Холст выступает за окно одинаково со всех сторон: рамка идёт по
        // середине этой полосы.
        const parent = canvas.parentElement?.getBoundingClientRect();
        const band = parent ? Math.max(0, (box.width - parent.width) / 2) : 16;
        ring = {
          c: Math.max(0, Math.round(band / 2 / cw - 0.5)),
          r: Math.max(0, Math.round(band / 2 / ch - 0.5)),
        };
      }
      const ov = over?.current?.getBoundingClientRect();
      overRows = ov ? Math.max(0, Math.round((ov.bottom - box.top) / ch)) : 0;

      // Сразу заполняем поле квадратами в разных фазах: иначе первые секунды
      // оно пустое, а циклы потом идут в ногу.
      boxes = [];
      const now = performance.now();
      const want = Math.round(cols * rows * set.boxes);
      for (let i = 0; i < want * 4 && boxes.length < want; i++)
        spawn(still ? now - BUILD : now - Math.random() * LIFE);
    };

    /** Свободное место под новый квадрат: не под текстом и не на соседе. */
    const spawn = (now: number) => {
      for (let tries = 0; tries < 20; tries++) {
        const hr = 2 + Math.floor(Math.random() * (mode === "card" ? 2 : 3));
        // Знак вдвое выше своей ширины: квадрат на глаз — вдвое больше колонок.
        const wc = Math.round((hr * ch) / cw);
        const c = Math.floor(Math.random() * Math.max(1, cols - wc));
        const r = Math.floor(Math.random() * Math.max(1, rows - hr));
        let ok = true;
        for (let y = r - 1; ok && y <= r + hr; y++)
          for (let x = c - 2; ok && x <= c + wc + 1; x++) {
            if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
            if (mask[y * cols + x] < 1) ok = false;
          }
        for (const b of boxes)
          if (c < b.c + b.w + 3 && b.c < c + wc + 3 && r < b.r + b.h + 1 && b.r < r + hr + 1)
            ok = false;
        if (ok) return void boxes.push({ c, r, w: wc, h: hr, born: now });
      }
    };

    /** Сколько знаков квадрата уже собрано: 0 — россыпь, 1 — целиком. */
    const formed = (age: number) => {
      if (age < BUILD) return age / BUILD;
      if (age < BUILD + HOLD) return 1;
      return Math.max(0, 1 - (age - BUILD - HOLD) / FALL);
    };

    /** Знак собранной фигуры: край плотный, середина легче — коробка. */
    const solid = (edge: boolean) => (edge ? "#" : "=");

    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;
      const t = now;
      const flicker = Math.floor(t / 120);

      // Фигуры поверх россыпи: какой знак стоит в клетке.
      const shape = new Map<number, string>();
      const put = (x: number, y: number, k: number, edge: boolean) => {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        const i = y * cols + x;
        if (hit[i] > t) return;
        shape.set(i, grain(x, y) < k ? solid(edge) : LOOSE[Math.floor(grain(x + flicker, y) * 6)]);
      };

      for (const b of boxes) {
        const k = formed(t - b.born);
        for (let y = 0; y < b.h; y++)
          for (let x = 0; x < b.w; x++)
            put(b.c + x, b.r + y, k, y === 0 || x === 0 || y === b.h - 1 || x === b.w - 1);
      }
      if (mode === "frame") {
        const cycle = LIFE + 1200;
        const k = still ? 1 : formed((t % cycle) * (LIFE / cycle));
        const { c, r } = ring;
        for (let x = c; x < cols - c; x++) {
          put(x, r, k, true);
          put(x, rows - 1 - r, k, true);
        }
        for (let y = r; y < rows - r; y++) {
          put(c, y, k, true);
          put(cols - 1 - c, y, k, true);
        }
      }

      for (let y = 0; y < rows; y++) {
        ctx.fillStyle = y < overRows ? overColor : color;
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const m = mask[i];
          const s = shape.get(i);
          if (s && s !== " ") {
            const dense = s === "#" || s === "=";
            ctx.globalAlpha = (dense ? set.ink : set.ink * 0.45) * m;
            ctx.fillText(s, x * cw, y * ch);
            continue;
          }
          const v =
            Math.sin(x * 0.21 + t * 0.0007) +
            Math.sin(y * 0.29 - t * 0.0005) +
            Math.sin((x - y) * 0.13 + t * 0.0004);
          const n = (v + 3) / 6 + (grain(x, y) - 0.5) * 0.3;
          const level = Math.min(1, Math.max(0, n * n * 1.5 - 0.1 + (hit[i] > t ? 0.3 : 0)));
          const idx = Math.floor(level * (RAMP.length - 1));
          if (idx < 2) continue;
          ctx.globalAlpha = set.noise * (0.2 + level * 0.8) * m;
          ctx.fillText(RAMP[idx], x * cw, y * ch);
        }
      }
      ctx.globalAlpha = 1;
    };

    const step = (now: number) => {
      boxes = boxes.filter((b) => now - b.born < LIFE);
      const want = Math.round(cols * rows * set.boxes);
      // Новые квадраты рождаются по одному, чтобы циклы не совпадали.
      if (boxes.length < want && Math.random() < 0.3) spawn(now);
      if (pointer.x > -1e3) {
        const pc = pointer.x / cw;
        const pr = pointer.y / ch;
        const rc = RADIUS / cw;
        const rr = RADIUS / ch;
        for (let y = Math.max(0, Math.floor(pr - rr)); y < Math.min(rows, pr + rr); y++)
          for (let x = Math.max(0, Math.floor(pc - rc)); x < Math.min(cols, pc + rc); x++)
            if (((x - pc) / rc) ** 2 + ((y - pr) / rr) ** 2 < 1)
              hit[y * cols + x] = now + 900 + grain(x, y) * 900;
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 1000 / FPS) return;
      last = now;
      step(now);
      draw(now);
    };

    build();
    if (still) {
      // Один кадр: квадраты уже собраны и стоят, рамка целиком.
      draw(performance.now());
      return;
    }

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onLeave = () => {
      pointer.x = -1e4;
      pointer.y = -1e4;
    };
    const ro = new ResizeObserver(() => {
      build();
      draw(last);
    });
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });

    ro.observe(canvas);
    io.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [mode, quiet, over, overColor]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
