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
}

export function useDataTable<T>(
  data: T[],
  columns: DataColumn<T>[],
  initial?: SortingState,
): { table: Table<T>; rows: T[]; query: string; setQuery: (q: string) => void } {
  const [sorting, setSorting] = useState<SortingState>(initial ?? []);
  const [query, setQuery] = useState("");
  const table = useReactTable({
    data,
    columns: columns.map((c) => ({
      id: c.id,
      accessorFn: (row: T) => c.value(row) ?? undefined,
      sortUndefined: "last" as const,
    })),
    state: { sorting, globalFilter: query },
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
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  return { table, rows: table.getRowModel().rows.map((r) => r.original), query, setQuery };
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
