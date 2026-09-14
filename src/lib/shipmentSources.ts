import type { Product, ShipmentSource } from "./types";
import type { MsgKey } from "./i18n";

/**
 * Источники ожидаемых поставок — тонкие адаптеры к ОДНОМУ контракту.
 *
 * На входе — матрица строк из файла/вставки в формате конкретной системы,
 * на выходе всегда один и тот же список строк поставки. Тогда реальная
 * интеграция с 1С/МойСклад/ГИС МТ — это новый адаптер, а не переделка
 * экрана приёмки. «manual» — универсальный шаблон для поставщика вообще без
 * системы учёта: артикул, название, количество.
 */

export interface ShipmentSourceSpec {
  id: ShipmentSource;
  /** Ключ i18n названия источника. */
  titleKey: MsgKey;
  /** Ключ i18n подсказки: что за файл сюда класть. */
  hintKey: MsgKey;
  /** Синонимы заголовков колонок (в нормализованном виде). */
  columns: {
    /** Чем опознаём товар: артикул и/или штрихкод. */
    code: string[];
    qty: string[];
  };
}

export const SHIPMENT_SOURCES: ShipmentSourceSpec[] = [
  {
    id: "manual",
    titleKey: "ship.src.manual",
    hintKey: "ship.src.manual.hint",
    columns: {
      code: ["артикул", "sku", "код", "код товара", "штрихкод", "barcode"],
      qty: ["количество", "кол-во", "qty", "quantity", "штук"],
    },
  },
  {
    id: "1c",
    titleKey: "ship.src.1c",
    hintKey: "ship.src.1c.hint",
    columns: {
      code: ["артикул", "код", "номенклатура.артикул", "sku"],
      qty: ["количество", "кол-во", "колво"],
    },
  },
  {
    id: "moysklad",
    titleKey: "ship.src.moysklad",
    hintKey: "ship.src.moysklad.hint",
    columns: {
      code: ["артикул", "код", "article", "sku", "штрихкод"],
      qty: ["количество", "кол-во", "quantity", "qty"],
    },
  },
  {
    id: "honest-sign",
    titleKey: "ship.src.honestSign",
    hintKey: "ship.src.honestSign.hint",
    columns: {
      code: ["gtin", "штрихкод", "код маркировки", "barcode", "артикул"],
      qty: ["количество", "кол-во", "qty"],
    },
  },
];

function shipmentSourceSpec(id: ShipmentSource): ShipmentSourceSpec {
  return SHIPMENT_SOURCES.find((s) => s.id === id) ?? SHIPMENT_SOURCES[0];
}

/** Одна разобранная строка поставки. */
export interface ShipmentRow {
  index: number;
  code: string;
  qty: number;
  /** Найден в номенклатуре — тогда строка годна к приёмке со сверкой. */
  productId?: string;
  productName?: string;
  errorKey?: MsgKey;
}

export type ShipmentParseResult =
  { ok: false; errorKey: MsgKey } | { ok: true; rows: ShipmentRow[]; validCount: number };

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
}

function toQty(raw: string): number {
  // Дефис последним в наборе — литерал, экранирования не требует.
  const v = parseFloat(raw.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? Math.round(v) : NaN;
}

/**
 * Матрица (заголовок + строки) → строки поставки. Товар ищем по артикулу, а
 * если не нашли — по штрихкоду: разные системы выгружают разное, а сверять
 * приёмку надо по одной и той же номенклатуре.
 */
export function parseShipmentRows(
  source: ShipmentSource,
  matrix: string[][],
  products: Product[],
): ShipmentParseResult {
  if (matrix.length < 2) return { ok: false, errorKey: "ship.err.needTwoLines" };

  const spec = shipmentSourceSpec(source);
  const headers = (matrix[0] ?? []).map((h) => norm(h ?? ""));
  const codeCol = headers.findIndex((h) => spec.columns.code.includes(h));
  const qtyCol = headers.findIndex((h) => spec.columns.qty.includes(h));
  if (codeCol < 0 || qtyCol < 0) {
    return { ok: false, errorKey: "ship.err.columns" };
  }

  const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const byBarcode = new Map(products.map((p) => [p.barcode, p]));

  const rows: ShipmentRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (!cells || cells.every((c) => (c ?? "").trim() === "")) continue;
    const code = (cells[codeCol] ?? "").trim();
    const qty = toQty(cells[qtyCol] ?? "");
    const product = bySku.get(code.toLowerCase()) ?? byBarcode.get(code);

    let errorKey: MsgKey | undefined;
    if (!code) errorKey = "ship.row.noCode";
    else if (!Number.isFinite(qty) || qty <= 0) errorKey = "ship.row.badQty";
    else if (!product) errorKey = "ship.row.unknown";

    rows.push({
      index: r,
      code,
      qty: Number.isFinite(qty) ? qty : 0,
      productId: product?.id,
      productName: product?.name,
      errorKey,
    });
  }

  if (!rows.length) return { ok: false, errorKey: "ship.err.noRows" };
  return { ok: true, rows, validCount: rows.filter((r) => !r.errorKey).length };
}

/** Заголовки универсального шаблона поставки (кнопка «Скачать шаблон»). */
export const SHIPMENT_TEMPLATE_HEADERS = ["Артикул", "Название", "Количество"];

/** Пример строк шаблона — чтобы поставщик увидел ожидаемый формат. */
export const SHIPMENT_TEMPLATE_EXAMPLE: (string | number)[][] = [
  ["УК-1001", "Футболка базовая XS", 24],
  ["УК-2001", "Наушники вкладыши", 12],
  ["УК-3001", "Чайник электрический", 6],
];
