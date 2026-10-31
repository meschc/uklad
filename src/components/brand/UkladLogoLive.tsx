import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { LOGO_BLUE } from "./UkladLogo";

/*
 * Живой логотип: пять залитых клеток «У К Л А Д», которые перестраиваются
 * из одной раскладки в другую (Кирилл 31 окт, генератор из треда логотипа).
 *
 * Правила раскладок — из бренда: читается слева направо, буква никогда не
 * уходит левее предыдущей, под предыдущей встаёт только строго снизу. Режимы
 * «Вниз», «Вверх», «Волна». Раскладки отобраны руками, а не случайные: из
 * случайных половина читается «ДУЛАК».
 *
 * Движение — жёсткое: все буквы шагают одновременно, на одну клетку за такт,
 * без сглаживания. Под курсором логотип сразу перестраивается и дальше
 * меняется чаще, а клетка под указателем выворачивается в обратный цвет.
 * Вне экрана и в скрытой вкладке не тикает; при `prefers-reduced-motion`
 * раскладка меняется только по наведению и без шагов.
 */

const LETTERS = ["У", "К", "Л", "А", "Д"] as const;
type Cell = readonly [col: number, row: number];

/** Сетка 5×2: в шапке выше двух клеток не помещается. Первая — эталон. */
const LOGO_LAYOUTS: readonly (readonly Cell[])[] = [
  // Вниз: «У К», под «К» — «Л А Д» (эталон шапки).
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  // Волна.
  [
    [0, 0],
    [1, 1],
    [2, 0],
    [3, 1],
    [4, 0],
  ],
  // «К» под «У», дальше строкой.
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  // Вверх: «У» самая нижняя.
  [
    [0, 1],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  // «У К Л», под «Л» — «А Д».
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [3, 1],
  ],
  // Вниз через одну.
  [
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
    [4, 1],
  ],
];
const COLS = 5;
const ROWS = 2;
/** Такт шага, мс: одна клетка за такт. */
const STEP_MS = 110;
const IDLE_MS = 3600;
const HOVER_MS = 1100;

export function UkladLogoLive({
  cell = 20,
  tone = "blue",
  label = "Уклад",
  className,
}: {
  /** Сторона клетки, px. */
  cell?: number;
  /** blue — синие клетки и белые буквы; white — наоборот, для синего фона. */
  tone?: "blue" | "white";
  label?: string;
  className?: string;
}) {
  const [pos, setPos] = useState<Cell[]>(() => LOGO_LAYOUTS[0].map((c) => c));
  const [target, setTarget] = useState(0);
  const box = useRef<HTMLSpanElement>(null);
  const hover = useRef(false);
  const visible = useRef(true);
  const still = useRef(false);

  const next = () => setTarget((i) => (i + 1) % LOGO_LAYOUTS.length);

  // Смена раскладки: сама раз в IDLE_MS, под курсором чаще.
  useEffect(() => {
    still.current = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = box.current;
    const io =
      el && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([e]) => {
            visible.current = e.isIntersecting;
          })
        : null;
    if (el && io) io.observe(el);
    let last = performance.now();
    const id = window.setInterval(() => {
      if (still.current || !visible.current || document.hidden) return;
      const now = performance.now();
      if (now - last >= (hover.current ? HOVER_MS : IDLE_MS)) {
        last = now;
        next();
      }
    }, 250);
    return () => {
      window.clearInterval(id);
      io?.disconnect();
    };
  }, []);

  // Шаги к целевой раскладке: каждая буква — на клетку за такт, все сразу.
  useEffect(() => {
    const goal = LOGO_LAYOUTS[target];
    if (still.current) {
      setPos(goal.map((c) => c));
      return;
    }
    const id = window.setInterval(() => {
      setPos((cur) => {
        let moved = false;
        const out = cur.map(([c, r], i) => {
          const [gc, gr] = goal[i];
          if (c !== gc) {
            moved = true;
            return [c + Math.sign(gc - c), r] as Cell;
          }
          if (r !== gr) {
            moved = true;
            return [c, r + Math.sign(gr - r)] as Cell;
          }
          return [c, r] as Cell;
        });
        if (!moved) window.clearInterval(id);
        return moved ? out : cur;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [target]);

  const fill = tone === "blue" ? LOGO_BLUE : "#FFFFFF";
  const ink = tone === "blue" ? "#FFFFFF" : LOGO_BLUE;

  return (
    <span
      ref={box}
      role="img"
      aria-label={label}
      onPointerEnter={() => {
        hover.current = true;
        next();
      }}
      onPointerLeave={() => {
        hover.current = false;
      }}
      className={cn("relative block shrink-0 select-none", className)}
      style={{ width: COLS * cell, height: ROWS * cell }}
    >
      {LETTERS.map((ch, i) => (
        <span
          key={ch}
          aria-hidden
          className="uk-live-cell absolute grid place-items-center font-semibold leading-none"
          style={
            {
              left: pos[i][0] * cell,
              top: pos[i][1] * cell,
              width: cell,
              height: cell,
              fontSize: Math.round(cell * 0.58),
              "--fill": fill,
              "--ink": ink,
            } as CSSProperties
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
