import type { ReactNode } from "react";
import { ArrowRight, Search } from "lucide-react";
import { href } from "../lib/route";
import { c, useT } from "../lib/copy";
import { AddressBar } from "./AddressBar";

/**
 * «Ничего не нашлось» — одним экраном на все случаи витрины.
 *
 * Случаев три, и все они про разное: неизвестный раздел (`/sklad/`), склад,
 * снятый с витрины, и правовой документ по устаревшей ссылке. Разница между
 * ними — только в тексте: человеку важно знать, ошибся он адресом или объект
 * действительно исчез. Оформление же одно.
 *
 * Главное на экране — строка адреса по центру (Кирилл 31 окт): опечатку
 * исправляют прямо в ней, под ней подсказки живых страниц. Стеллаж с
 * анимацией сканера сняли — он отвлекал от строки. Ниже — что случилось и
 * два выхода: туда, куда человек, скорее всего, шёл, и написать нам.
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
};

export function NotFoundScreen({ caption, title, children, action }: Props) {
  const t = useT();
  const primary = action ?? { label: t(T.browse), to: "/" };

  return (
    <div className="wh">
      <div className="mx-auto flex max-w-[760px] flex-col items-center px-5 pb-24 pt-16 text-center sm:px-10 sm:pt-24">
        {caption && (
          <p className="font-mono text-sm tracking-[0.02em] text-[var(--wh-muted)]">{caption}</p>
        )}
        <h1 className="wh-h2 mt-4">{title}</h1>
        <p className="mt-5 max-w-md text-[17px] leading-[1.55] text-[var(--wh-muted)]">
          {children}
        </p>
        <div className="mt-10 w-full text-left">
          <AddressBar />
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href={href(primary.to)} className="wh-btn wh-btn--blue group">
            <Search className="size-4" />
            {primary.label}
            <ArrowRight className="size-4" />
          </a>
          <a href={href("/contacts")} className="wh-btn wh-btn--soft">
            {t(T.home)}
          </a>
        </div>
      </div>
    </div>
  );
}
