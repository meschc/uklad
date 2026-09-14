import { useEffect } from "react";
import { isSiteHref, navigate } from "./route";
import { scrollPageTop, scrollToSection } from "./useSmoothScroll";

/**
 * Переходы по обычным ссылкам — без перезагрузки страницы.
 *
 * Ссылки внутри витрины должны быть настоящими: `<a href="/market/">`, а не
 * кнопка с обработчиком. Робот поисковика по кнопкам не ходит, и человек тоже
 * теряет половину привычного — Cmd-клик, среднюю кнопку мыши, «копировать
 * адрес», предпросмотр адреса в строке состояния.
 *
 * Но настоящая ссылка перезагружает страницу целиком. Поэтому клик
 * перехватывается — один раз на весь документ, а не обработчиком на каждой
 * ссылке: ссылок на витрине под сотню, они появляются и исчезают вместе с
 * секциями, и подписка на каждую означала бы обработчик в каждом компоненте.
 *
 * Всё, что перехват не понял, достаётся браузеру: перезагрузка — не поломка,
 * а медленный, но верный запасной путь.
 */
export function useLinkNavigation(): void {
  useEffect(() => {
    function onClick(event: MouseEvent): void {
      // Правая и средняя кнопки, Cmd/Ctrl/Shift/Alt — это «открыть в новой
      // вкладке», «в новом окне», «скачать». Их поведение придумано не нами.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.defaultPrevented) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      // `target="_blank"`, `download`, `rel="external"` — ссылка сама говорит,
      // что открываться должна не здесь.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.getAttribute("rel")?.includes("external")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(anchor.href, window.location.href);
      if (!isSiteHref(url)) return;

      // Ссылка на страницу, которая уже открыта. Маршрут от неё не меняется, а
      // значит, перезагружать нечего: якорь — плавная прокрутка к секции, без
      // якоря — возврат наверх. Перезагрузка тут особенно обидна: логотип в
      // шапке ведёт на главную, и на самой главной он ронял бы страницу заново.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        const id = url.hash.slice(1);
        const target = id ? document.getElementById(id) : null;
        // Якорь есть, а секции нет — пусть браузер разбирается сам.
        if (id && !target) return;

        event.preventDefault();
        if (url.href !== window.location.href) window.history.pushState(null, "", url.href);
        if (target) scrollToSection(target);
        else scrollPageTop(false);
        return;
      }

      event.preventDefault();
      navigate(`${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}
