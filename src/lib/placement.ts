import { addressKey, cellDimsCm, type CellDims } from "./address";
import {
  DEFAULT_PICK_PRIORITY,
  type Box,
  type CellAddress,
  type Product,
  type Warehouse,
} from "./types";

/**
 * Физическая валидация и подбор места (ТЗ, разд. 2.6 и 4).
 *
 * Проверка — ЧИСТО МАТЕМАТИЧЕСКАЯ: габариты товара против габаритов ячейки.
 * На визуализацию не влияет: план остаётся условным и пропорциональным,
 * реальные см живут только в данных.
 */

/** Допуск на погрешность деления (100/3 = 33,333…). */
const EPS = 1e-6;

/**
 * Кто занимает ячейку. Товар попадает на место двумя путями:
 *   — напрямую (назначение из таблицы) — тогда `productIds` из одного элемента;
 *   — внутри коробки приёмки, размещённой на полке — тогда в ячейке лежит
 *     коробка, а вместе с ней все её строки.
 * Оба пути обязаны считаться занятостью: иначе тепловая карта и проверка
 * конфликтов молча покажут свободным место, которое занято.
 */
export interface CellOccupant {
  /** Товары в ячейке. Для коробки — все её строки. */
  productIds: string[];
  /** Заполнено, если ячейку занимает коробка, а не отдельный товар. */
  boxId?: string;
  /** Суммарное число единиц (у прямого размещения — 1). */
  qty: number;
}

/** Индекс занятости: ключ ячейки → её содержимое. */
export type Occupancy = Record<string, CellOccupant>;

/**
 * Собрать занятость из прямых размещений и размещённых коробок.
 * Коробки не обязательны — старые вызовы (до фулфилмента) работают как прежде.
 */
export function buildOccupancy(
  placements: Record<string, CellAddress>,
  boxes: Box[] = [],
): Occupancy {
  const occ: Occupancy = {};
  for (const [productId, addr] of Object.entries(placements)) {
    occ[addressKey(addr)] = { productIds: [productId], qty: 1 };
  }
  for (const box of boxes) {
    if (!box.address || !box.lines.length) continue;
    const key = addressKey(box.address);
    const prev = occ[key];
    const productIds = [...(prev?.productIds ?? []), ...box.lines.map((l) => l.productId)];
    const qty = (prev?.qty ?? 0) + box.lines.reduce((sum, l) => sum + l.qty, 0);
    occ[key] = { productIds, boxId: box.id, qty };
  }
  return occ;
}

/** Товары в ячейке (пусто — ячейка свободна). Удобная обёртка над Occupancy. */
export function occupantsAt(occupancy: Occupancy, addr: CellAddress): string[] {
  return occupancy[addressKey(addr)]?.productIds ?? [];
}

export type FitAxis = "width" | "height" | "depth";

export interface FitResult {
  fits: boolean;
  /** Оси, по которым товар не проходит. */
  failed: FitAxis[];
}

/** Влезет ли товар в ячейку. Без переворота: Ш→Ш, В→В, Г→Г. */
export function checkFit(product: Product, cell: CellDims): FitResult {
  const failed: FitAxis[] = [];
  if (product.widthCm > cell.widthCm + EPS) failed.push("width");
  if (product.heightCm > cell.heightCm + EPS) failed.push("height");
  if (product.depthCm > cell.depthCm + EPS) failed.push("depth");
  return { fits: failed.length === 0, failed };
}

export interface CellCandidate {
  addr: CellAddress;
  /** Строковый адрес: этаж-секция-полка-ячейка. */
  address: string;
  dims: CellDims;
  /** Приоритет отбора полки: меньше — ближе к проходу (п.10.2). */
  pickPriority: number;
  /** Можно ли отбирать отсюда. false — ячейка исключена из автоподбора. */
  pickable: boolean;
}

/**
 * Все ячейки склада с габаритами и адресами.
 * Нумерация секций совпадает с formatAddress: порядковый номер среди секций этажа.
 */
