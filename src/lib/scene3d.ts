import { rowNumbers } from "./numbering";
import { buildOccupancy } from "./placement";
import type {
  CellAddress,
  ProductCategory,
  Product,
  Warehouse,
} from "./types";

/**
 * Геометрия 3D-сцены (ТЗ, разд. 3.7).
 *
 * Строится из УСЛОВНОЙ модели плана: координаты и размеры — в клетках сетки,
 * высота секции — константа. Реальные сантиметры в масштаб сцены не вмешиваются
 * (ТЗ, разд. 2.6) и влияют ровно на одно: пропорции коробки товара внутри своей
 * ячейки. Поэтому правка «высоты в см» не растягивает склад на экране.
 */

/** Высота секции в мировых единицах. Намеренно не зависит от realHeightCm. */
export const SECTION_H = 2;
/** Толщина межэтажного перекрытия. */
export const SLAB_H = 0.1;
/** Просвет между верхом секции и следующим перекрытием. */
export const FLOOR_GAP = 0.45;
/** Шаг этажей по высоте. */
export const FLOOR_STEP = SECTION_H + FLOOR_GAP + SLAB_H;

/** Зазор блока внутри ячейки, чтобы соседние слоты не слипались в полосу. */
const PAD = 0.76;
/** Толщина полки. */
const SHELF_T = 0.03;
/** Ширина бруска рамки. */
const BAR = 0.05;

/**
 * Рамка по периметру вместо сплошной плиты.
 *
 * Камера смотрит сверху, поэтому любая горизонтальная плита закрывает всё, что
 * под ней: сплошные полки прятали бы товар нижних ярусов, а перекрытия — целые
 * этажи. Рамка даёт тот же контур, но не загораживает обзор.
 */
function frame(
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sz: number,
  thickness: number,
): Box[] {
  return [
    { cx, cy, cz: cz - sz / 2 + BAR / 2, sx, sy: thickness, sz: BAR },
    { cx, cy, cz: cz + sz / 2 - BAR / 2, sx, sy: thickness, sz: BAR },
    { cx: cx - sx / 2 + BAR / 2, cy, cz, sx: BAR, sy: thickness, sz },
    { cx: cx + sx / 2 - BAR / 2, cy, cz, sx: BAR, sy: thickness, sz },
  ];
}

/**
 * Марш ступеней лестницы (ТЗ, разд. 3.7 — «детальная лестница»). Вместо
 * сплошного короба строим силуэт ступеней: вдоль длинной стороны нарезаем
 * `count` слайсов, каждый следующий выше предыдущего — классический профиль
 * лестницы, поднимающейся на следующий этаж. Плюс тонкие перила по бокам.
 */
function stairSteps(
  m: { x: number; y: number; w: number; h: number },
  baseY: number,
  color: number,
): ColoredBox[] {
  const alongZ = m.h >= m.w; // марш идёт вдоль длинной стороны
  const alongLen = alongZ ? m.h : m.w;
  const crossLen = alongZ ? m.w : m.h;
  const count = Math.max(6, Math.min(16, Math.round(alongLen / 0.45)));
  const slice = alongLen / count;
  const rise = FLOOR_STEP / count;
  const alongStart = alongZ ? m.y : m.x;
  const crossCenter = (alongZ ? m.x : m.y) + crossLen / 2;

  const out: ColoredBox[] = [];
  for (let i = 0; i < count; i++) {
    const height = (i + 1) * rise;
    const a = alongStart + (i + 0.5) * slice;
    out.push({
      cx: alongZ ? crossCenter : a,
      cy: baseY + height / 2,
      cz: alongZ ? a : crossCenter,
      sx: alongZ ? crossLen * 0.82 : slice * 0.96,
      sy: height,
      sz: alongZ ? slice * 0.96 : crossLen * 0.82,
      color,
    });
  }
  // Перила: два тонких бруска во всю длину по краям, на высоте марша.
  const railH = 0.08;
  const railY = baseY + FLOOR_STEP - railH / 2;
  for (const side of [-1, 1]) {
    const off = (crossLen / 2) * 0.9 * side;
    out.push({
      cx: alongZ ? crossCenter + off : alongStart + alongLen / 2,
      cy: railY,
      cz: alongZ ? alongStart + alongLen / 2 : crossCenter + off,
      sx: alongZ ? BAR * 1.5 : alongLen,
      sy: railH,
      sz: alongZ ? alongLen : BAR * 1.5,
      color,
    });
  }
  return out;
}

