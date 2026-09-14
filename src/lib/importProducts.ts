import { readSheetMatrix } from "./sheets";
import { PRODUCT_CATEGORIES, type Product, type ProductCategory } from "./types";
import { BOM } from "./utils";
import type { MsgKey } from "./i18n";

/**
 * Импорт товаров (ТЗ, разд. 2.5: «импорт Excel/1С»).
 *
 * Читаем настоящие книги .xlsx через SheetJS, плюс CSV/TSV как вторичный путь
 * (вставка текстом / выгрузка 1С). Оба входа сводятся к матрице `string[][]`,
 * которую валидирует общее ядро `parseRows`. Здесь живут два алерта (ТЗ, разд. 4):
 *   — ошибка формата файла;
 *   — несовпадение колонок.
 *
 * Саму книгу читает `lib/sheets`: SheetJS грузится по требованию, поэтому разбор
 * файла асинхронный, а разбор текста — нет.
 */

type FieldKey =
  "sku" | "barcode" | "name" | "category" | "widthCm" | "heightCm" | "depthCm" | "weightKg";

/** Синонимы заголовков колонок (в нормализованном виде). */
const FIELD_SYNONYMS: Record<FieldKey, string[]> = {
  sku: ["артикул", "sku", "код", "код товара"],
  barcode: ["штрихкод", "barcode", "ean", "шк"],
  name: ["название", "наименование", "name", "товар", "имя"],
  category: ["категория", "category", "группа"],
  widthCm: ["ширина", "ш", "width", "w"],
  heightCm: ["высота", "в", "height", "h"],
  depthCm: ["глубина", "г", "depth", "d"],
  weightKg: ["вес", "масса", "weight"],
};

const REQUIRED: FieldKey[] = ["sku", "name", "category", "widthCm", "heightCm", "depthCm"];

/** Ошибка строки: ключ i18n + подстановки (перевод — в UI). */
export interface RowError {
  key: MsgKey;
  vars?: Record<string, string | number>;
}

/** Готовая к предпросмотру строка: разобранные поля + список ошибок. */
export interface ImportRow {
  index: number; // номер строки данных, с 1
  sku: string;
  barcode: string;
  name: string;
  category?: ProductCategory;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  weightKg?: number;
  errors: RowError[];
  /** Валидна и не дубль — годна к импорту. */
  ok: boolean;
}

export type ParseResult =
  | { ok: false; kind: "empty" }
  | { ok: false; kind: "format"; reasonKey: MsgKey }
  | {
      ok: false;
      kind: "columns";
      /** Ключи недостающих обязательных полей (перевод — в UI). */
      missing: FieldKey[];
      headers: string[];
    }
  | {
      ok: true;
      headers: string[];
      rows: ImportRow[];
      validCount: number;
    };

