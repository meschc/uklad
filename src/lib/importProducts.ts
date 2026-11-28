import { MAX_IMPORT_ROWS } from "./importSheet";
import { PRODUCT_CATEGORIES, type CellAddress, type Product, type ProductCategory } from "./types";
import type { MsgKey } from "./i18n";

/**
 * Импорт товаров: матрица файла → какие колонки что значат → строки к
 * загрузке (ТЗ, разд. 2.5; решение Кирилла 27.11 — сопоставление колонок).
 *
 * Колонки Уклад угадывает по заголовку (`guessColumns`), а человек правит
 * сам: «эта колонка — артикул». Обязательны только артикул и название —
 * в выгрузках склада категории и габаритов обычно нет. Товар без габаритов
 * заводится «не измерен» (полей нет, а не ноль), категория из файла, которой
 * нет в списке, заводится новой. Артикул, который на складе уже есть, —
 * пропустить или обновить, по выбору.
 */

export type FieldKey =
  | "sku"
  | "barcode"
  | "name"
  | "category"
  | "widthCm"
  | "heightCm"
  | "depthCm"
  | "weightKg"
  | "qty"
  | "cell";

/** Поля в порядке списка «Эта колонка — …». */
export const IMPORT_FIELDS: readonly FieldKey[] = [
  "sku",
  "name",
  "barcode",
  "category",
  "widthCm",
  "heightCm",
  "depthCm",
  "weightKg",
];

/**
 * Начальные остатки (Кирилл 28.11): сколько лежит и где. Предлагаются только
 * тому, кто пишет работу склада (начальник, владелец), — `ImportContext.stock`.
 */
export const STOCK_FIELDS: readonly FieldKey[] = ["qty", "cell"];

const REQUIRED: readonly FieldKey[] = ["sku", "name"];

/** Синонимы заголовков колонок (в нормализованном виде). */
const FIELD_SYNONYMS: Record<FieldKey, string[]> = {
  sku: ["артикул", "sku", "код", "код товара", "артикул продавца", "offer_id", "vendor code"],
  barcode: ["штрихкод", "barcode", "ean", "шк", "баркод", "штрих-код"],
  name: ["название", "наименование", "name", "товар", "имя", "номенклатура"],
  category: ["категория", "category", "группа", "вид номенклатуры"],
  widthCm: ["ширина", "ш", "width", "w"],
  heightCm: ["высота", "в", "height", "h"],
  depthCm: ["глубина", "длина", "г", "depth", "length", "d", "l"],
  weightKg: ["вес", "масса", "weight", "вес брутто"],
  qty: ["количество", "кол-во", "остаток", "qty", "quantity", "кол во", "остаток на складе"],
  cell: ["ячейка", "адрес", "место", "cell", "location", "адрес ячейки", "место хранения"],
};

const ALL_FIELDS: readonly FieldKey[] = [...IMPORT_FIELDS, ...STOCK_FIELDS];

/** Что значит каждая колонка файла: поле Уклада или `null` — не загружать. */
export type ColumnMap = (FieldKey | null)[];

/** Ошибка строки: ключ i18n + подстановки (перевод — в UI). */
interface RowError {
  key: MsgKey;
  vars?: Record<string, string | number>;
}

/** Что импорт сделает со строкой. */
type RowAction = "create" | "update" | "skip" | "error";

/** Готовая к предпросмотру строка: разобранные поля + решение. */
export interface ImportRow {
  /** Номер строки в файле, с 1 — как в Excel. */
  line: number;
  sku: string;
  barcode: string;
  name: string;
  /** Пусто — колонки нет или ячейка пустая. */
  category: string;
  /** Категории нет в списке склада: импорт её заведёт. */
  newCategory: boolean;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  weightKg?: number;
  action: RowAction;
  errors: RowError[];
  /** Для `update` и `skip` — товар склада с тем же артикулом. */
  existingId?: string;
  /** Начальный остаток: штук и в какой ячейке (нет ячейки — тара ждёт размещения). */
  qty?: number;
  cell?: CellAddress;
  /** Адрес, как его понял Уклад (`formatAddress`), — для предпросмотра. */
  cellText?: string;
}

export type ImportMode = "skip" | "update";

