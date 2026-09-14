/* eslint-disable react-refresh/only-export-components --
 * Это входная точка сборки, а не модуль браузера: файл выполняется в Node при
 * `npm run build`, компонентов не экспортирует и горячей перезагрузки не знает.
 * Требовать от него «только компоненты» нечего — он ровно наоборот. */
import { renderToString } from "react-dom/server";
import { SiteApp } from "./SiteApp";
import { setServerLang, type SiteLang } from "./lib/lang";
import { pageJsonLd } from "./lib/jsonLd";
import { pageMeta, type PageMeta } from "./lib/pageMeta";
import { setServerRoute, href, routePath, type Route } from "./lib/route";

/**
 * Точка входа сборки: та же витрина, но собранная в строку при сборке проекта.
 *
 * Зачем это вообще. Витрина рисуется скриптами, и до перехода на пути у неё был
 * ровно один адрес — всё остальное жило в хэше, которого сервер не видит.
 * Теперь адресов около восьмидесяти на каждом языке, но робот, пришедший на
 * `/warehouse/w-12/`, получил бы пустой `div id="root"` и ушёл ни с чем: Яндекс
 * скрипты выполняет выборочно и не сразу, а превью ссылки в мессенджере не
 * выполняет их никогда. Поэтому каждую страницу собираем файлом заранее.
 *
 * Здесь только отрисовка. Куда класть файлы и что подставлять в шапку, решает
 * `scripts/prerender.mjs` — этому модулю про файловую систему знать нечего.
 *
 * Эффекты React при сборке не выполняются, а значит, всё, что витрина делает в
 * `useEffect` (заголовок вкладки, тема, прокрутка, наблюдатели), сюда не
 * попадает и попасть не должно. Ровно поэтому шапку документа считает
 * `lib/pageMeta` — чистой функцией, одинаково доступной и здесь, и в браузере.
 */
export interface Rendered {
  /** Разметка витрины — то, что ляжет внутрь `div id="root"`. */
  html: string;
  /** Заголовок, описание и канонические адреса страницы. */
  meta: PageMeta;
  /** Разметка Schema.org одной строкой. */
  jsonLd: string;
  /** Путь файла относительно корня сборки: «en/market/index.html». */
  file: string;
}

export function render(route: Route, lang: SiteLang): Rendered {
  // Порядок важен: `SiteApp` спрашивает маршрут и язык при первой же отрисовке
  // через `useSyncExternalStore`, и оба должны быть выставлены до неё.
  setServerRoute(route);
  setServerLang(lang);

  const meta = pageMeta(route, lang);
  const path = href(routePath(route), lang);

  return {
    html: renderToString(<SiteApp />),
    meta,
    jsonLd: pageJsonLd(route, lang, meta.title),
    // «/» → «index.html», «/en/market/» → «en/market/index.html».
    file: `${path.replace(/^\/+/, "")}index.html`,
  };
}

export { SITE_ROUTES, buildSitemap } from "./lib/routes";
export { translateNoscript } from "./lib/noscript";
export { LANGS } from "./lib/lang";
export { SITE_ORIGIN } from "./data/org";