function norm(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/["']/g, "")
    .replace(/[\s,;]*(?:см|мм|cm|mm|кг|kg)\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchField(header: string): FieldKey | null {
  const n = norm(header);
  for (const key of Object.keys(FIELD_SYNONYMS) as FieldKey[]) {
    if (FIELD_SYNONYMS[key].includes(n)) return key;
  }
  return null;
}

function detectDelim(header: string): string | null {
  const cands = ["\t", ";", ","];
  let best: string | null = null;
  let bestN = 0;
  for (const d of cands) {
    const n = header.split(d).length - 1;
    if (n > bestN) {
      bestN = n;
      best = d;
    }
  }
  return bestN > 0 ? best : null;
}

/**
 * Разбор строки CSV. Кавычка — спецсимвол только в начале поля (как в Excel);
 * кавычка в середине значения (напр. `Планшет 11"`) — обычный символ.
 */
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"' && atStart) {
      quoted = true;
      atStart = false;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
      atStart = true;
    } else {
      cur += ch;
      atStart = false;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function num(s: string): number {
  // Дефис стоит последним в наборе и потому означает сам себя — экранировать
  // его там не нужно.
  const v = parseFloat(s.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(v) ? v : NaN;
}

function matchCategory(s: string): ProductCategory | null {
  const n = s.trim().toLowerCase();
  return PRODUCT_CATEGORIES.find((c) => c.toLowerCase() === n) ?? null;
}

/** Похоже ли на бинарный/не-текстовый ввод (вставленный .xlsx и т.п.). */
function looksBinary(s: string): boolean {
  if (s.startsWith("PK")) return true; // zip-сигнатура .xlsx
  const probe = s.slice(0, 4000);
  for (let i = 0; i < probe.length; i++) {
    const c = probe.charCodeAt(i);
    // управляющие символы, кроме таб/CR/LF
    if (c < 9 || (c > 13 && c < 32)) return true;
  }
  return false;
}

/** CSV/TSV-текст (вставка / выгрузка 1С) → матрица → общее ядро. */
export function parseImportText(text: string, existingSkus: Set<string>): ParseResult {
  // Выгрузка из 1С и Excel начинается с BOM — срезаем, иначе первая колонка
  // заголовка не совпадёт ни с одним ожидаемым именем.
  const clean = (text.startsWith(BOM) ? text.slice(BOM.length) : text).trim();
  if (!clean) return { ok: false, kind: "empty" };

  if (looksBinary(clean)) {
    return { ok: false, kind: "format", reasonKey: "import.msg.binary" };
  }

  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { ok: false, kind: "format", reasonKey: "import.msg.needTwoLines" };
  }

  const delim = detectDelim(lines[0]);
  if (!delim) {
    return { ok: false, kind: "format", reasonKey: "import.msg.noDelimiter" };
  }

  const matrix = lines.map((l) => splitLine(l, delim));
  return parseRows(matrix, existingSkus);
}

/** Бинарная книга .xlsx/.xls через SheetJS → матрица → общее ядро. */
export async function parseImportFile(
  buf: ArrayBuffer,
  existingSkus: Set<string>,
): Promise<ParseResult> {
  let matrix: string[][] | null;
  try {
    matrix = await readSheetMatrix(buf);
  } catch {
    // Сюда попадают и битый файл, и недоступная библиотека. Разделять их в
    // сообщении не за чем: обе беды человек чинит одним и тем же — повторить
    // или выгрузить CSV, а второй путь работает и без SheetJS.
    return { ok: false, kind: "format", reasonKey: "import.msg.unreadable" };
  }
  if (!matrix) {
    return { ok: false, kind: "format", reasonKey: "import.msg.noSheet" };
  }

  if (matrix.length < 2) {
    return { ok: false, kind: "format", reasonKey: "import.msg.needTwoLines" };
  }
  return parseRows(matrix, existingSkus);
}

/** Ядро: матрица (заголовок + строки) → маппинг колонок + валидация строк. */
function parseRows(matrix: string[][], existingSkus: Set<string>): ParseResult {
  const headers = (matrix[0] ?? []).map((h) => (h ?? "").trim());
  const colField = headers.map(matchField);
  const present = new Set(colField.filter((f): f is FieldKey => f !== null));

  const missing = REQUIRED.filter((f) => !present.has(f));
  if (missing.length) {
    return { ok: false, kind: "columns", missing, headers };
  }

  const seen = new Set<string>();
  const rows: ImportRow[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (!cells || cells.every((c) => (c ?? "").trim() === "")) continue;
    const get = (field: FieldKey): string => {
      const i = colField.indexOf(field);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };

    const errors: RowError[] = [];
    const sku = get("sku");
    const name = get("name");
    const categoryRaw = get("category");
    const category = matchCategory(categoryRaw);
    const widthCm = num(get("widthCm"));
    const heightCm = num(get("heightCm"));
    const depthCm = num(get("depthCm"));
    const weightRaw = get("weightKg");
    const weightKg = weightRaw ? num(weightRaw) : undefined;

    if (!sku) errors.push({ key: "import.row.noSku" });
    else if (existingSkus.has(sku) || seen.has(sku)) errors.push({ key: "import.row.dupSku" });
    if (!name) errors.push({ key: "import.row.noName" });
    if (!category)
      errors.push(
        categoryRaw
          ? { key: "import.row.badCategory", vars: { cat: categoryRaw } }
          : { key: "import.row.noCategory" },
      );
    for (const [key, v] of [
      ["import.row.badWidth", widthCm],
      ["import.row.badHeight", heightCm],
      ["import.row.badDepth", depthCm],
    ] as const) {
      if (!Number.isFinite(v) || v <= 0) errors.push({ key });
    }
    if (weightRaw && (!Number.isFinite(weightKg!) || weightKg! < 0))
      errors.push({ key: "import.row.badWeight" });

    if (sku) seen.add(sku);

    rows.push({
      index: r,
      sku,
      barcode: get("barcode"),
      name,
      category: category ?? undefined,
      widthCm: Number.isFinite(widthCm) ? widthCm : undefined,
      heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
      depthCm: Number.isFinite(depthCm) ? depthCm : undefined,
      weightKg: weightKg != null && Number.isFinite(weightKg) ? weightKg : undefined,
      errors,
      ok: errors.length === 0,
    });
  }

  if (!rows.length) {
    return { ok: false, kind: "format", reasonKey: "import.msg.noRows" };
  }

  return {
    ok: true,
    headers,
    rows,
    validCount: rows.filter((r) => r.ok).length,
  };
}

/** Годные строки → черновики товаров для добавления в номенклатуру. */
export function rowsToProducts(rows: ImportRow[]): Omit<Product, "id">[] {
  return rows
    .filter((r) => r.ok && r.category)
    .map((r) => ({
      sku: r.sku,
      barcode: r.barcode,
      name: r.name,
      category: r.category!,
      widthCm: r.widthCm!,
      heightCm: r.heightCm!,
      depthCm: r.depthCm!,
      weightKg: r.weightKg,
    }));
}

/** Заголовки шаблона (для «Скачать шаблон .xlsx»). */
export const TEMPLATE_HEADERS = [
  "Артикул",
  "Штрихкод",
  "Название",
  "Категория",
  "Ширина, см",
  "Высота, см",
  "Глубина, см",
  "Вес, кг",
];

/** Строки примера (без заголовка) — для шаблона и кнопки «Вставить пример». */
export const EXAMPLE_ROWS: (string | number)[][] = [
  ["УК-7001", "4600051070012", "Кроссовки беговые", "Одежда", 30, 12, 20, 0.8],
  ["УК-7002", "4600051070029", 'Планшет 11"', "Электроника", 25.5, 17.8, 0.7, 0.5],
  ["УК-7003", "4600051070036", "Блендер погружной", "Бытовая техника", 7, 40, 7, 1.4],
  ["УК-7004", "4600051070043", "Гантели 5 кг", "Инструменты", 15, 15, 30, 5],
];

/** Пример корректной выгрузки CSV (1С-стиль: разделитель «;», запятая в дробях). */
export const IMPORT_EXAMPLE = [
  TEMPLATE_HEADERS.join(";"),
  ...EXAMPLE_ROWS.map((row) =>
    row.map((c) => (typeof c === "number" ? String(c).replace(".", ",") : c)).join(";"),
  ),
].join("\n");
