/**
 * ASCII-аватарка для человека без фото — генератор Кирилла («Генератор
 * аватарок», asciiGenerator.js), перенесённый в браузер. Там сервер отдавал
 * случайную картинку; здесь та же картинка выводится из `seed` (id
 * сотрудника): у человека она одна на всех экранах и не меняется после
 * перезагрузки, а сервер не нужен.
 *
 * Симметричный узор из «сгустков» и кольца, символы по яркости от пробела до
 * `@`, многоцветная палитра на чёрном фоне. Готовый SVG — data-URI для `<img>`.
 */

const RAMP = " .:-=+*#%@";
/** Сетка: полная — как у Кирилла, мелкая — для аватарки в строке (36 px). */
const GRIDS = { full: [44, 26], small: [14, 9] } as const;
type Grid = keyof typeof GRIDS;
const PALETTE_STEPS = 6;

/** Предсказуемый генератор от строки: одинаковый seed — одинаковая картинка. */
function rng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslHex(h: number, s: number, l: number): string {
  const hh = h / 360;
  const hue2rgb = (p: number, q: number, t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(hue2rgb(p, q, hh + 1 / 3))}${to(hue2rgb(p, q, hh))}${to(hue2rgb(p, q, hh - 1 / 3))}`;
}

function palette(rand: () => number): string[] {
  const h0 = rand() * 360;
  const spreads = [-200, -160, -120, 120, 160, 200];
  const spread = spreads[Math.floor(rand() * spreads.length)];
  return Array.from({ length: PALETTE_STEPS }, (_, i) => {
    const t = i / (PALETTE_STEPS - 1);
    return hslHex((h0 + spread * t + 360) % 360, 0.62 + 0.2 * t, 0.72 - 0.38 * t);
  });
}

function asciiRows(rand: () => number, W: number, H: number): string[] {
  const range = (a: number, b: number) => a + rand() * (b - a);
  const blobs = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({
    bx: range(0, 0.7),
    by: range(-0.7, 0.7),
    br: range(0.18, 0.42),
    sign: rand() < 0.75 ? 1 : -1,
  }));
  const ringK = range(3, 7);
  const ringAmp = range(0, 0.35);
  const raw = new Float64Array(W * H);
  let mn = Infinity;
  let mx = -Infinity;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ax = Math.abs((c / (W - 1)) * 2 - 1); // симметрия по вертикали
      const ny = (r / (H - 1)) * 2 - 1;
      let v = 0;
      for (const b of blobs) {
        const dx = ax - b.bx;
        const dy = ny - b.by;
        v += (b.sign * b.br * b.br) / (dx * dx + dy * dy + b.br * b.br);
      }
      v += ringAmp * Math.cos(Math.sqrt(ax * ax + ny * ny) * ringK);
      raw[r * W + c] = v;
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
  }
  const span = mx - mn || 1;
  return Array.from({ length: H }, (_, r) => {
    let line = "";
    for (let c = 0; c < W; c++) {
      const v = Math.max(0, Math.min(1, (raw[r * W + c] - mn) / span + (rand() - 0.5) * 0.18));
      line += RAMP[Math.round(v * (RAMP.length - 1))];
    }
    return line;
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svg(rows: string[], colors: string[], small: boolean): string {
  const side = 528;
  const cellH = side / rows.length;
  const font = small
    ? `font-size="${Math.round(cellH * 0.95)}" font-weight="700"`
    : `font-size="16"`;
  const colorOf = (ch: string) => {
    const i = RAMP.indexOf(ch);
    return i <= 0 ? null : colors[Math.round((i / (RAMP.length - 1)) * (colors.length - 1))];
  };
  const body = rows
    .map((row, r) => {
      let spans = "";
      for (let i = 0; i < row.length;) {
        const col = colorOf(row[i]);
        let j = i + 1;
        while (j < row.length && colorOf(row[j]) === col) j++;
        const seg = esc(row.slice(i, j));
        spans += col === null ? seg : `<tspan fill="${col}">${seg}</tspan>`;
        i = j;
      }
      const y = (r * cellH + cellH * 0.78).toFixed(2);
      return `<text x="0" y="${y}" textLength="${side}" lengthAdjust="spacingAndGlyphs" xml:space="preserve">${spans}</text>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}"><rect width="${side}" height="${side}" fill="#000"/><g font-family="ui-monospace,Menlo,Consolas,monospace" ${font}>${body}</g></svg>`;
}

const cache = new Map<string, string>();

/**
 * Аватарка по seed — data-URI SVG для `<img src>`. Считается один раз на пару
 * seed + сетка. Мелкая сетка крупнее и жирнее: в 36 px полная сливается в
 * тёмное пятно, а цвета и узор из того же seed остаются узнаваемыми.
 */
export function asciiAvatar(seed: string, grid: Grid = "full"): string {
  const key = `${grid}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rand = rng(seed);
  const colors = palette(rand);
  const [w, h] = GRIDS[grid];
  const rows = asciiRows(rand, w, h);
  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg(rows, colors, grid === "small"))}`;
  cache.set(key, uri);
  return uri;
}
