import { useState } from "react";

/**
 * Столбцы таблицы товаров, которые можно переставлять. Отметка строки слева и
 * кнопки справа стоят на месте: это не данные, а управление строкой.
 */
export type ColId =
  | "photo"
  | "sku"
  | "name"
  | "barcode"
  | "category"
  | "partner"
  | "dims"
  | "weight"
  | "qty"
  | "place";

const DEFAULT_COLS: ColId[] = [
  "photo",
  "sku",
  "name",
  "barcode",
  "category",
  "partner",
  "dims",
  "weight",
  "qty",
  "place",
];

/** Порядок — удобство одного человека, поэтому в localStorage, а не в сторе. */
const KEY = "uklad-table-cols";

/** Сохранённый порядок — подсказка: новые столбцы встают в конец, пропавшие отбрасываются. */
function readCols(raw: string | null): ColId[] {
  try {
    const saved = (JSON.parse(raw ?? "[]") as unknown[]).filter((c): c is ColId =>
      DEFAULT_COLS.includes(c as ColId),
    );
    return [...new Set([...saved, ...DEFAULT_COLS])];
  } catch {
    return DEFAULT_COLS;
  }
}

/** Переставить столбец `from` на место `to`. */
function moveCol(cols: ColId[], from: ColId, to: ColId): ColId[] {
  if (from === to) return cols;
  const next = cols.filter((c) => c !== from);
  next.splice(next.indexOf(to) + (cols.indexOf(from) < cols.indexOf(to) ? 1 : 0), 0, from);
  return next;
}

export function useColumnOrder() {
  const [cols, setCols] = useState<ColId[]>(() => {
    try {
      return readCols(localStorage.getItem(KEY));
    } catch {
      return DEFAULT_COLS;
    }
  });
  const move = (from: ColId, to: ColId) => {
    const next = moveCol(cols, from, to);
    setCols(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Приватный режим: порядок продержится до перезагрузки.
    }
  };
  return { cols, move };
}
