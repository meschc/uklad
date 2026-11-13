import { useState } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

/**
 * Сортировка и поиск для любой таблицы кабинета — на TanStack Table (MIT,
 * без своей вёрстки). Экран оставляет свою разметку `<table>`, а строки
 * берёт отсюда (`rows`).
 *
 * Колонка — это id и значение для сортировки и поиска. Значение — строка или
 * число: числа сортируются как числа, пустое уходит в конец.
 */
interface DataColumn<T> {
  id: string;
  value: (row: T) => string | number | null | undefined;
  /**
   * Подпись значения в фильтре колонки. Есть — колонку можно отфильтровать по
   * значению (`TableFilters`): роль, статус, вид услуги. Без неё — только
   * сортировка и поиск.
   */
  facet?: (value: string) => string;
}

export interface TableFacet {
  id: string;
  /** Варианты фильтра: значение и подпись, по алфавиту подписи. */
  options: { value: string; label: string }[];
}

export function useDataTable<T>(
  data: T[],
  columns: DataColumn<T>[],
  initial?: SortingState,
): {
  table: Table<T>;
  rows: T[];
  query: string;
  setQuery: (q: string) => void;
  facets: TableFacet[];
  filters: Record<string, string>;
  setFilter: (id: string, value: string) => void;
} {
  const [sorting, setSorting] = useState<SortingState>(initial ?? []);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const setFilter = (id: string, value: string) =>
    setFilters((f) => {
      const next = { ...f };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  const table = useReactTable({
    data,
    columns: columns.map((c) => ({
      id: c.id,
      accessorFn: (row: T) => c.value(row) ?? undefined,
      sortUndefined: "last" as const,
      filterFn: (row: { getValue: (id: string) => unknown }, id: string, v: string) =>
        String(row.getValue(id) ?? "") === v,
    })),
    state: {
      sorting,
      globalFilter: query,
      columnFilters: Object.entries(filters).map(([id, value]) => ({ id, value })),
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    globalFilterFn: (row, _id, q: string) => {
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      return columns.some((c) =>
        String(c.value(row.original) ?? "")
          .toLowerCase()
          .includes(needle),
      );
    },
    // Страниц у наших таблиц нет. Без этого флага TanStack на каждый новый
    // массив `data` (экраны собирают его фильтром при каждом рендере)
    // сбрасывает номер страницы через setState — и экран перерисовывается
    // бесконечно: так «Этикетка отправления» в «Заданиях» вешала вкладку.
    autoResetPageIndex: false,
    autoResetExpanded: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const facets: TableFacet[] = columns
    .filter((c) => c.facet)
    .map((c) => {
      const seen = new Set<string>();
      for (const row of data) {
        const v = c.value(row);
        if (v != null && v !== "") seen.add(String(v));
      }
      return {
        id: c.id,
        options: [...seen]
          .map((value) => ({ value, label: c.facet!(value) }))
          .sort((a, b) => a.label.localeCompare(b.label, "ru")),
      };
    })
    // Фильтр из одного варианта ничего не отбирает — не показываем.
    .filter((f) => f.options.length > 1);
  return {
    table,
    rows: table.getRowModel().rows.map((r) => r.original),
    query,
    setQuery,
    facets,
    filters,
    setFilter,
  };
}

/**
 * Фильтры колонок рядом с поиском (Кирилл 12 ноя: «нет ни фильтров ничего»):
 * по выпадающему списку на колонку с `facet`. Пустое значение — «все».
 */
export function TableFilters({
  facets,
  filters,
  onChange,
  labels,
  allLabel,
}: {
  facets: TableFacet[];
  filters: Record<string, string>;
  onChange: (id: string, value: string) => void;
  /** Подпись колонки для «Все …» и для скринридера. */
  labels: Record<string, string>;
  allLabel: (column: string) => string;
}) {
  if (facets.length === 0) return null;
  return (
    <>
      {facets.map((f) => (
        <select
          key={f.id}
          aria-label={labels[f.id]}
          value={filters[f.id] ?? ""}
          onChange={(e) => onChange(f.id, e.target.value)}
          className={cn(
            "h-8 max-w-52 cursor-pointer rounded-md border border-input bg-background px-2 text-sm transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            filters[f.id] && "border-primary text-primary",
          )}
        >
          <option value="">{allLabel(labels[f.id] ?? f.id)}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
    </>
  );
}

/** Заголовок колонки, по нажатию сортирует: по возрастанию → по убыванию → без. */
export function SortTh<T>({
  table,
  id,
  children,
  align = "left",
  className,
}: {
  table: Table<T>;
  id: string;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const col = table.getColumn(id);
  const dir = col?.getIsSorted();
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <th
      className={cn(
        "px-3 py-2 font-medium",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
    >
      <button
        type="button"
        onClick={col?.getToggleSortingHandler()}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "flex-row-reverse",
          dir && "text-foreground",
        )}
      >
        {children}
        <Icon className={cn("size-3", !dir && "opacity-40")} />
      </button>
    </th>
  );
}

/** Поиск по всем колонкам таблицы. */
export function TableSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-xs", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8"
      />
    </div>
  );
}
