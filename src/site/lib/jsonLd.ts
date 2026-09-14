import { BRAND } from "../data/brand";
import { LEGAL_BY_SLUG } from "../data/legal";
import { ORG, SITE_ORIGIN } from "../data/org";
import { warehousesRepository } from "../data/warehousesRepository";
import { c, pick } from "./copy";
import type { SiteLang } from "./lang";
import { href, routePath, type Route } from "./route";

/**
 * Разметка Schema.org для страницы.
 *
 * Нужна ровно для одного: чтобы в выдаче под ссылкой была видна цепочка
 * разделов, а не голый адрес, и чтобы поисковик знал, кто владеет сайтом.
 *
 * Чего здесь намеренно нет — сведений о самих складах: ни `LocalBusiness`, ни
 * `AggregateRating`. Склады на витрине сгенерированы для демонстрации, а
 * структурированные данные — это утверждение о реальном мире, которое
 * поисковик покажет человеку как факт. Разметить выдуманную компанию с
 * выдуманным рейтингом значит соврать в машиночитаемом виде, и снимают за это
 * не отдельную карточку, а доверие ко всему домену. Появятся настоящие склады —
 * появится и разметка, вместе с настоящими реквизитами (см. `ORG.filled`).
 *
 * Пишет её только предрендер: разметку читает робот, а он приходит на
 * собранный файл. Подставлять её в живой документ при переходах внутри витрины
 * незачем — там её никто не прочитает.
 */

const T = {
  home: c("Главная", "Home"),
  market: c("Склады", "Warehouses"),
  legal: c("Правовая информация", "Legal"),
  warehouses: c("Складам", "For warehouses"),
  sellers: c("Селлерам", "For sellers"),
  pricing: c("Тарифы", "Pricing"),
  contacts: c("Контакты", "Contacts"),
};

/** Одна ступень хлебной крошки: имя и адрес. */
interface Crumb {
  name: string;
  path: string;
}

function crumbs(route: Route, lang: SiteLang): Crumb[] {
  const home: Crumb = { name: pick(lang, T.home), path: "/" };

  switch (route.page) {
    case "warehouses":
      return [home, { name: pick(lang, T.warehouses), path: "/warehouses" }];
    case "sellers":
      return [home, { name: pick(lang, T.sellers), path: "/sellers" }];
    case "pricing":
      return [home, { name: pick(lang, T.pricing), path: "/pricing" }];
    case "contacts":
      return [home, { name: pick(lang, T.contacts), path: "/contacts" }];
    case "market":
      return [home, { name: pick(lang, T.market), path: "/market" }];
    case "warehouse": {
      const w = route.id ? warehousesRepository.get(route.id) : undefined;
      const market: Crumb = { name: pick(lang, T.market), path: "/market" };
      if (!w) return [home, market];
      return [home, market, { name: pick(lang, w.name), path: `/warehouse/${w.id}` }];
    }
    case "legal": {
      const legal: Crumb = { name: pick(lang, T.legal), path: "/legal" };
      const doc = route.id ? LEGAL_BY_SLUG[route.id] : undefined;
      if (!doc) return [home, legal];
      return [home, legal, { name: doc.short, path: `/legal/${doc.slug}` }];
    }
    default:
      return [];
  }
}

/**
 * Владелец сайта. Реквизиты сюда не идут — ни ИНН, ни ОГРНИП: пока они
 * учебные (`ORG.filled === false`), машиночитаемо утверждать их нельзя.
 */
function organization(lang: SiteLang) {
  return {
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#org`,
    name: pick(lang, BRAND),
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/apple-touch-icon.png`,
    email: ORG.email,
  };
}

/**
 * Собирает граф разметки для страницы. Возвращает готовую строку JSON или
 * пустую, если размечать нечего.
 */
export function pageJsonLd(route: Route, lang: SiteLang, title: string): string {
  const graph: unknown[] = [
    organization(lang),
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#site`,
      name: pick(lang, BRAND),
      url: `${SITE_ORIGIN}${href("/", lang)}`,
      inLanguage: lang,
      publisher: { "@id": `${SITE_ORIGIN}/#org` },
    },
  ];

  const trail = crumbs(route, lang);
  if (trail.length > 1) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: trail.map((crumb, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: crumb.name,
        item: `${SITE_ORIGIN}${href(crumb.path, lang)}`,
      })),
    });
  }

  graph.push({
    "@type": "WebPage",
    url: `${SITE_ORIGIN}${href(routePath(route), lang)}`,
    name: title,
    inLanguage: lang,
    isPartOf: { "@id": `${SITE_ORIGIN}/#site` },
  });

  // Экранирование `<` — не украшение. Строка попадает внутрь <script>, а
  // браузер ищет там закрывающий тег раньше, чем разбирает JSON: название
  // склада вида «Склад </script>…» закрыло бы тег и всё, что за ним, стало бы
  // разметкой страницы. Данные у нас свои, но однажды они придут из формы
  // склада, и чинить это тогда будет некому. `<` — тот же символ для
  // разборщика JSON и уже не тег для браузера.
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph })
    .split("<")
    .join("\\u003c");
}
