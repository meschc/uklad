import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TABLE_HEAD, TABLE_HEAD_ROW, TABLE_ROW, TableScroll } from "./table-scroll";

/**
 * Таблица кабинета — один компонент на все экраны (Кирилл 27.11: «все
 * таблицы один элемент имеют, разные конфигурации»). Экран не пишет своего
 * `<table>`: линтер его ловит. Вид у всех один — без рамки и скругления,
 * шапка мелким серым, линия под строкой; на телефоне строки стопкой карточек
 * (`.table-stack` в index.css).
 *
 * Конфигурации:
 * - `size` — `md` (экран) или `sm` (таблица внутри панели: импорт, поставка);
 * - `fill` — на всю ширину колонки (по умолчанию — по содержимому, но не уже
 *   колонки экрана, см. `.table-bleed`);
 * - `inset` — таблица в своей рамке со своей прокруткой (товары): первая
 *   колонка сохраняет отступ;
 * - `scroll={false}` — без своей горизонтальной прокрутки (панель уже
 *   прокручивается сама).
 *
 * Ширина колонки: `Td`/`Th` с `max` ограничивают текст и переносят его по
 * словам (журнал, «С чем»), `nowrap` держит число или время в одну строку.
 */
type Size = "md" | "sm";

const SizeCtx = createContext<Size>("md");

const CELL: Record<Size, string> = { md: "px-3 py-2", sm: "px-2 py-1.5" };

/** Ограничения ширины ячейки: длинный текст переносится, а не растягивает таблицу. */
const MAX = { sm: "max-w-40", md: "max-w-64", lg: "max-w-96" } as const;
type Max = keyof typeof MAX;

export function Table({
  children,
  size = "md",
  fill = false,
  inset = false,
  scroll = true,
  className,
  label,
}: {
  children: ReactNode;
  size?: Size;
  fill?: boolean;
  inset?: boolean;
  scroll?: boolean;
  className?: string;
  /** Подпись таблицы для скринридера. */
  label?: string;
}) {
  const table = (
    <table
      aria-label={label}
      className={cn(
        "table-stack border-collapse",
        size === "sm" ? "text-xs" : "text-sm",
        fill ? "w-full" : "w-auto",
        inset && "table-inset",
        className,
      )}
    >
      {children}
    </table>
  );
  return (
    <SizeCtx.Provider value={size}>
      {scroll ? <TableScroll>{table}</TableScroll> : table}
    </SizeCtx.Provider>
  );
}

/** Шапка: одна строка заголовков. `sticky` — остаётся сверху при прокрутке. */
export function TableHeader({ children, sticky }: { children: ReactNode; sticky?: boolean }) {
  return (
    <thead className={cn(TABLE_HEAD, sticky && "sticky top-0 z-10 bg-card")}>
      <tr className={TABLE_HEAD_ROW}>{children}</tr>
    </thead>
  );
}

type Align = "left" | "right" | "center";
const ALIGN: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

type CellOpts = { align?: Align; max?: Max; nowrap?: boolean };

function cellClass(size: Size, { align, max, nowrap }: CellOpts, className?: string) {
  return cn(
    CELL[size],
    align && ALIGN[align],
    max && [MAX[max], "break-words"],
    nowrap && "whitespace-nowrap",
    className,
  );
}

export function Th({ align, max, nowrap, className, ...props }: ComponentProps<"th"> & CellOpts) {
  const size = useContext(SizeCtx);
  return (
    <th
      {...props}
      className={cellClass(size, { align, max, nowrap }, cn("font-medium", className))}
    />
  );
}

/**
 * Неон при наведении (Кирилл 27.11): полупрозрачная заливка primary и тонкая
 * внутренняя обводка — тот же вид, что у активного пункта меню и адреса
 * ячейки. Обводка — тенью внутрь, строка не меняет размер. Только с `md`:
 * на телефоне наведения нет, и после касания подсветка залипала.
 */
const NEON_HOVER =
  "transition-colors md:hover:bg-primary/5 md:hover:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]";

/**
 * Строка. `total` — итоговая строка: линия сверху, полужирный. `interactive`
 * — строка что-то открывает или выбирает: неон при наведении.
 */
export function Tr({
  className,
  total,
  interactive,
  ...props
}: ComponentProps<"tr"> & { total?: boolean; interactive?: boolean }) {
  return (
    <tr
      {...props}
      className={cn(
        total ? "border-t border-border font-medium" : TABLE_ROW,
        interactive && NEON_HOVER,
        className,
      )}
    />
  );
}

/**
 * Ячейка. `data-label` — подпись колонки на телефоне (карточка строки); нет —
 * ячейка во всю ширину карточки (заголовок или кнопки строки).
 */
export function Td({ align, max, nowrap, className, ...props }: ComponentProps<"td"> & CellOpts) {
  const size = useContext(SizeCtx);
  return <td {...props} className={cellClass(size, { align, max, nowrap }, className)} />;
}