export interface ImportContext {
  /** Товары этого склада: тот же артикул на соседнем складе — не дубль. */
  products: readonly Pick<Product, "id" | "sku" | "barcode">[];
  categories: readonly string[];
  mode: ImportMode;
  /**
   * Можно вводить начальные остатки. Нет — колонки количества и ячейки не
   * читаются вовсе: запись работы склада сервер такой роли не примет, и
   * отказ унёс бы с собой и карточки.
   */
  stock?: {
    /** Текст ячейки → адрес на плане и его каноническая запись; нет такой — `null`. */
    cell: (text: string) => { addr: CellAddress; text: string } | null;
    /** Сколько товара уже лежит на складе, по id товара. */
    onHand: ReadonlyMap<string, number>;
  };
}

export type BuildResult =
  | { ok: false; kind: "columns"; missing: FieldKey[] }
  | { ok: false; kind: "format"; reasonKey: MsgKey }
  | {
      ok: true;
      rows: ImportRow[];
      counts: Record<RowAction, number>;
      /** Штук начального остатка в годных строках. */
      units: number;
    };

function norm(h: string): string {
  const base = h
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/["'*]/g, "")
    .replace(/\(.*\)$/, "")
    .replace(/\s+/g, " ")
    .trim();
  // «Ширина, см», «Вес кг» → «ширина», «вес». Сама буква «г» (глубина) — не единица.
  return base.replace(/[\s,;]*(?:см|мм|cm|mm|кг|kg|г)\.?$/i, "").trim() || base;
}

/** Поле колонки и насколько уверенно: меньше — ближе к началу списка синонимов. */
function matchField(header: string): { field: FieldKey; rank: number } | null {
  const n = norm(header);
  if (!n) return null;
  for (const field of ALL_FIELDS) {
    const rank = FIELD_SYNONYMS[field].indexOf(n);
    if (rank >= 0) return { field, rank };
  }
  return null;
}

/**
 * Строка заголовка: из первых 20 та, где узналось больше всего колонок.
 * 1С сверху кладёт шапку отчёта («Остатки товаров на 01.12»), и первая
 * строка заголовком не будет. Не узналось ничего — первая строка.
 */
export function findHeaderRow(matrix: readonly string[][]): number {
  let best = 0;
  let bestN = 0;
  matrix.slice(0, 20).forEach((row, i) => {
    const n = new Set(row.map((c) => matchField(c)?.field).filter(Boolean)).size;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  });
  return best;
}

/**
 * Догадка по заголовкам; одно поле — одна колонка. Из двух подходящих берём
 * ту, что ближе к началу списка синонимов: у 1С есть и «Код», и «Артикул»,
 * артикул — это «Артикул».
 */
export function guessColumns(headers: readonly string[]): ColumnMap {
  const best = new Map<FieldKey, { i: number; rank: number }>();
  headers.forEach((h, i) => {
    const m = matchField(h);
    if (!m) return;
    const was = best.get(m.field);
    if (!was || m.rank < was.rank) best.set(m.field, { i, rank: m.rank });
  });
  const out: ColumnMap = headers.map(() => null);
  for (const [field, { i }] of best) out[i] = field;
  return out;
}

/**
 * Число из ячейки: «2,5», «10 см», «1 200». Пусто — `undefined`, мусор — NaN.
 * Дефис стоит последним в наборе и потому означает сам себя.
 */
function num(s: string): number | undefined {
  if (!s) return undefined;
  const clean = s
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const v = parseFloat(clean);
  return Number.isFinite(v) ? v : NaN;
}

/** Штрихкод для сверки: «4600 0510 70012» и «4600051070012» — один код. */
function barcodeKey(s: string): string {
  return s.replace(/\s+/g, "");
}

const DIMS = [
  ["widthCm", "import.row.badWidth"],
  ["heightCm", "import.row.badHeight"],
  ["depthCm", "import.row.badDepth"],
] as const;

/** Количество и ячейка строки; ошибки — в `errors`. */
function readStock(
  qtyRaw: string,
  cellRaw: string,
  stock: NonNullable<ImportContext["stock"]>,
  errors: RowError[],
): Pick<ImportRow, "qty" | "cell" | "cellText"> {
  const qty = num(qtyRaw);
  if (qty === undefined || qty === 0) {
    // Ноль в выгрузке остатков — «нет на складе», а не ошибка.
    if (cellRaw && qty === undefined) errors.push({ key: "import.row.cellNoQty" });
    return {};
  }
  if (!Number.isInteger(qty) || qty < 0) {
    errors.push({ key: "import.row.badQty" });
    return {};
  }
  if (!cellRaw) return { qty };
  const cell = stock.cell(cellRaw);
  if (!cell) {
    errors.push({ key: "import.row.badCell", vars: { cell: cellRaw } });
    return {};
  }
  return { qty, cell: cell.addr, cellText: cell.text };
}

/** Строки файла (после заголовка) → решения по каждой. */
export function buildRows(
  matrix: readonly string[][],
  headerRow: number,
  columns: ColumnMap,
  ctx: ImportContext,
): BuildResult {
  const present = new Set(columns.filter((f): f is FieldKey => f !== null));
  const missing = REQUIRED.filter((f) => !present.has(f));
  if (missing.length) return { ok: false, kind: "columns", missing };

  const body = matrix.slice(headerRow + 1);
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, kind: "format", reasonKey: "import.msg.tooMany" };
  }

  const bySku = new Map(ctx.products.map((p) => [p.sku, p]));
  const byBarcode = new Map(
    ctx.products.filter((p) => p.barcode).map((p) => [barcodeKey(p.barcode), p.sku]),
  );
  const categories = new Map(ctx.categories.map((c) => [c.trim().toLowerCase(), c]));
  const seenSku = new Set<string>();
  const seenBarcode = new Set<string>();
  const rows: ImportRow[] = [];
  const at = new Map(columns.map((f, i) => [f, i]));

  body.forEach((cells, r) => {
    const get = (f: FieldKey): string => {
      const i = at.get(f);
      return i == null ? "" : (cells[i] ?? "").trim();
    };
    const errors: RowError[] = [];
    const sku = get("sku");
    const name = get("name");
    const existing = sku ? bySku.get(sku) : undefined;

    if (!sku) errors.push({ key: "import.row.noSku" });
    else if (seenSku.has(sku)) errors.push({ key: "import.row.dupInFile" });
    if (!name && !existing) errors.push({ key: "import.row.noName" });

    const barcode = get("barcode");
    const bc = barcodeKey(barcode);
    const owner = bc ? byBarcode.get(bc) : undefined;
    if (bc && (seenBarcode.has(bc) || (owner !== undefined && owner !== sku))) {
      errors.push({ key: "import.row.dupBarcode" });
    }

    const rawCategory = get("category");
    const known = categories.get(rawCategory.toLowerCase());
    const category = known ?? rawCategory;

    const dims: Partial<Record<"widthCm" | "heightCm" | "depthCm", number>> = {};
    let given = 0;
    for (const [f, key] of DIMS) {
      const v = num(get(f));
      if (v === undefined) continue;
      given += 1;
      if (Number.isFinite(v) && v > 0) dims[f] = v;
      else errors.push({ key });
    }
    // Один-два габарита из трёх — не «не измерен» и не измерен: ячейку по
    // ним не проверишь, а молча выкинуть указанное — хуже, чем спросить.
    if (given > 0 && given < 3 && !errors.some((e) => e.key.startsWith("import.row.bad"))) {
      errors.push({ key: "import.row.partialDims" });
    }
    const weightKg = num(get("weightKg"));
    if (weightKg !== undefined && (!Number.isFinite(weightKg) || weightKg < 0)) {
      errors.push({ key: "import.row.badWeight" });
    }

    const stock = ctx.stock ? readStock(get("qty"), get("cell"), ctx.stock, errors) : {};
    if (stock.qty && existing && (ctx.stock?.onHand.get(existing.id) ?? 0) > 0) {
      // Повтор того же файла не удваивает остаток: что уже лежит — правит
      // инвентаризация, а не второй ввод.
      errors.push({ key: "import.row.hasStock" });
    }

    if (sku) seenSku.add(sku);
    if (bc) seenBarcode.add(bc);

    const action: RowAction = errors.length
      ? "error"
      : !existing
        ? "create"
        : ctx.mode === "update"
          ? "update"
          : "skip";
    rows.push({
      line: headerRow + r + 2,
      sku,
      barcode,
      name,
      category,
      newCategory: !!rawCategory && !known,
      ...(given === 3 ? dims : {}),
      weightKg: weightKg !== undefined && Number.isFinite(weightKg) ? weightKg : undefined,
      action,
      errors,
      existingId: existing?.id,
      ...stock,
    });
  });

  if (!rows.length) return { ok: false, kind: "format", reasonKey: "import.msg.noRows" };
  const counts: Record<RowAction, number> = { create: 0, update: 0, skip: 0, error: 0 };
  let units = 0;
  for (const r of rows) {
    counts[r.action] += 1;
    if (r.action !== "error") units += r.qty ?? 0;
  }
  return { ok: true, rows, counts, units };
}