/**
 * Цвет товара по категории. Палитра нарочно приглушённая («бумажная»): низкая
 * насыщенность и мягкие тона, чтобы коробки на светлой сцене читались спокойно,
 * а не пестрели. Категории при этом остаются различимы.
 */
export const CATEGORY_COLOR: Record<ProductCategory, number> = {
  Одежда: 0x9d92c4, // припылённый фиолетовый
  Электроника: 0x6d8cb8, // спокойный синий
  "Бытовая техника": 0x5fa0a8, // мягкий бирюзовый
  Продукты: 0x82a978, // шалфейно-зелёный
  Инструменты: 0xc8a56a, // тёплый песочный
  Мебель: 0xc38079, // припылённая терракота
};

export interface Box {
  /** Центр. */
  cx: number;
  cy: number;
  cz: number;
  /** Габариты. */
  sx: number;
  sy: number;
  sz: number;
}

export interface ColoredBox extends Box {
  color: number;
}

/**
 * Занятая ЯЧЕЙКА: один параллелепипед на ячейку хранения, а не на габариты
 * товара. Так стеллаж читается как набор одинаковых слотов (реф порта с
 * контейнерами), а мелкие товары не превращаются в невидимые крошки.
 */
export interface CellBox extends Box {
  /** null — ячейка свободна (рисуется светлым блоком, клик её игнорирует). */
  productId: string | null;
  addr: CellAddress;
}

/** Плавающая подпись-чип (ряд, этаж) — рисуется спрайтом в движке. */
export interface SceneLabel {
  text: string;
  x: number;
  y: number;
  z: number;
}

export interface SceneData {
  /** Все ячейки хранения: занятые и свободные. */
  cells: CellBox[];
  /** Рамки межэтажных перекрытий (полки отдельными объектами не рисуем). */
  shelves: Box[];
  /** Полупрозрачные корпуса секций — чтобы полки не висели в воздухе. */
  sections: Box[];
  slabs: Box[];
  structure: ColoredBox[];
  /** Полупрозрачный корпус здания (стены) — рисуется поверх содержимого. */
  building: Box[];
  labels: SceneLabel[];
  center: [number, number, number];
  /** Наибольшая сторона габаритного куба — для подбора зума. */
  span: number;
}

// Палитра «цифрового двойника» (рефы 216687/219680/223446): белые и светло-
// серые модели, никакой пестроты — цвет остаётся товарам и подсветкам.
const FLOOR_COLOR = 0xe3e8ef;
const GROUND_COLOR = 0xf0f3f7;
const STAIRS_COLOR = 0xc2c9d6;
const ELEVATOR_COLOR = 0xaeb8c9;
const BEAM_COLOR = 0xf7f9fc;

