import type { ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { href } from "../lib/route";
import { c, useT } from "../lib/copy";

/**
 * «Ничего не нашлось» — одним экраном на все случаи витрины.
 *
 * Случаев три, и все они про разное: неизвестный раздел (`/sklad/`), склад,
 * снятый с витрины, и правовой документ по устаревшей ссылке. Разница между
 * ними — только в тексте: человеку важно знать, ошибся он адресом или объект
 * действительно исчез. Оформление же одно.
 *
 * Тупик нарисован складским (Кирилл 22 окт: «404 должна быть поинтереснее»):
 * стеллаж, где по полкам расставлены коробки, сканер проходит ряды, и ровно
 * одна ячейка — с адресом 4-0-4 — пуста. Это та самая страница: адрес есть,
 * товара нет. Выход — не один: кнопка туда, куда человек, скорее всего, шёл, и
 * ссылка на главную.
 */
interface Props {
  /** Мелкая строка над заголовком: код ошибки или адрес, который не открылся. */
  caption?: string;
  title: string;
  children: ReactNode;
  /** Куда ведёт первая кнопка, если каталог складов — не туда. */
  action?: { label: string; to: string };
}

const T = {
  browse: c("На главную", "Home page"),
  home: c("Написать нам", "Contact us"),
  empty: c("пусто", "empty"),
  rack: c("Стеллаж, в котором пуста ячейка 4-0-4", "A rack with cell 4-0-4 empty"),
};

/**
 * Раскладка стеллажа: 4 полки по 6 ячеек. Число — размер коробки в долях
 * ячейки, `b` — синяя коробка, 0 — просто свободное место, `x` — та самая.
 */
type Cell = number | "b" | "x";
const SHELVES: Cell[][] = [
  [0.9, 0.7, "b", 0.8, 0.6, 0.95],
  [0.75, 0.9, 0.6, 0, 0.85, 0.7],
  [0.8, 0.65, 0.9, "x", 0.7, "b"],
  [0.95, 0.8, 0.7, 0.9, 0.6, 0.85],
];

export function NotFoundScreen({ caption, title, children, action }: Props) {
  const t = useT();
  const primary = action ?? { label: t(T.browse), to: "/" };

  return (
    <div className="wh">
      <div className="mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-24 pt-14 sm:px-10 sm:pt-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-20">
        <Rack label={t(T.rack)} empty={t(T.empty)} />

        <div className="wh-swap">
          {caption && (
            <p className="font-mono text-sm tracking-[0.02em] text-[var(--wh-muted)]">{caption}</p>
          )}
          <h1 className="wh-h2 mt-4">{title}</h1>
          <p className="mt-5 max-w-md text-[17px] leading-[1.55] text-[var(--wh-muted)]">
            {children}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href={href(primary.to)} className="wh-btn wh-btn--blue group">
              <Search className="size-4" />
              {primary.label}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a href={href("/contacts")} className="wh-btn wh-btn--soft">
              {t(T.home)}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Rack({ label, empty }: { label: string; empty: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative select-none overflow-hidden rounded-[22px] bg-[var(--wh-soft)] p-4 sm:p-7"
    >
      {/* Луч сканера ходит по стеллажу сверху вниз. */}
      <div
        aria-hidden
        className="wh-scan pointer-events-none absolute inset-x-0 top-0 z-10 [--wh-scan-to:clamp(300px,42vw,560px)]"
      />
      <div aria-hidden className="flex flex-col gap-3 sm:gap-4">
        {SHELVES.map((shelf, row) => (
          <div key={row}>
            <div className="grid grid-cols-6 gap-1.5 sm:gap-2.5">
              {shelf.map((cell, col) => (
                <Slot key={col} cell={cell} delay={(row * 6 + col) * 40} empty={empty} />
              ))}
            </div>
            {/* Балка полки. */}
            <div className="mt-1 h-1.5 rounded-full bg-[var(--wh-line)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Slot({ cell, delay, empty }: { cell: Cell; delay: number; empty: string }) {
  if (cell === "x") {
    return (
      <div className="wh-404-cell flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--wh-blue)] text-[var(--wh-blue)]">
        <span className="font-mono text-[clamp(11px,1.5vw,18px)] font-semibold tracking-tight">
          4-0-4
        </span>
        <span className="hidden text-[11px] sm:block">{empty}</span>
      </div>
    );
  }
  if (cell === 0) return <div className="aspect-square" />;

  const blue = cell === "b";
  const size = blue ? 0.85 : cell;
  return (
    <div className="flex aspect-square items-end justify-center">
      <div
        style={{
          width: `${size * 100}%`,
          height: `${(0.5 + size * 0.4) * 100}%`,
          animationDelay: `${delay}ms`,
        }}
        className={cn(
          "wh-box relative rounded-md transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1.5",
          blue ? "bg-[var(--wh-blue)]" : "bg-[var(--wh-ground)] shadow-[0_0_0_1px_var(--wh-line)]",
        )}
      >
        {/* Скотч по крышке коробки. */}
        <span
          className={cn(
            "absolute inset-x-[42%] top-0 h-1/3 rounded-b-sm",
            blue ? "bg-white/25" : "bg-[var(--wh-line)]",
          )}
        />
      </div>
    </div>
  );
}
