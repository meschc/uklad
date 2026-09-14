import { addressKey } from "./address";
import { allCells, buildOccupancy, checkFit, type CellCandidate } from "./placement";
import type { CellAddress, Product, ProductCategory, Warehouse } from "./types";

/**
 * Автоматическая раскладка товаров по ячейкам — не «куда попало», а по трём
 * складским правилам:
 *
 *  1. Категория живёт в своей зоне: секции склада делятся между категориями
 *     непрерывными блоками, пропорционально числу товаров. Комплектовщик не
 *     бегает за наушниками через весь склад.
 *  2. Тяжёлое — вниз, лёгкое — вверх: целевой ярус зависит от веса, чтобы
 *     не поднимать 12-килограммовую печь на верхнюю полку.
 *  3. В размер: из подходящих по габаритам ячеек берём самую тесную, чтобы
 *     крупные ячейки оставались под крупный товар.
 */

/** Вес (кг), с которого товар считаем тяжёлым — его место на нижних ярусах. */
const HEAVY_KG = 5;
/** Вес, до которого товар считаем лёгким — ему достаются верхние ярусы. */
const LIGHT_KG = 1;

/** Целевая высота яруса (0 — низ, 1 — верх) по весу товара. */
function targetLevel(weightKg?: number): number {
  const kg = weightKg ?? 0;
  if (kg >= HEAVY_KG) return 0;
  if (kg <= LIGHT_KG) return 0.85;
  return 0.45;
}

function volume(c: CellCandidate): number {
  return c.dims.widthCm * c.dims.heightCm * c.dims.depthCm;
}

interface Section {
  moduleId: string;
  cells: CellCandidate[];
  /** Число ярусов в секции — нужно, чтобы считать относительную высоту. */
  shelfCount: number;
}

/** Сгруппировать ячейки по секциям, сохранив порядок обхода склада. */
function sectionsOf(warehouse: Warehouse): Section[] {
  const byModule = new Map<string, Section>();
  for (const c of allCells(warehouse)) {
    const s = byModule.get(c.addr.moduleId);
    if (s) {
      s.cells.push(c);
      s.shelfCount = Math.max(s.shelfCount, c.addr.shelfIndex + 1);
    } else {
      byModule.set(c.addr.moduleId, {
        moduleId: c.addr.moduleId,
        cells: [c],
        shelfCount: c.addr.shelfIndex + 1,
      });
    }
  }
  return [...byModule.values()];
}

/**
 * Разделить секции между категориями непрерывными зонами пропорционально
 * числу товаров. Категория с одним товаром получает хотя бы одну секцию.
 */
function zonesOf(
  sections: Section[],
  demand: Map<ProductCategory, number>,
): Map<ProductCategory, Section[]> {
  const zones = new Map<ProductCategory, Section[]>();
  const cats = [...demand.keys()];
  const total = [...demand.values()].reduce((a, b) => a + b, 0);
  if (!total || !sections.length) return zones;

  let cursor = 0;
  cats.forEach((cat, i) => {
    const share = (demand.get(cat) ?? 0) / total;
    const last = i === cats.length - 1;
    const size = last ? sections.length - cursor : Math.max(1, Math.round(sections.length * share));
    zones.set(cat, sections.slice(cursor, cursor + size));
    cursor = Math.min(sections.length, cursor + size);
  });
  return zones;
}

/** Лучшая свободная ячейка для товара: сначала нужный ярус, потом «в размер». */
function pickCell(sections: Section[], taken: Set<string>, product: Product): CellCandidate | null {
  const target = targetLevel(product.weightKg);
  let best: CellCandidate | null = null;
  let bestScore = Infinity;

  for (const s of sections) {
    const levels = Math.max(1, s.shelfCount - 1);
    for (const c of s.cells) {
      if (taken.has(addressKey(c.addr))) continue;
      if (!checkFit(product, c.dims).fits) continue;
      const level = c.addr.shelfIndex / levels;
      // Ярус важнее плотности: сначала правильная высота, при равной — теснее.
      const score = Math.abs(level - target) * 1e9 + volume(c);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

/**
 * Разложить товары без места. Возвращает НОВЫЕ размещения (существующие не
 * трогает), поэтому вызов безопасен и для склада с уже занятыми ячейками.
 */
export function autoPlace(
  warehouse: Warehouse,
  products: Product[],
  placements: Record<string, CellAddress> = {},
): Record<string, CellAddress> {
  const sections = sectionsOf(warehouse);
  if (!sections.length) return {};

  const pending = products.filter((p) => !placements[p.id]);
  if (!pending.length) return {};

  const taken = new Set(Object.keys(buildOccupancy(placements)));

  const demand = new Map<ProductCategory, number>();
  for (const p of pending) {
    demand.set(p.category, (demand.get(p.category) ?? 0) + 1);
  }
  const zones = zonesOf(sections, demand);

  // Тяжёлые размещаем первыми: нижних ярусов меньше, и они должны достаться им.
  const queue = [...pending].sort((a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0));

  const out: Record<string, CellAddress> = {};
  for (const p of queue) {
    const zone = zones.get(p.category) ?? sections;
    // Своя зона в приоритете; если в ней мест нет — кладём куда влезает.
    const cell = pickCell(zone, taken, p) ?? pickCell(sections, taken, p);
    if (!cell) continue;
    taken.add(addressKey(cell.addr));
    out[p.id] = cell.addr;
  }
  return out;
}
