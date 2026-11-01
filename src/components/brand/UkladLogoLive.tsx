import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { LOGO_BLUE } from "./UkladLogo";

/*
 * Живой логотип «У К Л А Д» — перенос сцены знака из прототипа треда
 * логотипа (артефакт «Буквы УКЛАД», Кирилл 31 окт: «вот такой анимации жду»).
 *
 * Буква сидит в своей клетке, а её квадрат может быть шире или выше клетки
 * (плитка 2×1, 1×3…). Раскладки отобраны руками по правилам бренда: слово
 * читается слева направо, буква не уходит левее предыдущей, под предыдущей
 * встаёт только строго снизу. Режимы «Вниз», «Вверх», «Волна».
 *
 * Перестройка резкая и синхронная, как в прототипе: все буквы сразу, шаг на
 * клетку за такт, без сглаживания. Такты: плитка схлопывается к клетке своей
 * буквы → буква едет по горизонтали → по вертикали → плитка раскрывается.
 *
 * Наведение: логотип сразу берёт следующую раскладку, а плитка под
 * указателем выворачивается (залитая — в контур, контурная — в заливку).
 * Вне экрана и в скрытой вкладке не тикает; при `prefers-reduced-motion`
 * раскладка меняется только по наведению, без тактов.
 */

/** Глифы Medeo в клетке 60×60, как в знаке; `ox/oy` — сдвиг пути к своей клетке. */
const GLYPHS = [
  {
    ox: 6,
    oy: 66,
    d: "M27.08 108.968H30.968C31.576 108.968 32.072 108.824 32.456 108.536C32.872 108.248 33.192 107.8 33.416 107.192L34.712 103.88H33.32L24.008 78.92H28.472L36.104 100.04L43.544 78.92H48.008L37.16 109.016C36.68 110.392 35.976 111.4 35.048 112.04C34.12 112.68 32.936 113 31.496 113H27.08V108.968Z",
  },
  {
    ox: 66,
    oy: 66,
    d: "M88.208 95.96H93.824L109.904 113H104.288L88.208 95.96ZM84.416 78.92H88.544V113H84.416V78.92ZM103.808 78.92H109.424L93.824 95.96H88.208L103.808 78.92Z",
  },
  {
    ox: 126,
    oy: 66,
    d: "M141.216 108.968H144C144.832 108.968 145.488 108.664 145.968 108.056C146.448 107.416 146.736 106.552 146.832 105.464L149.04 78.92H170.304V113H166.176V82.952H152.928L151.008 105.944C150.816 108.184 150.208 109.928 149.184 111.176C148.16 112.392 146.64 113 144.624 113H141.216V108.968Z",
  },
  {
    ox: 126,
    oy: 126,
    d: "M153.296 138.92H158.864L171.152 173H166.64L163.232 163.304H148.928L145.52 173H141.008L153.296 138.92ZM161.84 159.272L156.08 142.52L150.32 159.272H161.84Z",
  },
  {
    ox: 187,
    oy: 126,
    d: "M199.4 167.968H201.368C202.552 167.968 203.464 167.472 204.104 166.48C204.744 165.456 205.192 163.84 205.448 161.632L207.944 137.92H228.968V167.968H233.192V179.2H229.064V172H203.528V179.2H199.4V167.968ZM224.84 167.968V141.952H211.736L209.576 162.112C209.416 163.392 209.176 164.512 208.856 165.472C208.568 166.432 208.168 167.264 207.656 167.968H224.84Z",
  },
] as const;

/** Клетка знака в единицах пути и толщина обводки = штрих буквы. */
const U = 60;
const SW = 4.128;

/** Плитка: колонка, строка, ширина, высота в клетках и клетка самой буквы. */
type Tile = readonly [c: number, r: number, w: number, h: number, lc: number, lr: number];
type Layout = readonly Tile[];

/**
 * Шапка: высота строго две клетки, ширина до пяти — иначе логотип то растёт,
 * то сжимается и толкает меню. Первая раскладка — эталон (Frame 27).
 */
