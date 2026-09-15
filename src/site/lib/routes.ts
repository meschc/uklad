import { LEGAL_DOCS } from "../data/legal";
import { warehousesRepository } from "../data/warehousesRepository";
import { LANGS } from "./lang";
import { href, routePath, type Route } from "./route";

/**
 * Полный список адресов витрины.
 *
 * Нужен там, где страницы перечисляют, а не открывают: предрендер собирает по
 * этому списку файлы в `dist`, он же превращается в `sitemap.xml`. Раньше карта
 * сайта лежала отдельным файлом в `public` и жила своей жизнью — при добавлении
 * склада её никто не трогал, и поисковик узнавал о новых страницах в последнюю
 * очередь.
 *
 * Порядок здесь не случайный: сначала разделы, потом документы, потом склады —
 * в таком же виде страницы попадут и в карту сайта, и человеку, который её
 * откроет, будет видно устройство витрины.
 */
export const SITE_ROUTES: readonly Route[] = [
  { page: "landing" },
  // Склад идёт раньше селлера: покупатель Уклада — склад, он берёт систему и
  // вместе с ней поток клиентов. Тот же порядок в шапке и в подвале.
  { page: "warehouses" },
  { page: "sellers" },
  { page: "market" },
  { page: "pricing" },
  { page: "roadmap" },
  { page: "contacts" },
  { page: "legal" },
  ...LEGAL_DOCS.map((doc) => ({ page: "legal" as const, id: doc.slug })),
  ...warehousesRepository.list().map((w) => ({ page: "warehouse" as const, id: w.id })),
];

/**
 * Вес страницы для карты сайта.
 *
 * Это подсказка о том, что на сайте главное, а не обещание частоты обхода.
 * Каталог и лендинг — вход, склады — то, ради чего каталог существует,
 * документы — обязательные, но не те страницы, которые ищут.
 */
function priority(route: Route): string {
  if (route.page === "landing") return "1.0";
  if (route.page === "market") return "0.9";
  if (route.page === "warehouse") return "0.8";
  if (route.page === "legal" && route.id) return "0.3";
  return "0.6";
}

/**
 * Карта сайта со всеми адресами на обоих языках.
 *
 * Языковые версии перечислены не отдельными записями, а тегами `xhtml:link`
 * внутри одной: так поисковик видит, что это одна страница на двух языках, а не
 * две конкурирующие копии одного текста.
 */
export function buildSitemap(origin: string, lastmod: string): string {
  const urls = SITE_ROUTES.map((route) => {
    const path = routePath(route);
    const alternates = LANGS.map(
      (lang) =>
        `    <xhtml:link rel="alternate" hreflang="${lang}" href="${origin}${href(path, lang)}" />`,
    ).join("\n");
    return [
      "  <url>",
      `    <loc>${origin}${href(path, "ru")}</loc>`,
      alternates,
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}${href(path, "ru")}" />`,
      `    <lastmod>${lastmod}</lastmod>`,
      `    <priority>${priority(route)}</priority>`,
      "  </url>",
    ].join("\n");
  }).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}
