import {
  DEFAULT_ADDRESSING,
  DEFAULT_SECTION_HEIGHT_CM,
  type AddressingConfig,
  type CellAddress,
  type Floor,
  type PlacedModule,
  type Warehouse,
} from "./types";
import { rowNumbers, rowSectionNumbers } from "./numbering";

/**
 * Действующая схема адресации. Держим копию здесь, а не тянем стор: адрес
 * форматируется из десятка мест, и таскать конфиг через каждый вызов — шум.
 * Стор синхронизирует это значение при загрузке и при смене настроек
 * (address.ts стор НЕ импортирует, поэтому цикла не возникает).
 */
let current: AddressingConfig = DEFAULT_ADDRESSING;

export function setAddressingConfig(cfg: AddressingConfig) {
  current = cfg;
}

/**
 * Действующий номер этажа: собственный (задан вручную) или позиционный.
 * `idx` — индекс этажа в складе.
 */
export function floorNumber(floor: Floor, idx: number): number {
  return floor.number ?? idx + 1;
}

/** Действующий номер ряда секции: закреплённый или вычисленный. */
export function rowOf(floor: Floor, moduleId: string): number {
  return rowNumbers(floor).get(moduleId) ?? 1;
}

/**
 * Номер полки. Не задан вручную — считаем по направлению из настроек:
 * полки лежат в массиве сверху вниз, поэтому «снизу вверх» — это обратный счёт.
 */
export function shelfNumber(
  mod: PlacedModule,
  shelfIndex: number,
  cfg: AddressingConfig = current,
): number {
  const shelves = mod.shelves ?? [];
  const own = shelves[shelfIndex]?.number;
  if (own != null) return own;
  return cfg.shelfOrder === "bottomUp"
    ? shelves.length - shelfIndex
    : shelfIndex + 1;
}

/**
 * Адресация места хранения (ТЗ, разд. 2.1):
 *   Склад → Этаж/ряд → Секция → Полка → Ячейка,  напр. `32-19-20-3`.
 * Номера этажа и секции — порядковые в пределах родителя, с единицы.
 */

/**
 * Номер секции в адресе. Если у модуля задан собственный `number` (вручную или
 * автонумерацией) — берём его; иначе падаем на порядковый среди секций этажа.
 */
export function sectionNumber(
  floor: Floor,
  moduleId: string,
  cfg: AddressingConfig = current,
): number {
  const sections = floor.modules.filter((m) => m.type === "section");
  const mod = sections.find((m) => m.id === moduleId);
  if (!mod) return 0;
  if (mod.number != null) return mod.number;
  // С рядами секция нумеруется ВНУТРИ своего ряда, как принято на складах:
  // двусторонний — нечёт/чёт по сторонам прохода, односторонний — подряд.
  if (cfg.useRows) {
    const row = rowOf(floor, moduleId);
    const config = floor.rows?.find((r) => r.number === row);
    return rowSectionNumbers(floor, row, config).get(moduleId) ?? 1;
  }
  return sections.findIndex((m) => m.id === moduleId) + 1;
}

/** Строковый адрес ячейки, либо null если адрес больше не существует. */
export function formatAddress(
  warehouse: Warehouse,
  addr: CellAddress,
  cfg: AddressingConfig = current,
): string | null {
  const floorIdx = warehouse.floors.findIndex((f) => f.id === addr.floorId);
  if (floorIdx < 0) return null;
  const floor = warehouse.floors[floorIdx];
  const mod = floor.modules.find((m) => m.id === addr.moduleId);
  if (!mod || mod.type !== "section") return null;
  const secNo = sectionNumber(floor, addr.moduleId, cfg);
  if (secNo < 1) return null;
  const shelves = mod.shelves ?? [];
  const shelf = shelves[addr.shelfIndex];
  if (!shelf || addr.cellIndex >= shelf.cells) return null;

  const parts: number[] = [];
  // Номер этажа — собственный, если задан; иначе позиция в списке.
  if (cfg.useFloor !== false) parts.push(floorNumber(floor, floorIdx));
  if (cfg.useRows) parts.push(rowOf(floor, mod.id));
  parts.push(secNo, shelfNumber(mod, addr.shelfIndex, cfg), addr.cellIndex + 1);
  return parts.join(cfg.separator);
}