export interface ImportPlan {
  create: Omit<Product, "id">[];
  /** Только поля из непустых ячеек: пустая ячейка файла ничего не стирает. */
  update: { id: string; patch: Partial<Omit<Product, "id">> }[];
  /** Новые категории — в список склада до товаров. */
  categories: string[];
  /** Начальные остатки по артикулу: товар может завестись этой же загрузкой. */
  opening: OpeningLine[];
}

export interface OpeningLine {
  sku: string;
  qty: number;
  cell?: CellAddress;
}

/** Решения по строкам → что завести, что поправить и какие категории добавить. */
export function importPlan(rows: readonly ImportRow[], partnerId?: string): ImportPlan {
  const plan: ImportPlan = { create: [], update: [], categories: [], opening: [] };
  const fresh = new Set<string>();
  for (const r of rows) {
    if (r.action !== "error" && r.qty) {
      plan.opening.push({ sku: r.sku, qty: r.qty, ...(r.cell ? { cell: r.cell } : {}) });
    }
    if (r.action !== "create" && r.action !== "update") continue;
    if (r.newCategory && !fresh.has(r.category.toLowerCase())) {
      fresh.add(r.category.toLowerCase());
      plan.categories.push(r.category);
    }
    const dims =
      r.widthCm !== undefined
        ? { widthCm: r.widthCm, heightCm: r.heightCm, depthCm: r.depthCm }
        : {};
    if (r.action === "create") {
      plan.create.push({
        sku: r.sku,
        barcode: r.barcode,
        name: r.name,
        category: r.category,
        ...dims,
        ...(r.weightKg !== undefined ? { weightKg: r.weightKg } : {}),
        ...(partnerId ? { partnerId } : {}),
      });
      continue;
    }
    const patch: Partial<Omit<Product, "id">> = { ...dims };
    if (r.name) patch.name = r.name;
    if (r.barcode) patch.barcode = r.barcode;
    if (r.category) patch.category = r.category;
    if (r.weightKg !== undefined) patch.weightKg = r.weightKg;
    if (partnerId) patch.partnerId = partnerId;
    if (Object.keys(patch).length) plan.update.push({ id: r.existingId!, patch });
  }
  return plan;
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

const [CLOTHES, ELECTRONICS, APPLIANCES, TOOLS] = [0, 1, 2, 4].map(
  (i) => PRODUCT_CATEGORIES[i] as ProductCategory,
);

/** Строки примера (без заголовка) — для шаблона и кнопки «Вставить пример». */
export const EXAMPLE_ROWS: (string | number)[][] = [
  ["УК-7001", "4600051070012", "Кроссовки беговые", CLOTHES, 30, 12, 20, 0.8],
  ["УК-7002", "4600051070029", 'Планшет 11"', ELECTRONICS, 25.5, 17.8, 0.7, 0.5],
  ["УК-7003", "4600051070036", "Блендер погружной", APPLIANCES, 7, 40, 7, 1.4],
  ["УК-7004", "4600051070043", "Гантели 5 кг", TOOLS, "", "", "", 5],
];

/** Пример корректной выгрузки CSV (1С-стиль: разделитель «;», запятая в дробях). */
export const IMPORT_EXAMPLE = [
  TEMPLATE_HEADERS.join(";"),
  ...EXAMPLE_ROWS.map((row) =>
    row.map((c) => (typeof c === "number" ? String(c).replace(".", ",") : c)).join(";"),
  ),
].join("\n");
