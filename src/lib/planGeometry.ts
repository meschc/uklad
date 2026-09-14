import { rowNumbers } from "./numbering";
import type { CellRect, Floor, PlacedModule } from "./types";

/**
 * Геометрия плана этажа: габарит раскладки и рамки закреплённых рядов.
 *
 * Обе величины до этого считались по месту — в холсте (дважды: «вписать в
 * экран» и плита пола), на тепловой карте, в 3D-сцене, в печатной форме и в
 * миниатюре склада. Формула везде одна, а расхождение в ней ничего не ломает
 * заметно: план просто встаёт чуть мимо центра, ярлык ряда — мимо его середины.
 * Поэтому счёт живёт здесь и покрыт тестами.
 */

/**
 * Габарит набора модулей в клетках сетки. `pad` — запас со всех сторон
 * (клетка-другая, чтобы план не упирался в край экрана или листа).
 *
 * У пустого набора габарита нет — отсюда `null`, а не нулевой прямоугольник:
 * нулевой пришлось бы отличать от настоящего на каждом вызове, и однажды это
 * забыли бы сделать.
 */
export function planBounds(modules: PlacedModule[], pad = 0): CellRect | null {
  if (modules.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of modules) {
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.w);
    maxY = Math.max(maxY, m.y + m.h);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
  };
}

/** Ряд как единица плана: номер, состав и общий габарит. */
export interface RowFrame {
  row: number;
  ids: Set<string>;
  rect: CellRect;
}

/**
 * Рамки рядов этажа, по возрастанию номера.
 *
 * Ряд собирается по ДЕЙСТВУЮЩЕМУ номеру (`rowNumbers`) — тогда в габарит
 * попадают и лестницы линии (п.13), у которых своего поля `row` нет. В ответ
 * идут только ряды, закреплённые человеком: хотя бы у одного модуля ряда
 * проставлено собственное `row`. Автоматические номера рамкой не обводим —
 * иначе на плане было бы обведено вообще всё.
 */
export function rowFrames(floor: Floor): RowFrame[] {
  const rowMap = rowNumbers(floor);
  const pinned = new Set<number>();
  for (const m of floor.modules) if (m.row != null) pinned.add(m.row);

  const boxes = new Map<
    number,
    { minX: number; minY: number; maxX: number; maxY: number; ids: Set<string> }
  >();
  for (const m of floor.modules) {
    const r = rowMap.get(m.id);
    if (r == null || !pinned.has(r)) continue;
    const b = boxes.get(r);
    if (!b) {
      boxes.set(r, {
        minX: m.x,
        minY: m.y,
        maxX: m.x + m.w,
        maxY: m.y + m.h,
        ids: new Set([m.id]),
      });
    } else {
      b.minX = Math.min(b.minX, m.x);
      b.minY = Math.min(b.minY, m.y);
      b.maxX = Math.max(b.maxX, m.x + m.w);
      b.maxY = Math.max(b.maxY, m.y + m.h);
      b.ids.add(m.id);
    }
  }

  return [...boxes.entries()]
    .map(([row, b]) => ({
      row,
      ids: b.ids,
      rect: { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY },
    }))
    .sort((a, b) => a.row - b.row);
}

/**
 * Номер ряда, которому выделение соответствует РОВНО: все его модули и ничего
 * лишнего. Иначе `null`.
 *
 * Вопрос «выделен ли целый ряд» задают двое и по разным поводам: холст решает,
 * рисовать ли рамку вместо колец у каждого модуля, инспектор — показывать ли
 * свойства ряда вместо панели нескольких секций. Ответ обязан быть один, иначе
 * рамка и панель разойдутся на одном и том же выделении.
 *
 * Считаем по ДЕЙСТВУЮЩИМ номерам (`rowNumbers`), а не по закреплённым: ряд,
 * определённый автоматически, тоже выделяется целиком.
 */
export function rowOfSelection(floor: Floor, ids: string[]): number | null {
  if (!ids.length) return null;
  const map = rowNumbers(floor);
  const rows = new Set(ids.map((id) => map.get(id)));
  if (rows.size !== 1) return null;
  const row = [...rows][0];
  if (row == null) return null;
  const total = [...map.values()].filter((v) => v === row).length;
  return ids.length === total ? row : null;
}

/** Насколько далеко от края ряда сосед ещё считается «вплотную», в его ширинах. */
const NEIGHBOUR_GAP_CELLS = 4;

/**
 * Свободные стороны ряда — те, куда его ещё есть куда продолжить (п.6).
 *
 * `before` — сторона меньших координат поперёк ряда, `after` — больших. Сторона
 * занята, если рядом с ней уже стоит другой ряд: перекрывается по длине и
 * отстоит не дальше собственной ширины плюс проход. Ряд посреди раскладки
 * закрыт с обеих сторон — и предлагать «продолжить» там нечего.
 */
export function freeRowSides(
  frame: RowFrame,
  all: RowFrame[],
): { before: boolean; after: boolean } {
  const { rect } = frame;
  // Ряд вытянут вдоль длинной стороны; продолжают его всегда поперёк.
  const vertical = rect.h >= rect.w;
  const acrossPos = (r: CellRect) => (vertical ? r.x : r.y);
  const acrossLen = (r: CellRect) => (vertical ? r.w : r.h);
  const alongPos = (r: CellRect) => (vertical ? r.y : r.x);
  const alongLen = (r: CellRect) => (vertical ? r.h : r.w);

  const overlapsAlong = (o: RowFrame) =>
    alongPos(rect) < alongPos(o.rect) + alongLen(o.rect) &&
    alongPos(rect) + alongLen(rect) > alongPos(o.rect);

  const reach = acrossLen(rect) + NEIGHBOUR_GAP_CELLS;
  const near = acrossPos(rect);
  const far = near + acrossLen(rect);

  const neighbours = all.filter((o) => o.row !== frame.row && overlapsAlong(o));
  // Допуск в клетку: ряды, стоящие стык в стык, не должны считаться далёкими
  // из-за округления габаритов.
  const taken = (side: "before" | "after") =>
    neighbours.some((o) => {
      const oNear = acrossPos(o.rect);
      const oFar = oNear + acrossLen(o.rect);
      return side === "before"
        ? oFar <= near + 1 && near - oFar <= reach
        : oNear >= far - 1 && oNear - far <= reach;
    });

  return { before: !taken("before"), after: !taken("after") };
}
