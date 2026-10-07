import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { href } from "../lib/route";
import { c, useT } from "../lib/copy";

/**
 * «Ничего не нашлось» — одним экраном на все случаи витрины.
 *
 * Случаев три, и все они про разное: неизвестный раздел (`/sklad/`), склад,
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
  /** Куда ведёт первая кнопка, если каталог складов — не туда. */
  action?: { label: string; to: string };
}

const T = {
  browse: c("Смотреть склады", "Browse warehouses"),
  home: c("На главную", "Home"),
};

export function NotFoundScreen({ caption, title, children, action }: Props) {
  const t = useT();
  const primary = action ?? { label: t(T.browse), to: "/market" };

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-32 text-center sm:px-6">
      {caption && <p className={eyebrow({ className: "font-mono" })}>{caption}</p>}
      <h1 className="mt-3 font-display text-2xl font-heading tracking-tight">{title}</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        {children}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button asChild variant="outline" size="lg" shape="pill">
          <a href={href(primary.to)}>{primary.label}</a>
        </Button>
        <Button asChild variant="ghost" size="lg" shape="pill">
          <a href={href("/")}>{t(T.home)}</a>
        </Button>
      </div>
    </div>
  );
}
