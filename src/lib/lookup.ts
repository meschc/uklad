import { addressKey, cellDimsCm, parseAddress, type CellDims } from "./address";
import { BOX_PREFIX, PALLET_PREFIX, findByCode, findProduct, normalizeCode } from "./barcode";
import type { Box, CellAddress, Pallet, Product, Warehouse } from "./types";

/**
 * «Что это такое?» — разбор любого кода склада в объект базы (п.4).
 *
 * Один сканер — один вопрос: кладовщик стреляет в штрихкод и хочет знать, что
 * перед ним. Код может быть чем угодно — EAN-13 товара, ярлыком тары или
 * паллеты, ярлыком ячейки, — поэтому разбор идёт от самого однозначного к
 * самому свободному: внутренние префиксы → товар → адрес ячейки.
 *
 * Функции чистые: на входе данные, на выходе разобранный результат. Экран
 * только рисует то, что здесь посчитано.
 */

/** Где и сколько единиц товара лежит — одна строка «места хранения». */
export interface LookupPlace {
  addr: CellAddress;
  /** Отформатированный адрес; null — ячейка больше не существует на плане. */
  label: string | null;
  qty: number;
  /** Заполнено, если товар лежит в таре, а не размещён напрямую. */
  boxBarcode?: string;
}

/** Строка содержимого тары/ячейки: товар и его количество. */
export interface LookupLine {
  product: Product;
  qty: number;
  /** Ярлык тары, если товар лежит в ней. */
  boxBarcode?: string;
}

export type LookupResult =
  | {
      kind: "product";
      product: Product;
      total: number;
      places: LookupPlace[];
    }
  | {
      kind: "box";
      box: Box;
      pallet: Pallet | null;
      /** null при `placed: true` — адрес есть, но такой ячейки на плане уже нет. */
      label: string | null;
      placed: boolean;
      lines: LookupLine[];
      total: number;
    }
  | {
      kind: "pallet";
      pallet: Pallet;
      label: string | null;
      placed: boolean;
      boxes: { box: Box; label: string | null; placed: boolean; total: number }[];
      total: number;
    }
  | {
      kind: "cell";
      addr: CellAddress;
      label: string | null;
      dims: CellDims | null;
      lines: LookupLine[];
      total: number;
    }
  | { kind: "none"; code: string };

interface LookupData {
  warehouse: Warehouse;
  products: Product[];
  boxes: Box[];
  pallets: Pallet[];
  placements: Record<string, CellAddress>;
  /** Форматирование адреса вынесено наружу: настройки адресации живут в сторе. */
  format: (addr: CellAddress) => string | null;
}

/** Сколько единиц всего в таре. */
function boxTotal(box: Box): number {
  return box.lines.reduce((sum, l) => sum + l.qty, 0);
}

/** Строки содержимого тары с подставленными карточками товаров. */
function linesOf(box: Box, products: Product[]): LookupLine[] {
  const out: LookupLine[] = [];
  for (const l of box.lines) {
    const product = products.find((p) => p.id === l.productId);
    if (product) out.push({ product, qty: l.qty, boxBarcode: box.barcode });
  }
  return out;
}

/** Все места хранения одного товара: прямое размещение и тара. */
function placesOf(product: Product, data: LookupData): LookupPlace[] {
  const places: LookupPlace[] = [];
  const direct = data.placements[product.id];
  if (direct) {
    places.push({ addr: direct, label: data.format(direct), qty: 1 });
  }
  for (const box of data.boxes) {
    if (!box.address) continue;
    for (const line of box.lines) {
      if (line.productId !== product.id || line.qty <= 0) continue;
      places.push({
        addr: box.address,
        label: data.format(box.address),
        qty: line.qty,
        boxBarcode: box.barcode,
      });
    }
  }
  return places;
}

/** Что лежит в конкретной ячейке: прямые размещения плюс содержимое тары. */
function linesAt(addr: CellAddress, data: LookupData): LookupLine[] {
  const key = addressKey(addr);
  const lines: LookupLine[] = [];
  for (const [productId, a] of Object.entries(data.placements)) {
    if (addressKey(a) !== key) continue;
    const product = data.products.find((p) => p.id === productId);
    if (product) lines.push({ product, qty: 1 });
  }
  for (const box of data.boxes) {
    if (!box.address || addressKey(box.address) !== key) continue;
    lines.push(...linesOf(box, data.products));
  }
  return lines;
}

const sum = (lines: LookupLine[]) => lines.reduce((s, l) => s + l.qty, 0);

/** Габариты ячейки по адресу — нужен модуль, а не только адрес. */
function dimsAt(addr: CellAddress, warehouse: Warehouse): CellDims | null {
  const floor = warehouse.floors.find((f) => f.id === addr.floorId);
  const mod = floor?.modules.find((m) => m.id === addr.moduleId);
  return mod ? cellDimsCm(mod, addr.shelfIndex) : null;
}

export function lookup(raw: string, data: LookupData): LookupResult {
  const code = normalizeCode(raw);
  if (!code) return { kind: "none", code: raw.trim() };

  // 1) Внутренние ярлыки — по префиксу: их формат придуман нами и однозначен.
  if (code.startsWith(BOX_PREFIX)) {
    const box = findByCode(data.boxes, code);
    if (!box) return { kind: "none", code };
    const lines = linesOf(box, data.products);
    return {
      kind: "box",
      box,
      pallet: data.pallets.find((p) => p.id === box.palletId) ?? null,
      label: box.address ? data.format(box.address) : null,
      placed: !!box.address,
      lines,
      total: sum(lines),
    };
  }

  if (code.startsWith(PALLET_PREFIX)) {
    const pallet = findByCode(data.pallets, code);
    if (!pallet) return { kind: "none", code };
    const boxes = data.boxes
      .filter((b) => b.palletId === pallet.id)
      .map((box) => ({
        box,
        label: box.address ? data.format(box.address) : null,
        placed: !!box.address,
        total: boxTotal(box),
      }));
    return {
      kind: "pallet",
      pallet,
      label: pallet.address ? data.format(pallet.address) : null,
      placed: !!pallet.address,
      boxes,
      total: boxes.reduce((s, b) => s + b.total, 0),
    };
  }

  // 2) Товар — по штрихкоду или артикулу: с поля сканера приходит штрихкод, с
  //    клавиатуры чаще набирают артикул.
  const product = findProduct(data.products, code);
  if (product) {
    const places = placesOf(product, data);
    return {
      kind: "product",
      product,
      total: places.reduce((s, p) => s + p.qty, 0),
      places,
    };
  }

  // 3) Ярлык ячейки — это её адрес в том же виде, что в интерфейсе.
  const addr = parseAddress(data.warehouse, raw);
  if (addr) {
    const lines = linesAt(addr, data);
    return {
      kind: "cell",
      addr,
      label: data.format(addr),
      dims: dimsAt(addr, data.warehouse),
      lines,
      total: sum(lines),
    };
  }

  return { kind: "none", code };
}
