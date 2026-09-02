import type { ReactNode } from "react";
import { go, goMarket } from "../lib/route";

/**
 * «Ничего не нашлось» — одним экраном на все случаи витрины.
 *
 * Случаев три, и все они про разное: неизвестный раздел (`#/sklad`), склад,
 * снятый с витрины, и правовой документ по устаревшей ссылке. Разница между
 * ними — только в тексте: человеку важно знать, ошибся он адресом или объект
 * действительно исчез. Оформление же должно быть одним, иначе сайт на трёх
 * своих тупиках выглядит как три разных сайта.
 *
 * Тупик обязан предлагать выход, и не один: кнопка ведёт туда, куда человек,
 * скорее всего, и шёл, ссылка рядом — на главную, если он шёл не туда вовсе.
 */
interface Props {
  /** Мелкая строка над заголовком: код ошибки или адрес, который не открылся. */
  caption?: string;
  title: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}

export function NotFoundScreen({ caption, title, children, action }: Props) {
  const primary = action ?? { label: "Смотреть склады", onClick: goMarket };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-32 text-center sm:px-6">
      {caption && (
        <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-muted-foreground">
          {caption}
        </p>
      )}
      <h1 className="mt-3 font-display text-[26px] font-medium tracking-[-0.02em]">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={primary.onClick}
          className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm font-medium transition-colors hover:bg-muted"
        >
          {primary.label}
        </button>
        <button
          onClick={() => go("/")}
          className="inline-flex h-11 items-center px-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          На главную
        </button>
      </div>
    </div>
  );
}