export function allCells(warehouse: Warehouse): CellCandidate[] {
  const out: CellCandidate[] = [];
  warehouse.floors.forEach((floor, floorIdx) => {
    let secNo = 0;
    for (const mod of floor.modules) {
      if (mod.type !== "section") continue;
      secNo += 1;
      const shelves = mod.shelves ?? [];
      shelves.forEach((shelf, shelfIndex) => {
        const dims = cellDimsCm(mod, shelfIndex);
        if (!dims) return;
        for (let cellIndex = 0; cellIndex < shelf.cells; cellIndex++) {
          out.push({
            addr: { floorId: floor.id, moduleId: mod.id, shelfIndex, cellIndex },
            address: `${floorIdx + 1}-${secNo}-${shelfIndex + 1}-${cellIndex + 1}`,
            dims,
            pickPriority: shelf.pickPriority ?? DEFAULT_PICK_PRIORITY,
            pickable: shelf.pickable !== false,
          });
        }
      });
    }
  });
  return out;
}

/** Есть ли вообще куда размещать (ТЗ, разд. 4: «сначала создайте план склада»). */
export function hasStorage(warehouse: Warehouse): boolean {
  return warehouse.floors.some((f) =>
    f.modules.some((m) => m.type === "section" && (m.shelves?.length ?? 0) > 0),
  );
}

function volume(d: CellDims) {
  return d.widthCm * d.heightCm * d.depthCm;
}

/**
 * Лучшая из свободных подходящих ячеек. Сначала приоритет отбора (п.10.2):
 * ходовой товар должен вставать ближе к проходу, а не «куда влезло». При
 * равном приоритете — самая тесная, чтобы не занимать крупную ячейку зря.
 * Ячейки, закрытые от отбора (`pickable: false`), не рассматриваются вовсе.
 */
function bestFreeFit(
  cells: CellCandidate[],
  occupancy: Occupancy,
  product: Product,
  exclude?: string,
): CellCandidate | null {
  let best: CellCandidate | null = null;
  for (const c of cells) {
    const key = addressKey(c.addr);
    if (occupancy[key] || key === exclude) continue;
    if (!c.pickable) continue;
    if (!checkFit(product, c.dims).fits) continue;
    if (
      !best ||
      c.pickPriority < best.pickPriority ||
      (c.pickPriority === best.pickPriority && volume(c.dims) < volume(best.dims))
    ) {
      best = c;
    }
  }
  return best;
}

/**
 * Самая тесная подходящая ячейка БЕЗ учёта занятости. Нужна, чтобы отличить
 * «на складе нет ячейки такого размера» от «подходящие есть, но все заняты» —
 * это разные проблемы с разными решениями.
 */
export function tightestFittingCell(warehouse: Warehouse, product: Product): CellCandidate | null {
  let best: CellCandidate | null = null;
  for (const c of allCells(warehouse)) {
    if (!checkFit(product, c.dims).fits) continue;
    if (!best || volume(c.dims) < volume(best.dims)) best = c;
  }
  return best;
}

/**
 * Первая свободная ячейка без учёта габаритов — запасной старт для диалога,
 * когда подходящей ячейки на складе нет вообще.
 */
export function firstFreeCell(
  warehouse: Warehouse,
  occupancy: Occupancy,
  preferFloorId?: string,
): CellCandidate | null {
  const free = allCells(warehouse)
    .filter((c) => !occupancy[addressKey(c.addr)])
    // Закрытые от отбора уходят в конец, но не исчезают: это запасной старт
    // диалога, и остаться совсем без предложения хуже, чем предложить дальнюю.
    .sort((a, b) => Number(b.pickable) - Number(a.pickable));
  return free.find((c) => c.addr.floorId === preferFloorId) ?? free[0] ?? null;
}

/**
 * Предложение ячейки для товара (ТЗ, разд. 4: «предложение ячейки N»).
 * Сначала ищем на текущем этаже, потом по всему складу. null — подходящей
 * свободной ячейки нет.
 */
export function suggestCell(
  warehouse: Warehouse,
  occupancy: Occupancy,
  product: Product,
  opts?: { preferFloorId?: string; exclude?: string },
): CellCandidate | null {
  const cells = allCells(warehouse);
  if (opts?.preferFloorId) {
    const onFloor = bestFreeFit(
      cells.filter((c) => c.addr.floorId === opts.preferFloorId),
      occupancy,
      product,
      opts.exclude,
    );
    if (onFloor) return onFloor;
  }
  return bestFreeFit(cells, occupancy, product, opts?.exclude);
}
