/*
 * Расчёт и отрисовка ASCII-поля без DOM: работает и в воркере на
 * OffscreenCanvas, и в основном потоке, если воркер недоступен. Описание
 * поля — в AsciiField.tsx. Всё, что зависит от страницы (размер, блоки текста,
 * курсор), сюда приходит готовыми числами.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = { width: number; height: number };

/** Прямоугольник тихой зоны в координатах поля, px. */
export type QuietRect = { l: number; r: number; t: number; b: number };

export type FieldSize = { w: number; h: number; dpr: number; rects: QuietRect[] };

export type FieldMessage =
  | ({
      type: "init";
      canvas: OffscreenCanvas;
      font: number;
      strength: number;
      still: boolean;
    } & FieldSize)
  | ({ type: "resize" } & FieldSize)
  | { type: "ptr"; x: number; y: number; on: boolean }
  | { type: "vis"; on: boolean };

export const FPS = 24;
const LINE = 1.2;

const RAMP = "  .·:-=+*#%";
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

export function createAsciiField(ctx: Ctx2D, canvas: Surface, font: number, strength: number) {
  const ch = font * LINE;
  let w = 0;
  let h = 0;
  let cw = font * 0.6;
  let cols = 0;
  let rows = 0;
  /** Прозрачность клетки: 1 — открытое поле, меньше — под текстом. */
  let mask = new Float32Array(0);
  // Курсор в координатах поля; `force` плавно растёт, пока курсор над
  // полем, и гаснет, когда он ушёл, — знаки возвращаются на место без рывка.
  const ptr = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, on: false, force: 0 };

  /*
   * Всё, что не зависит от времени, считается один раз при смене размера:
   * шум клетки, расстояние до центра «волны» и синусы/косинусы базовых
   * фаз. Кадр складывает их по формуле суммы углов — без тригонометрии на
   * каждую из ~8 тысяч клеток.
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

  const resize = (size: FieldSize) => {
    w = size.w;
    h = size.h;
    canvas.width = Math.round(w * size.dpr);
    canvas.height = Math.round(h * size.dpr);
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
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
    if (size.rects.length) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cx = x * cw + cw / 2;
          const cy = y * ch + ch / 2;
          let k = 0;
          for (const q of size.rects) {
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

  const pointer = (x: number, y: number, on: boolean) => {
    ptr.on = on;
    if (!on) return;
    if (ptr.x < -1e3) {
      ptr.x = x;
      ptr.y = y;
    }
    ptr.tx = x;
    ptr.ty = y;
  };

  return { resize, draw, pointer };
}
