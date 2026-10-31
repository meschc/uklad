import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Поле ASCII-знаков на синем: по нему медленно идут волны, сверху вниз
 * проходит полоса «сканера», а курсор расталкивает знаки вокруг себя и
 * подсвечивает их. Только на синих фонах — первый экран и карточка тарифа
 * «Склад» (Кирилл 19 окт: без фигур из знаков, поле на весь фон и живое).
 *
 * Canvas, а не DOM: несколько тысяч знаков 24 раза в секунду DOM не потянет.
 * Поле лежит под всем блоком целиком; под текстом из `quiet` знаки те же, но
 * прозрачнее — текст читается, а поле не обрывается дырой. Кадры не рисуются,
 * пока поле вне экрана или вкладка скрыта; при `prefers-reduced-motion`
 * рисуется один неподвижный кадр и курсор на поле не влияет.
 */

const RAMP = "  .·:-=+*#%";
const LINE = 1.2;
const FPS = 24;
/** Строка перерисовывается раз в столько кадров (кроме места под курсором). */
const INTERLACE = 3;
/** Радиус влияния курсора, px. */
const REACH = 140;
/** Насколько далеко курсор отталкивает знак у самого центра, px. */
const PUSH = 18;
/** Ширина плавного перехода тихой зоны под текстом, px. */
const FEATHER = 90;

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

    /*
     * Всё, что не зависит от времени, считается один раз при смене размера:
     * шум клетки, расстояние до центра «волны» и синусы/косинусы базовых
     * фаз. Кадр складывает их по формуле суммы углов — без тригонометрии на
     * каждую из ~8 тысяч клеток (31 окт: поле тормозило слабые машины).
     */
    let g1 = new Float32Array(0);
    let g2 = new Float32Array(0);
    let rs = new Float32Array(0);
    let rc = new Float32Array(0);
    let xs = new Float32Array(0);
    let xc = new Float32Array(0);
    let ys = new Float32Array(0);
    let yc = new Float32Array(0);
    let ds = new Float32Array(0);
    let dc = new Float32Array(0);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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

      const n = cols * rows;
      g1 = new Float32Array(n);
      g2 = new Float32Array(n);
      ds = new Float32Array(n);
      dc = new Float32Array(n);
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          g1[i] = (grain(x, y) - 0.5) * 0.22;
          g2[i] = grain(y, x);
          const d = Math.hypot(x - cols * 0.72, (y - rows * 0.45) * 1.6) * 0.22;
          ds[i] = Math.sin(d);
          dc[i] = Math.cos(d);
        }
      xs = Float32Array.from({ length: cols }, (_, x) => Math.sin(x * 0.21));
      xc = Float32Array.from({ length: cols }, (_, x) => Math.cos(x * 0.21));
      ys = Float32Array.from({ length: rows }, (_, y) => Math.sin(y * 0.29));
      yc = Float32Array.from({ length: rows }, (_, y) => Math.cos(y * 0.29));
      // Диагональ (x − y) сдвинута на rows, чтобы индекс был неотрицательным.
      rs = Float32Array.from({ length: cols + rows }, (_, k) => Math.sin((k - rows) * 0.13));
      rc = Float32Array.from({ length: cols + rows }, (_, k) => Math.cos((k - rows) * 0.13));

      // Под текстом поле тише, но без резкой границы: прозрачность плавно
      // спадает на FEATHER px от края блока, иначе зона читается прямоугольником.
      mask = new Float32Array(n).fill(1);
      const box = canvas.getBoundingClientRect();
      const rects = (quiet ?? [])
        .map((q) => q.current?.getBoundingClientRect())
        .filter((r): r is DOMRect => !!r)
        .map((r) => ({
          l: r.left - box.left,
          r: r.right - box.left,
          t: r.top - box.top,
          b: r.bottom - box.top,
        }));
      if (rects.length) {
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const cx = x * cw + cw / 2;
            const cy = y * ch + ch / 2;
            let k = 0;
            for (const q of rects) {
              const dx = Math.max(q.l - cx, 0, cx - q.r);
              const dy = Math.max(q.t - cy, 0, cy - q.b);
              const f = Math.max(0, 1 - Math.hypot(dx, dy) / FEATHER);
              k = Math.max(k, f * f * (3 - 2 * f));
            }
            mask[y * cols + x] = 1 - k * 0.65;
          }
        }
      }
    };

    /** Прозрачность квантуется: знаки одной ступени рисуются одним проходом. */
    const STEPS = 12;
    const bins: number[][] = Array.from({ length: RAMP.length * STEPS }, () => []);

    /*
     * Перерисовывается не всё поле: за кадр — каждая INTERLACE-я строка,
     * полоса сканера и прямоугольник под курсором (прежний и новый).
     * Волна медленная, и строка, обновлённая раз в три кадра, на глаз не
     * отстаёт, а знаков за кадр втрое меньше — они и были главным расходом.
     */
    let phase = 0;
    let prevScan = -10;
    /** Прямоугольник под курсором прошлого кадра, в клетках: x0, y0, x1, y1. */
    let prevBox: number[] | null = null;

    const draw = (t: number, full = false) => {
      // Полоса сканера: проходит поле за ~7 с и уходит за край перед повтором.
      const scan = ((t / 7000) % 1.3) * rows;
      ptr.x += (ptr.tx - ptr.x) * 0.25;
      ptr.y += (ptr.ty - ptr.y) * 0.25;
      ptr.force += ((ptr.on ? 1 : 0) - ptr.force) * 0.12;
      const touch = ptr.force > 0.01;

      // Фазы кадра: sin(a + b) = sin a·cos b + cos a·sin b.
      const ax = t * 0.0007;
      const sax = Math.sin(ax);
      const cax = Math.cos(ax);
      const ay = -t * 0.0005;
      const say = Math.sin(ay);
      const cay = Math.cos(ay);
      const ar = t * 0.0004;
      const sar = Math.sin(ar);
      const car = Math.cos(ar);
      const ad = -t * 0.0015;
      const sad = Math.sin(ad);
      const cad = Math.cos(ad);

      for (const b of bins) b.length = 0;

      const cell = (x: number, y: number, near: number, wy: number) => {
        const i = y * cols + x;
        const k = x - y + rows;
        const v =
          xs[x] * cax + xc[x] * sax + wy + rs[k] * car + rc[k] * sar + ds[i] * cad + dc[i] * sad;
        let n = (v + 4) / 8 + g1[i];
        let px = x * cw;
        let py = y * ch;

        if (touch) {
          const dx = px + cw / 2 - ptr.x;
          const dy = py + ch / 2 - ptr.y;
          if (dx * dx + dy * dy < REACH * REACH) {
            const d = Math.sqrt(dx * dx + dy * dy);
            const f = (1 - d / REACH) ** 2 * ptr.force;
            const len = d || 1;
            px += (dx / len) * PUSH * f;
            py += (dy / len) * PUSH * f;
            n += f * 0.6;
          }
        }

        const lit = near > 0 && g2[i] < near * 0.7;
        const level = Math.min(1, Math.max(0, n * n * 1.5 + (lit ? 0.45 : 0)));
        const gi = Math.floor(level * (RAMP.length - 1));
        if (gi < 2) return;
        const alpha = (0.08 + level * 0.4) * strength * mask[i];
        const step = Math.min(STEPS - 1, Math.round(alpha * 2 * (STEPS - 1)));
        if (step <= 0) return;
        bins[gi * STEPS + step].push(px, py);
      };

      // Какие строки целиком: своя очередь и полоса сканера (прежняя и новая).
      phase = (phase + 1) % INTERLACE;
      const whole = new Uint8Array(rows);
      for (let y = 0; y < rows; y++) {
        if (full || y % INTERLACE === phase) whole[y] = 1;
        if (Math.abs(y - scan) < 2 || Math.abs(y - prevScan) < 2) whole[y] = 1;
      }
      prevScan = scan;

      // Прямоугольник под курсором: всё, куда курсор мог сдвинуть знак.
      const r = REACH + PUSH;
      const box = touch
        ? [
            Math.max(0, Math.floor((ptr.x - r) / cw) - 1),
            Math.max(0, Math.floor((ptr.y - r) / ch) - 1),
            Math.min(cols - 1, Math.ceil((ptr.x + r) / cw) + 1),
            Math.min(rows - 1, Math.ceil((ptr.y + r) / ch) + 1),
          ]
        : null;
      const boxes = full ? [] : [box, prevBox].filter((b): b is number[] => !!b);
      prevBox = box;

      if (full) ctx.clearRect(0, 0, w, h);
      else {
        for (let y = 0; y < rows; y++) if (whole[y]) ctx.clearRect(0, y * ch, w, ch);
        for (const [x0, y0, x1, y1] of boxes)
          ctx.clearRect(x0 * cw, y0 * ch, (x1 - x0 + 1) * cw, (y1 - y0 + 1) * ch);
      }

      for (let y = 0; y < rows; y++) {
        const near = Math.max(0, 1 - Math.abs(y - scan) / 1.5);
        const wy = ys[y] * cay + yc[y] * say;
        if (whole[y]) {
          for (let x = 0; x < cols; x++) cell(x, y, near, wy);
          continue;
        }
        for (let x = 0; x < cols; x++) {
          let inBox = false;
          for (const [x0, y0, x1, y1] of boxes)
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inBox = true;
          if (inBox) cell(x, y, near, wy);
        }
      }

      for (let gi = 2; gi < RAMP.length; gi++) {
        const sym = RAMP[gi];
        for (let st = 1; st < STEPS; st++) {
          const list = bins[gi * STEPS + st];
          if (!list.length) continue;
          ctx.globalAlpha = st / (2 * (STEPS - 1));
          for (let j = 0; j < list.length; j += 2) ctx.fillText(sym, list[j], list[j + 1]);
        }
      }
      ctx.globalAlpha = 1;
    };

    // На время прокрутки поле замирает: кадр отдаём прокрутке, а не знакам
    // (Кирилл 31 окт: «когда начинаю скроллить, пролаг»). Догоняет через
    // 200 мс после остановки — на глаз это продолжение того же движения.
    let scrolledAt = -1e9;
    const onScroll = () => {
      scrolledAt = performance.now();
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden || now - last < 1000 / FPS) return;
      if (now - scrolledAt < 200) return;
      last = now;
      draw(now);
    };

    resize();
    draw(2400, true);

    const ro = new ResizeObserver(() => {
      resize();
      draw(last || 2400, true);
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
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("pointermove", move, { passive: true });
      document.documentElement.addEventListener("pointerleave", leave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
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