const HEADER: readonly Layout[] = [
  // Вниз: У, широкая К, под ней Л А Д (Frame 27).
  [
    [0, 0, 1, 1, 0, 0],
    [1, 0, 2, 1, 1, 0],
    [1, 1, 1, 1, 1, 1],
    [2, 1, 1, 1, 2, 1],
    [3, 1, 1, 1, 3, 1],
  ],
  // Волна: по высоте гуляет на одну клетку.
  [
    [0, 1, 1, 1, 0, 1],
    [1, 0, 1, 2, 1, 0],
    [2, 1, 1, 1, 2, 1],
    [3, 0, 1, 1, 3, 0],
    [4, 0, 1, 2, 4, 1],
  ],
  // Вниз: У К Л строкой, под Л — А Д.
  [
    [0, 0, 1, 1, 0, 0],
    [1, 0, 1, 1, 1, 0],
    [2, 0, 1, 1, 2, 0],
    [2, 1, 1, 1, 2, 1],
    [3, 1, 1, 1, 3, 1],
  ],
  // Вверх: У и К внизу, слово поднимается.
  [
    [0, 1, 1, 1, 0, 1],
    [1, 1, 1, 1, 1, 1],
    [2, 0, 1, 2, 2, 1],
    [3, 0, 1, 1, 3, 0],
    [4, 0, 1, 1, 4, 0],
  ],
  // Вниз: высокая У, широкая Д внизу.
  [
    [0, 0, 1, 2, 0, 0],
    [1, 0, 1, 1, 1, 0],
    [2, 0, 1, 1, 2, 0],
    [3, 0, 1, 1, 3, 0],
    [3, 1, 2, 1, 3, 1],
  ],
];

/**
 * Клетка буквы, где она не совпадает с левым верхним углом плитки
 * (номер варианта → буква → [колонка, строка]).
 */
const STAGE_LETTERS: Record<number, Record<number, [number, number]>> = {
  5: { 2: [2, 1] },
  6: { 3: [1, 2] },
  10: { 2: [2, 2] },
  11: { 2: [2, 2] },
  12: { 2: [2, 4], 4: [4, 2] },
  14: { 3: [3, 2] },
  21: { 1: [1, 2], 3: [3, 1], 4: [4, 2] },
  22: { 2: [2, 0] },
  23: { 3: [3, 2] },
};

function decode(s: string, letters: Record<number, [number, number]> = {}): Layout {
  return s.split(" ").map((t, i) => {
    const [c, r, w, h] = [...t].map(Number);
    const [lc, lr] = letters[i] ?? [c, r];
    return [c, r, w, h, lc, lr] as const;
  });
}

/** Сцена 6×6 — отобранные варианты прототипа: Вниз, Вверх, Волна по восемь. */
const STAGE: readonly Layout[] = (
  [
    // Вниз
    "0011 1011 2011 2111 3111",
    "0012 1111 2111 2211 3212",
    "0011 1011 2011 2111 3113",
    "0031 1112 2111 2211 2321",
    "0021 0111 1111 1211 2211",
    "0011 1011 1121 2221 3311",
    "0011 1011 1111 0221 2211",
    "0012 1011 2021 2113 3211",
    // Вверх
    "0311 1212 2211 3112 4013",
    "0312 1331 2221 3121 4011",
    "0213 1211 2112 3111 4012",
    "0322 1211 2112 3111 4012",
    "0411 1411 2312 3321 4013",
    "0311 1213 2112 3111 4012",
    "0321 1211 2211 3013 4111",
    "0321 1211 2113 3013 4011",
    // Волна
    "0213 1221 2111 3012 4111",
    "0012 1113 2112 3012 4111",
    "0111 1012 2111 3013 4112",
    "0111 1013 2111 3111 4111",
    "0111 1012 2111 3113 4211",
    "0211 1013 2111 3012 3222",
    "0111 1112 1021 3012 4111",
    "0013 1111 2111 3112 4111",
  ] as const
).map((s, k) => decode(s, STAGE_LETTERS[k]));

/** Такт шага и пауза между раскладками, мс — как в прототипе. */
const STEP_MS = 90;
const HOLD = { header: 4200, stage: 2600 } as const;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  lx: number;
  ly: number;
}

/** Раскладка в клетках сетки: шапка прижата к левому верху, сцена по центру 6×6. */
function place(l: Layout, centered: boolean): Box[] {
  const bw = Math.max(...l.map((t) => t[0] + t[2]));
  const bh = Math.max(...l.map((t) => t[1] + t[3]));
  const ox = centered ? (6 - bw) / 2 : 0;
  const oy = centered ? (6 - bh) / 2 : 0;
  return l.map(([c, r, w, h, lc, lr]) => ({
    x: c + ox,
    y: r + oy,
    w,
    h,
    lx: lc + ox,
    ly: lr + oy,
  }));
}

const toward = (a: number, b: number) => (Math.abs(b - a) <= 1 ? b : a + Math.sign(b - a));

