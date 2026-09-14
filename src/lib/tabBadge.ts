import { useEffect, useRef } from "react";

/**
 * Счётчик непрочитанного на самой вкладке — в заголовке и на иконке.
 *
 * Уведомление о сообщении в кабинете живёт тостом: он всплывает и пропадает, и
 * человек, отошедший к стеллажу или переключившийся в почту, не узнаёт о
 * сообщении вовсе. Письма и push сюда придут вместе с бэкендом (см. 3.2.1), а
 * пока честно доступно ровно то, что видно, не открывая вкладку: корешок с
 * числом и точка на иконке.
 *
 * Иконка с бейджем собирается из той же `/favicon.svg`, что стоит в разметке, а
 * не рисуется заново: второй экземпляр знака разъехался бы с первым при первой
 * же правке логотипа. Исходник забирается один раз на вкладку и лежит в
 * модуле — перечитывать его на каждое новое сообщение незачем.
 */

/** Больше показывать нет смысла: «9+» и «17» одинаково значат «много». */
const MAX_SHOWN = 9;

/** Тег иконки, который правим. `.ico` рядом остаётся запасным для старых браузеров. */
const ICON_SELECTOR = 'link[rel="icon"][type="image/svg+xml"]';

/** Заголовок вкладки со счётчиком: число первым, иначе его не видно в узком корешке. */
export function titleWithCount(base: string, count: number): string {
  return count > 0 ? `(${label(count)}) ${base}` : base;
}

/**
 * Разметка иконки с бейджем поверх.
 *
 * Бейдж дописывается последним элементом внутрь исходного `svg` — он рисуется
 * поверх знака и ничего в нём не трогает. Белое кольцо под красным кругом —
 * не украшение: иконка ложится на вкладку любого цвета, и без него бейдж
 * сливается с тёмной темой браузера.
 *
 * Цифра нарисована текстом, и в редком браузере, который в иконке шрифты не
 * рисует, от бейджа останется красная точка. Это всё ещё то, ради чего он
 * нужен: «есть непрочитанное». Разметка без `</svg>` возвращается как есть —
 * подменять иконку на сломанную хуже, чем оставить её без бейджа.
 */
export function iconWithBadge(svg: string, count: number): string {
  const end = svg.lastIndexOf("</svg>");
  if (count <= 0 || end < 0) return svg;

  const text = label(count);
  const size = text.length > 1 ? 9 : 11;
  const badge =
    `<circle cx="22.5" cy="9.5" r="9.5" fill="#fff"/>` +
    `<circle cx="22.5" cy="9.5" r="8" fill="#DC2626"/>` +
    `<text x="22.5" y="13.3" text-anchor="middle" fill="#fff"` +
    ` font-family="system-ui, -apple-system, sans-serif"` +
    ` font-size="${size}" font-weight="700">${text}</text>`;

  return `${svg.slice(0, end)}${badge}${svg.slice(end)}`;
}

function label(count: number): string {
  return count > MAX_SHOWN ? `${MAX_SHOWN}+` : `${count}`;
}

/** Иконка как адрес для `href`: инлайном, без похода на сервер за каждой цифрой. */
function badgeHref(svg: string, count: number): string {
  return `data:image/svg+xml,${encodeURIComponent(iconWithBadge(svg, count))}`;
}

let source: Promise<string | null> | null = null;

/**
 * Исходная разметка иконки. Не дочиталась — бейджа не будет, но заголовок
 * вкладки со счётчиком останется: молчать из-за иконки было бы обидно.
 */
function iconSource(href: string): Promise<string | null> {
  source ??= fetch(href)
    .then((r) => (r.ok ? r.text() : null))
    .catch(() => null);
  return source;
}

/** Держит вкладку в согласии со счётчиком и возвращает её как нашёл. */
export function useTabBadge(count: number): void {
  const base = useRef(document.title);
  const iconHref = useRef<string | null>(null);

  useEffect(() => {
    document.title = titleWithCount(base.current, count);
  }, [count]);

  useEffect(() => {
    const icon = document.head.querySelector<HTMLLinkElement>(ICON_SELECTOR);
    if (!icon) return;
    // Свой же адрес с бейджем за исходный принять нельзя, поэтому запоминаем
    // первый — до того, как что-то подменили.
    iconHref.current ??= icon.getAttribute("href");
    const href = iconHref.current;
    if (!href) return;

    if (count === 0) {
      icon.setAttribute("href", href);
      return;
    }

    let alive = true;
    void iconSource(href).then((svg) => {
      if (alive && svg) icon.setAttribute("href", badgeHref(svg, count));
    });
    return () => {
      alive = false;
    };
  }, [count]);

  // Уход со страницы не должен оставлять после себя «(3)» в корешке: вкладку
  // переиспользуют и тесты, и StrictMode, который в разработке гоняет эффекты
  // дважды.
  useEffect(() => {
    const title = base.current;
    return () => {
      document.title = title;
      const icon = document.head.querySelector<HTMLLinkElement>(ICON_SELECTOR);
      if (icon && iconHref.current) icon.setAttribute("href", iconHref.current);
    };
  }, []);
}
