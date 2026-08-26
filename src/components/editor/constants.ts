import type { ModuleType } from "@/lib/types";

/**
 * Показывать ли режим 3D. Временно выключен: визуализация ещё дорабатывается,
 * в интерфейсе её не показываем. Вернуть — поставить `true`.
 */
export const SHOW_3D = false;

/** Базовый размер клетки сетки в пикселях при zoom = 1. */
export const CELL = 28;

/**
 * Радиус углов модуля в МИРОВЫХ пикселях (при zoom = 1). Модули лежат внутри
 * scale-слоя, поэтому их углы растут вместе с зумом. Всё, что рисуется поверх
 * плана в экранных координатах (рамка ряда), должно умножать этот радиус на
 * зум — иначе скругления разъезжаются при каждом приближении.
 */
export const MODULE_RADIUS = 4;

/**
 * Зазор между соседними модулями (мировые px на сторону, п.4b). Небольшой
 * промежуток разделяет вплотную стоящие объекты — и именно он позволяет вернуть
 * скругления: стыки они уже не портят. Применяется к заливке модуля и к
 * контурам, которые её отслеживают (выделение, ручки, наложение).
 */
export const MODULE_GAP = 1.5;

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 1.15;

// --- Пороги детализации (LOD) для внутренней структуры секции ----------------
// Раскрытие полок/ячеек зависит от их размера НА ЭКРАНЕ (ТЗ, разд. 2.3).
/** Мин. высота полки на экране (px), чтобы показывать деление на полки. */
export const LOD_SHELF_PX = 9;
/** Мин. ширина ячейки на экране (px), чтобы показывать деление на ячейки. */
export const LOD_CELL_PX = 7;

/** Классы Tailwind для заливки/текста/бордера модуля по типу. */
export const MODULE_STYLES: Record<
  ModuleType,
  { fill: string; text: string; border: string; ring: string }
> = {
  section: {
    fill: "bg-module-section",
    text: "text-module-section-fg",
    border: "border-module-section-fg/30",
    ring: "ring-module-section-fg/40",
  },
  aisle: {
    fill: "bg-module-aisle",
    text: "text-module-aisle-fg",
    border: "border-module-aisle-fg/25",
    ring: "ring-module-aisle-fg/40",
  },
  stairs: {
    fill: "bg-module-stairs",
    text: "text-module-stairs-fg",
    border: "border-module-stairs-fg/30",
    ring: "ring-module-stairs-fg/40",
  },
  elevator: {
    fill: "bg-module-elevator",
    text: "text-module-elevator-fg",
    border: "border-module-elevator-fg/30",
    ring: "ring-module-elevator-fg/40",
  },
};