/** Один такт перестройки; `false`, если в этой фазе больше никто не двигался. */
function stepPhase(cur: Box[], to: Box[], phase: number): boolean {
  let moved = false;
  cur.forEach((b, i) => {
    const B = to[i];
    if (phase === 0) {
      // Схлопнуть плитку по клетке к букве.
      const nw = Math.max(1, b.w - 1);
      const nh = Math.max(1, b.h - 1);
      if (nw !== b.w || nh !== b.h) {
        moved = true;
        if (b.lx > b.x) b.x += b.w - nw;
        if (b.ly > b.y) b.y += b.h - nh;
        b.w = nw;
        b.h = nh;
      }
      if (b.w === 1 && b.h === 1) {
        b.x = b.lx;
        b.y = b.ly;
      }
    } else if (phase === 1) {
      if (b.lx !== B.lx) {
        moved = true;
        b.lx = toward(b.lx, B.lx);
        b.x = b.lx;
      }
    } else if (phase === 2) {
      if (b.ly !== B.ly) {
        moved = true;
        b.ly = toward(b.ly, B.ly);
        b.y = b.ly;
      }
    } else if (b.w !== B.w || b.h !== B.h) {
      // Раскрыть по клетке.
      moved = true;
      if (b.w < B.w) {
        b.w++;
        if (B.x < b.x) b.x--;
      }
      if (b.h < B.h) {
        b.h++;
        if (B.y < b.y) b.y--;
      }
    } else {
      b.x = B.x;
      b.y = B.y;
    }
  });
  return moved;
}

export function UkladLogoLive({
  cell = 20,
  variant = "header",
  tone = "blue",
  label = "Уклад",
  className,
}: {
  /** Размер клетки, px. */
  cell?: number;
  /** `header` — залитые буквы в полосе 2 клетки; `stage` — контур, сцена 6×6. */
  variant?: "header" | "stage";
  /** `white` — для шапки поверх синего первого экрана. */
  tone?: "blue" | "white";
  label?: string;
  className?: string;
}) {
  const stage = variant === "stage";
  const set = stage ? STAGE : HEADER;
  const [boxes, setBoxes] = useState(() => place(set[0], stage));
  const [hot, setHot] = useState(-1);
  const ref = useRef<SVGSVGElement>(null);
  const run = useRef({ idx: 0, cur: place(set[0], stage), tick: 0 });
  const nextRef = useRef<() => void>(() => {});

  useEffect(() => {
    const r = run.current;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;

    const go = () => {
      r.idx = (r.idx + 1) % set.length;
      const to = place(set[r.idx], stage);
      window.clearInterval(r.tick);
      if (still) {
        r.cur = to;
        setBoxes(to);
        return;
      }
      const cur = r.cur.map((b) => ({ ...b }));
      let phase = 0;
      r.tick = window.setInterval(() => {
        while (phase <= 3 && !stepPhase(cur, to, phase)) phase++;
        r.cur = (phase > 3 ? to : cur).map((b) => ({ ...b }));
        if (phase > 3) window.clearInterval(r.tick);
        setBoxes(r.cur);
      }, STEP_MS);
    };
    nextRef.current = go;

    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (ref.current) io.observe(ref.current);
    const auto = still
      ? 0
      : window.setInterval(() => {
          if (visible && !document.hidden) go();
        }, HOLD[variant]);
    return () => {
      io.disconnect();
      window.clearInterval(auto);
      window.clearInterval(r.tick);
    };
  }, [set, stage, variant]);

  const cols = stage ? 6 : 5;
  const rows = stage ? 6 : 2;
  const ink = tone === "white" ? "#FFFFFF" : LOGO_BLUE;
  const paper = tone === "white" ? LOGO_BLUE : "#FFFFFF";
  // Шапка — залитые плитки, сцена — контур; под указателем наоборот.
  const solid = (i: number) => (i === hot ? stage : !stage);

  return (
    <svg
      ref={ref}
      role="img"
      aria-label={label}
      viewBox={`${-SW / 2} ${-SW / 2} ${cols * U + SW} ${rows * U + SW}`}
      width={cols * cell}
      height={rows * cell}
      className={cn("block shrink-0", className)}
      onPointerEnter={() => nextRef.current()}
      onPointerLeave={() => setHot(-1)}
    >
      {boxes.map((b, i) => {
        const g = GLYPHS[i];
        const fill = solid(i);
        return (
          <g key={i} onPointerEnter={() => setHot(i)}>
            <rect
              x={b.x * U}
              y={b.y * U}
              width={b.w * U}
              height={b.h * U}
              fill={fill ? ink : stage ? "transparent" : paper}
              stroke={ink}
              strokeWidth={SW}
            />
            <path
              fillRule="evenodd"
              fill={fill ? paper : ink}
              transform={`translate(${b.lx * U - g.ox} ${b.ly * U - g.oy})`}
              d={g.d}
            />
          </g>
        );
      })}
    </svg>
  );
}
