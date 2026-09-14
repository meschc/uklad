import type { CSSProperties } from "react";
import type { XY } from "@/lib/types";
import { CELL } from "../constants";

/**
 * Точечный фон холста (п.4a): спокойнее сетки линий, «бумажная» эстетика. Одна
 * точка на клетку — точки служат линейкой для оценки размера на глаз.
 */

/** Мельче этого шага точки сливаются в кашу — тогда их лучше убрать вовсе. */
const MIN_DOT_STEP_PX = 7;

export function dotGridStyle(zoom: number, pan: XY): CSSProperties {
  const step = CELL * zoom;
  return {
    backgroundColor: "hsl(var(--canvas-bg))",
    // Радиус точки фиксированный (не растёт с зумом), меняется только шаг.
    backgroundImage:
      step >= MIN_DOT_STEP_PX
        ? "radial-gradient(circle, hsl(var(--grid-major)) 0.5px, transparent 1px)"
        : "none",
    backgroundSize: `${step}px ${step}px`,
    // −step/2, чтобы точки стояли в узлах сетки (на стыках клеток), а не в
    // центрах — так они совпадают с границами модулей, лежащих по клеткам.
    backgroundPosition: `${pan.x - step / 2}px ${pan.y - step / 2}px`,
  };
}
