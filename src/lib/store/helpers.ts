import { clamp, uid } from "../utils";
import {
  DEFAULT_SECTION_HEIGHT_CM,
  DEFAULT_SHELF_CELLS,
  DEFAULT_SHELF_COUNT,
  MODULE_SPECS,
  type CellAddress,
  type Floor,
  type ModuleType,
  type PlacedModule,
  type ShelfConfig,
  type Warehouse,
} from "../types";
import type { EditorState } from "./state";

/**
 * Общие помощники стора: создание модулей, клонирование этажей/модулей,
 * иммутабельная правка активного этажа. Живут отдельно от слайсов, потому что
 * ими пользуется больше одного слайса (модули, этажи, буфер обмена, посев).
 */

/** Максимум этажей (мезонин): не более 10 (ТЗ — ограничение по высоте склада). */
export const FLOOR_MAX = 10;

/** Ключ значения доп.поля: товар + поле. */
export function fieldValueKey(productId: string, fieldId: string): string {
  return `${productId}:${fieldId}`;
}

/** Полки по умолчанию для новой секции (ТЗ, разд. 2.3). */
function defaultShelves(): ShelfConfig[] {
  return Array.from({ length: DEFAULT_SHELF_COUNT }, () => ({
    id: uid("shelf"),
    cells: DEFAULT_SHELF_CELLS,
  }));
}

/** Человекочитаемое имя шаблона по его раскладке. */
export function nameForCells(cells: number[]): string {
  const n = cells.length;
  const uniform = cells.every((c) => c === cells[0]);
  return uniform
    ? `${n} × ${cells[0]}`
    : `${n} полок · ${Math.min(...cells)}–${Math.max(...cells)}`;
}

/** Имя шаблона раскладки по составу группы: «3 секции · проход». */
export function nameForLayout(mods: PlacedModule[]): string {
  const n = mods.filter((m) => m.type === "section").length;
  const extra = mods.length - n;
  const head = `${n || mods.length} ${n ? "секц." : "мод."}`;
  return extra > 0 ? `${head} +${extra}` : head;
}

/** Границы размеров по типу с учётом фиксированных модулей. */
export function clampSize(type: ModuleType, w: number, h: number) {
  const spec = MODULE_SPECS[type];
  if (spec.fixed) return { w: spec.fixed.w, h: spec.fixed.h };
  return {
    w: clamp(Math.round(w), spec.min, spec.max),
    h: clamp(Math.round(h), spec.min, spec.max),
  };
}

/**
 * Собрать новый модуль. Общий путь для демо-раскладки, одиночной постановки
 * и групповой (штамп шаблона) — чтобы правила (пределы размера, габариты в
 * см, полки у секции) не разъезжались между способами создания.
 */
export function makeModule(
  type: ModuleType,
  x: number,
  y: number,
  size?: { w?: number; h?: number },
): PlacedModule {
  const spec = MODULE_SPECS[type];
  const { w, h } = clampSize(type, size?.w ?? spec.defaultSize.w, size?.h ?? spec.defaultSize.h);
  return {
    id: uid("mod"),
    type,
    x: Math.round(x),
    y: Math.round(y),
    w,
    h,
    rotation: 0,
    realWidthCm: w * 100,
    realDepthCm: h * 100,
    ...(type === "section"
      ? {
          shelves: defaultShelves(),
          realHeightCm: DEFAULT_SECTION_HEIGHT_CM,
        }
      : {}),
  };
}

export function withShelves(m: PlacedModule, cells: number[]): PlacedModule {
  m.shelves = cells.map((c) => ({ id: uid("shelf"), cells: c }));
  return m;
}

/**
 * Глубокая копия этажа: новые id у этажа, модулей и полок, чтобы после
 * тиражирования каждый этаж редактировался независимо (ТЗ, разд. 3.5, п. 3).
 * Имя проставляется потом через renumberFloors.
 */
