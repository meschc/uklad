import type { CellRect, PlacedModule, XY } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { CELL } from "../constants";
import type { Handle } from "./screen";

/**
 * Счёт, стоящий за перетаскиванием на холсте: во что превращается сдвиг курсора.
 *
 * Вынесен из обработчиков указателя отдельно и без побочных действий — это
 * единственная часть перетаскивания, которую можно проверить тестом. Ошибка
 * здесь не падает и не логируется: модуль просто «уползает» от курсора на
 * клетку или растёт не с той стороны, и заметно это лишь руками.
 */

/** Короче этого по обеим сторонам — не рамка, а клик по пустому месту. */
export const MARQUEE_MIN_CELLS = 3 / CELL;

/**
 * Новый габарит модуля при тяге за ручку. `d` — сдвиг курсора в клетках.
 *
 * Тонкость здесь одна, и она вся про упор в предел: сторона, за которую тянут,
 * идёт за курсором, а ПРОТИВОПОЛОЖНАЯ обязана стоять на месте. Наивный счёт
 * («сдвинуть угол, потом обрезать размер») упирается в минимум и начинает
 * тащить за собой всю секцию. Поэтому левый/верхний край считается вторым
 * заходом — уже от обрезанного размера и от неподвижного дальнего края.
 */
export function resizeRect(
  start: CellRect,
  handle: Handle,
  d: XY,
  limits: { min: number; max: number },
): CellRect {
  let { x, y } = start;
  let w = start.w;
  let h = start.h;

  if (handle.includes("e")) w = start.w + d.x;
  if (handle.includes("s")) h = start.h + d.y;
  if (handle.includes("w")) w = start.w - d.x;
  if (handle.includes("n")) h = start.h - d.y;

  w = clamp(w, limits.min, limits.max);
  h = clamp(h, limits.min, limits.max);

  // Якорим дальнюю сторону: правый край при тяге за левую ручку и нижний — при
  // тяге за верхнюю.
  if (handle.includes("w")) x = start.x + start.w - w;
  if (handle.includes("n")) y = start.y + start.h - h;

  return { x, y, w, h };
}

/** Прямоугольник рамки выделения по двум её углам (в клетках). */
export function marqueeRect(from: XY, to: XY): CellRect {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return { x, y, w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) };
}

/**
 * Модули, задетые рамкой. Именно задетые, а не накрытые целиком: обводить
 * стеллаж полностью, чтобы его выбрать, — работа, которой в других редакторах
 * не требуют.
 */
export function modulesInRect(modules: PlacedModule[], rect: CellRect): string[] {
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  return modules
    .filter((m) => m.x < x1 && m.x + m.w > rect.x && m.y < y1 && m.y + m.h > rect.y)
    .map((m) => m.id);
}
