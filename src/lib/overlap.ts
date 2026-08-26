import type { PlacedModule } from "./types";

/**
 * Обнаружение наложений модулей на плане. Нужно, потому что размеры и позицию
 * можно править числом в инспекторе, где перетаскивание не мешает положить
 * секцию на секцию (ТЗ физическую валидацию 2D не требует, но пользователю
 * такое молчаливое наложение читается как баг — поэтому подсвечиваем).
 *
 * ВАЖНО: пересечение двух проходов — штатная ситуация (они образуют крест),
 * поэтому пара «проход + проход» наложением не считается.
 */

/** Пересекаются ли прямоугольники модулей по клеткам. */
export function rectsOverlap(a: PlacedModule, b: PlacedModule): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/** Пара считается наложением, если это не два прохода (крест — штатный). */
export function isOverlapConflict(a: PlacedModule, b: PlacedModule): boolean {
  if (a.type === "aisle" && b.type === "aisle") return false;
  return rectsOverlap(a, b);
}

/** Id всех модулей этажа, которые с чем-то пересекаются. */
export function overlappingIds(modules: PlacedModule[]): Set<string> {
  const hit = new Set<string>();
  for (let i = 0; i < modules.length; i++) {
    for (let j = i + 1; j < modules.length; j++) {
      if (isOverlapConflict(modules[i], modules[j])) {
        hit.add(modules[i].id);
        hit.add(modules[j].id);
      }
    }
  }
  return hit;
}