export function cloneFloor(f: Floor): Floor {
  return {
    id: uid("floor"),
    name: "",
    modules: f.modules.map((m) => ({
      ...m,
      id: uid("mod"),
      shelves: m.shelves?.map((sh) => ({ id: uid("shelf"), cells: sh.cells })),
    })),
  };
}

/**
 * Копии модулей со свежими id (у модулей и полок) и сдвигом на dx/dy клеток —
 * для дублирования и вставки. Размещения товара не копируются: копии секций
 * начинаются пустыми, товар остаётся у оригинала.
 */
export function cloneModules(mods: PlacedModule[], dx: number, dy: number): PlacedModule[] {
  return mods.map((m) => ({
    ...m,
    id: uid("mod"),
    x: m.x + dx,
    y: m.y + dy,
    shelves: m.shelves?.map((sh) => ({ id: uid("shelf"), cells: sh.cells })),
  }));
}

/** Сквозная нумерация этажей — она же часть адреса места хранения. */
export function renumberFloors(floors: Floor[]): Floor[] {
  return floors.map((f, i) => (f.name === `Этаж ${i + 1}` ? f : { ...f, name: `Этаж ${i + 1}` }));
}

/**
 * Этаж-источник для алиаса: следуем по `aliasOf` до реального этажа с раскладкой
 * (без циклов — один уровень; источник алиасом обычно не бывает). Если ссылка
 * битая, остаёмся на самом этаже.
 */
function floorSourceId(warehouse: Warehouse, floorId: string): string {
  const f = warehouse.floors.find((x) => x.id === floorId);
  if (f?.aliasOf && warehouse.floors.some((x) => x.id === f.aliasOf)) {
    return f.aliasOf;
  }
  return floorId;
}

/**
 * Раскладка этажа с учётом алиаса: связанный этаж показывает модули/ряды своего
 * источника. Ссылку кэшируем по объекту-алиасу и проверяем по `modules`
 * источника — пока они те же, возвращаем ТУ ЖЕ ссылку, иначе useSyncExternalStore
 * зациклит рендер (снимок обязан быть стабильным). Источник правится — кэш
 * промахивается сам, отдаём свежее зеркало.
 */
const aliasViewCache = new WeakMap<Floor, Floor>();

export function resolveFloor(warehouse: Warehouse, floor: Floor): Floor {
  if (!floor.aliasOf) return floor;
  const src = warehouse.floors.find((f) => f.id === floor.aliasOf);
  if (!src) return floor;
  const cached = aliasViewCache.get(floor);
  if (cached && cached.modules === src.modules && cached.rows === src.rows) {
    return cached;
  }
  const view: Floor = { ...floor, modules: src.modules, rows: src.rows };
  aliasViewCache.set(floor, view);
  return view;
}

/** Товары, чьи адреса исчезнут после операции. */
export function goodsAt(
  placements: Record<string, CellAddress>,
  hits: (addr: CellAddress) => boolean,
): string[] {
  return Object.entries(placements)
    .filter(([, addr]) => hits(addr))
    .map(([productId]) => productId);
}

/**
 * Иммутабельно применяет мутацию к активному этажу (клонируя структуру),
 * чтобы zustand/React увидели изменение ссылки.
 */
export function mutateActiveFloor(
  state: EditorState,
  fn: (floor: Floor) => void,
  extra?: Partial<EditorState>,
): Partial<EditorState> {
  // Правки связанного этажа идут в источник — все алиасы обновятся разом.
  const activeId = state.activeFloorId || state.warehouse.floors[0].id;
  const targetId = floorSourceId(state.warehouse, activeId);
  const warehouse = {
    ...state.warehouse,
    floors: state.warehouse.floors.map((f) => {
      if (f.id !== targetId) return f;
      const clone: Floor = { ...f, modules: f.modules.map((m) => ({ ...m })) };
      fn(clone);
      return clone;
    }),
  };
  return { warehouse, ...extra };
}