/**
 * Разбирает строку `этаж-секция-полка-ячейка` (1-based, как в formatAddress)
 * обратно в CellAddress. Возвращает null, если формат неверный или такой
 * ячейки в складе нет. Разделители — дефис/точка/пробел/слэш (гибко к вводу).
 */
export function parseAddress(
  warehouse: Warehouse,
  input: string,
  cfg: AddressingConfig = current,
): CellAddress | null {
  const parts = input.trim().split(/[\s.\-/]+/).filter(Boolean);
  const hasFloor = cfg.useFloor !== false;
  const expected = (hasFloor ? 1 : 0) + (cfg.useRows ? 1 : 0) + 3;
  if (parts.length !== expected) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1)) return null;

  // Разбираем уровни по порядку; отсутствующий этаж → единственный (первый) этаж.
  let idx = 0;
  const f = hasFloor ? nums[idx++] : 1;
  const row = cfg.useRows ? nums[idx++] : undefined;
  const [s, sh, c] = nums.slice(idx);

  // Этаж ищем по его номеру в адресе (собственному или позиционному).
  const floor =
    warehouse.floors.find((x, i) => floorNumber(x, i) === f) ?? null;
  if (!floor) return null;

  // Ищем секцию по ЭФФЕКТИВНОМУ номеру, чтобы разбор был обратен formatAddress.
  const candidates = floor.modules.filter(
    (m) => m.type === "section" && (row == null || rowOf(floor, m.id) === row),
  );
  const mod = candidates.find((m) => sectionNumber(floor, m.id, cfg) === s);
  if (!mod) return null;

  // Номер полки → индекс в массиве (учитываем направление и ручные номера).
  const shelves = mod.shelves ?? [];
  const shelfIndex = shelves.findIndex(
    (_, i) => shelfNumber(mod, i, cfg) === sh,
  );
  if (shelfIndex < 0) return null;
  if (c > shelves[shelfIndex].cells) return null;

  return {
    floorId: floor.id,
    moduleId: mod.id,
    shelfIndex,
    cellIndex: c - 1,
  };
}

/** Уникальный ключ ячейки — для поиска занятости. */
export function addressKey(addr: CellAddress): string {
  return `${addr.moduleId}:${addr.shelfIndex}:${addr.cellIndex}`;
}

export interface CellDims {
  widthCm: number;
  heightCm: number;
  depthCm: number;
}

/**
 * Габариты ячейки выводятся из реальных габаритов секции пропорционально:
 * полки делят высоту, ячейки — прогон полки. Если ячейка одна на полке —
 * она занимает всю полку (ТЗ, разд. 2.6).
 *
 * Ячейки делят ДЛИННУЮ сторону основания, а глубина ячейки — короткая:
 * стеллаж 1×3 клетки — это прогон 3 м при глубине 1 м, а не наоборот.
 * Раньше ширина бралась из `realWidthCm` вслепую, и у типовой секции 1×3
 * ячейка выходила 33 см шириной при 3 м глубины — товары не проходили по
 * ширине никуда, хотя реально помещались (п.8, корень жалобы п.19).
 */
export function cellDimsCm(
  mod: PlacedModule,
  shelfIndex: number,
): CellDims | null {
  const shelves = mod.shelves ?? [];
  const shelf = shelves[shelfIndex];
  if (!shelf) return null;
  const w = mod.realWidthCm ?? 0;
  const d = mod.realDepthCm ?? 0;
  const h = mod.realHeightCm ?? DEFAULT_SECTION_HEIGHT_CM;
  const run = Math.max(w, d); // прогон полки
  const depth = Math.min(w, d); // глубина стеллажа
  return {
    widthCm: run / shelf.cells,
    heightCm: h / shelves.length,
    depthCm: depth,
  };
}

/** Округление до десятых — габариты в ТЗ задаются с десятыми (напр. 234,1). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Формат числа в см по-русски: разделитель — запятая, без хвостового нуля. */
export function cm(n: number): string {
  return round1(n).toString().replace(".", ",");
}