export function buildScene(
  warehouse: Warehouse,
  placements: Record<string, CellAddress>,
  products: Product[],
  opts?: { rowLabel?: (n: number) => string },
): SceneData {
  const rowLabel = opts?.rowLabel ?? ((n: number) => `Ряд ${n}`);
  const occupancy = buildOccupancy(placements);
  const byId = new Map(products.map((p) => [p.id, p]));

  const out: SceneData = {
    cells: [],
    shelves: [],
    sections: [],
    slabs: [],
    structure: [],
    building: [],
    labels: [],
    center: [0, 0, 0],
    span: 10,
  };

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;

  warehouse.floors.forEach((floor, floorIdx) => {
    const baseY = floorIdx * FLOOR_STEP;

    // Плита-пол этажа: одна панель по габаритам его модулей + отступ. Проход =
    // пол между секциями (модель «пол как проход»), отдельных проходов больше нет.
    let fMinX = Infinity,
      fMaxX = -Infinity,
      fMinZ = Infinity,
      fMaxZ = -Infinity;
    for (const m of floor.modules) {
      fMinX = Math.min(fMinX, m.x);
      fMaxX = Math.max(fMaxX, m.x + m.w);
      fMinZ = Math.min(fMinZ, m.y);
      fMaxZ = Math.max(fMaxZ, m.y + m.h);
    }
    if (fMinX < fMaxX) {
      const pad = 1;
      out.structure.push({
        cx: (fMinX + fMaxX) / 2,
        cy: baseY + 0.02,
        cz: (fMinZ + fMaxZ) / 2,
        sx: fMaxX - fMinX + pad * 2,
        sy: 0.04,
        sz: fMaxZ - fMinZ + pad * 2,
        color: FLOOR_COLOR,
      });
      // Чип с именем этажа — у угла его плиты, над секциями.
      out.labels.push({
        text: floor.name,
        x: fMinX - pad / 2,
        y: baseY + SECTION_H + 1.1,
        z: fMinZ - pad / 2,
      });
    }

    // Чипы рядов — над центром габарита закреплённых рядов (как в 2D).
    {
      const rowMap = rowNumbers(floor);
      const pinned = new Set<number>();
      for (const m of floor.modules) if (m.row != null) pinned.add(m.row);
      const boxes = new Map<
        number,
        { minX: number; minZ: number; maxX: number; maxZ: number }
      >();
      for (const m of floor.modules) {
        const r = rowMap.get(m.id);
        if (r == null || !pinned.has(r)) continue;
        const b = boxes.get(r);
        if (!b) {
          boxes.set(r, { minX: m.x, minZ: m.y, maxX: m.x + m.w, maxZ: m.y + m.h });
        } else {
          b.minX = Math.min(b.minX, m.x);
          b.minZ = Math.min(b.minZ, m.y);
          b.maxX = Math.max(b.maxX, m.x + m.w);
          b.maxZ = Math.max(b.maxZ, m.y + m.h);
        }
      }
      for (const [row, b] of boxes) {
        out.labels.push({
          text: rowLabel(row),
          x: (b.minX + b.maxX) / 2,
          y: baseY + SECTION_H + 0.55,
          z: (b.minZ + b.maxZ) / 2,
        });
      }
    }

    for (const m of floor.modules) {
      minX = Math.min(minX, m.x);
      maxX = Math.max(maxX, m.x + m.w);
      minZ = Math.min(minZ, m.y);
      maxZ = Math.max(maxZ, m.y + m.h);

      const cx = m.x + m.w / 2;
      const cz = m.y + m.h / 2;

      // Проход — это пол (плита выше), отдельного объекта в сцене нет.
      if (m.type === "aisle") continue;
      if (m.type === "stairs") {
        // Лестница — детальный марш ступеней с перилами, поднимающийся на этаж.
        out.structure.push(...stairSteps(m, baseY, STAIRS_COLOR));
        continue;
      }
      if (m.type === "elevator") {
        // Лифт — шахта на всю высоту шага (связывает этажи).
        const h = FLOOR_STEP;
        out.structure.push({
          cx,
          cy: baseY + h / 2,
          cz,
          sx: m.w,
          sy: h,
          sz: m.h,
          color: ELEVATOR_COLOR,
        });
        continue;
      }
      if (m.type !== "section") continue;

      const shelves = m.shelves ?? [];
      if (!shelves.length) continue;
      const shelfH = SECTION_H / shelves.length;

      out.sections.push({
        cx,
        cy: baseY + SECTION_H / 2,
        cz,
        sx: m.w,
        sy: SECTION_H,
        sz: m.h,
      });

      // Ячейки нарезают ДЛИННУЮ сторону секции (идут вдоль полки слева
      // направо), а не короткую: иначе каждая ячейка вытягивается во всю
      // длину стеллажа и превращается в брусок вдоль ряда.
      const alongZ = m.h >= m.w;
      const shelfLen = alongZ ? m.h : m.w;
      const shelfStart = alongZ ? m.y : m.x;

      shelves.forEach((shelf, shelfIndex) => {
        const shelfY = baseY + shelfIndex * shelfH;
        const cellLen = shelfLen / shelf.cells;
        const cellH = Math.max(0, shelfH - SHELF_T);

        // Рисуем ВСЕ ячейки полки, а не только занятые: число блоков в
        // секции совпадает с её раскладкой, склад читается как сетка слотов.
        for (let cellIndex = 0; cellIndex < shelf.cells; cellIndex++) {
          // В ячейке может лежать и коробка приёмки с несколькими товарами —
          // для 3D берём первый известный товар как представителя ячейки.
          const occupied = occupancy[`${m.id}:${shelfIndex}:${cellIndex}`];
          const productId =
            occupied?.productIds.find((id) => byId.has(id)) ?? null;

          const sy = cellH * PAD;
          const along = shelfStart + (cellIndex + 0.5) * cellLen;
          out.cells.push({
            productId,
            addr: {
              floorId: floor.id,
              moduleId: m.id,
              shelfIndex,
              cellIndex,
            },
            cx: alongZ ? cx : along,
            cy: shelfY + SHELF_T + sy / 2,
            cz: alongZ ? along : cz,
            sx: (alongZ ? m.w : cellLen) * PAD,
            sy,
            sz: (alongZ ? cellLen : m.h) * PAD,
          });
        }
      });
    }
  });

  if (!Number.isFinite(minX)) return out;

  const padXZ = 0.6;
  const w = maxX - minX + padXZ * 2;
  const d = maxZ - minZ + padXZ * 2;
  const scx = (minX + maxX) / 2;
  const scz = (minZ + maxZ) / 2;
  warehouse.floors.forEach((_, floorIdx) => {
    const cy = floorIdx * FLOOR_STEP - SLAB_H / 2;
    if (floorIdx === 0) {
      // Земля — сплошная: под ней ничего нет, закрывать нечего.
      out.slabs.push({ cx: scx, cy, cz: scz, sx: w, sy: SLAB_H, sz: d });
    } else {
      // Перекрытия верхних этажей — рамкой, иначе спрячут этажи под собой.
      out.shelves.push(...frame(scx, cy, scz, w, d, SLAB_H));
    }
  });

  const totalH = Math.max(1, warehouse.floors.length) * FLOOR_STEP;

  // Площадка-земля вокруг здания: светлая, заметно шире плиты (рефы — модели
  // стоят на большой светлой поверхности, а не парят на своей плите).
  out.structure.push({
    cx: scx,
    cy: -SLAB_H - 0.03,
    cz: scz,
    sx: w + 14,
    sy: 0.06,
    sz: d + 14,
    color: GROUND_COLOR,
  });

  // Корпус здания: полупрозрачные стены по периметру + белый каркас крыши
  // (реф 219680). Стены тонкие и почти прозрачные, чтобы не прятать план.
  {
    const bp = 0.9; // отступ стен от крайних модулей
    const bw = w - padXZ * 2 + bp * 2;
    const bd = d - padXZ * 2 + bp * 2;
    const wallT = 0.06;
    const wallH = totalH + 0.4;
    const y = wallH / 2 - SLAB_H;
    out.building.push(
      { cx: scx, cy: y, cz: scz - bd / 2, sx: bw, sy: wallH, sz: wallT },
      { cx: scx, cy: y, cz: scz + bd / 2, sx: bw, sy: wallH, sz: wallT },
      { cx: scx - bw / 2, cy: y, cz: scz, sx: wallT, sy: wallH, sz: bd },
      { cx: scx + bw / 2, cy: y, cz: scz, sx: wallT, sy: wallH, sz: bd },
    );
    // Каркас крыши: рамка по периметру + редкие поперечные балки.
    const roofY = wallH - SLAB_H;
    const bar = 0.14;
    out.structure.push(
      { cx: scx, cy: roofY, cz: scz - bd / 2, sx: bw, sy: bar, sz: bar, color: BEAM_COLOR },
      { cx: scx, cy: roofY, cz: scz + bd / 2, sx: bw, sy: bar, sz: bar, color: BEAM_COLOR },
      { cx: scx - bw / 2, cy: roofY, cz: scz, sx: bar, sy: bar, sz: bd, color: BEAM_COLOR },
      { cx: scx + bw / 2, cy: roofY, cz: scz, sx: bar, sy: bar, sz: bd, color: BEAM_COLOR },
    );
    const alongX = bw >= bd; // балки поперёк длинной стороны
    const len = alongX ? bw : bd;
    const beams = Math.max(2, Math.floor(len / 5));
    for (let i = 1; i < beams; i++) {
      const p = (alongX ? scx - bw / 2 : scz - bd / 2) + (len / beams) * i;
      out.structure.push({
        cx: alongX ? p : scx,
        cy: roofY,
        cz: alongX ? scz : p,
        sx: alongX ? bar * 0.7 : bw,
        sy: bar * 0.7,
        sz: alongX ? bd : bar * 0.7,
        color: BEAM_COLOR,
      });
    }
  }

  out.center = [scx, totalH / 2, scz];
  out.span = Math.max(w, d, totalH);
  return out;
}
