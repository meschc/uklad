/**
 * Метатеги, которые меняются вместе со страницей и языком.
 *
 * В `index.html` они стоят по-русски и описывают лендинг — это разумная
 * заглушка для первого запроса, но у витрины семь разделов и шесть десятков
 * складов, и человек, приславший ссылку на тарифы, получил бы в превью описание
 * главной. То же и с языком: на английской версии русское описание в выдаче
 * читается как чужой сайт.
 *
 * Что писать, решает `SiteApp`: у склада и документа заголовок собирается из
 * данных, и знать об этом должен маршрут, а не этот файл.
 *
 * Эти же функции вызывает предрендер (`scripts/prerender.mjs`) — там они пишут
 * в разметку страницы до того, как её увидит робот. В браузере они правят уже
 * готовый документ: это нужно живому человеку, который ходит по сайту без
 * перезагрузок, и тому, что попадёт в его закладку.
 */
import { SITE_ORIGIN } from "../data/org";
import type { SiteLang } from "./lang";

/** Локаль Open Graph по языку витрины. */
const OG_LOCALE: Record<SiteLang, string> = {
  ru: "ru_RU",
  en: "en_US",
};

function setContent(selector: string, content: string): void {
  const tag = document.head.querySelector<HTMLMetaElement>(selector);
  // Тега может не быть: `index.html` правят руками, и молча создавать здесь
  // недостающий метатег значит развести два источника разметки шапки.
  if (tag) tag.content = content;
}

/**
 * Запрет на индексацию — для страниц, которых в выдаче быть не должно.
 *
 * Это несуществующие адреса: робот приходит по битой ссылке, получает бодрый
 * ответ 200 (статика иначе не умеет) и заносит «страницы не существует» в
 * индекс как обычную страницу сайта. Дальше её показывают людям.
 */
export function setNoIndex(noindex: boolean): void {
  const found = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!noindex) {
    found?.remove();
    return;
  }
  if (found) {
    found.content = "noindex, follow";
    return;
  }
  const tag = document.createElement("meta");
  tag.name = "robots";
  // `follow`, а не `noindex, nofollow`: со страницы «не найдено» ведут ссылки на
  // разделы, и обходить их роботу никто не мешает.
  tag.content = "noindex, follow";
  document.head.appendChild(tag);
}

/**
 * Заголовок страницы — в корешок вкладки и в превью ссылки сразу.
 *
 * Порознь их держать нельзя: разошедшиеся заголовок вкладки и заголовок в
 * пересланной ссылке — это ровно та мелочь, по которой видно, что страницу
 * собрали из кусков.
 */
export function setTitle(text: string): void {
  document.title = text;
  setContent('meta[property="og:title"]', text);
}

/** Описание страницы — в `<meta name="description">` и в Open Graph. */
export function setDescription(text: string): void {
  setContent('meta[name="description"]', text);
  setContent('meta[property="og:description"]', text);
}

/** Язык страницы — в Open Graph. `<html lang>` ставит `lib/lang`. */
export function setLocale(lang: SiteLang): void {
  setContent('meta[property="og:locale"]', OG_LOCALE[lang]);
}

/** Абсолютный адрес страницы: `/market/` → `https://u-klad.ru/market/`. */
function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

/**
 * Находит тег связи или заводит его. В отличие от метатегов, ссылок canonical и
 * hreflang в `index.html` нет и быть не может: они у каждой страницы свои.
 */
function link(rel: string, hreflang?: string): HTMLLinkElement {
  const selector = hreflang
    ? `link[rel="${rel}"][hreflang="${hreflang}"]`
    : `link[rel="${rel}"]:not([hreflang])`;
  const found = document.head.querySelector<HTMLLinkElement>(selector);
  if (found) return found;

  const tag = document.createElement("link");
  tag.rel = rel;
  if (hreflang) tag.hreflang = hreflang;
  document.head.appendChild(tag);
  return tag;
}

/**
 * Канонический адрес страницы и ссылки на её версии на другом языке.
 *
 * Canonical нужен потому, что до одной и той же страницы ведёт несколько
 * адресов: старая ссылка на хэше, адрес с `?utm_source=…` из рекламы, склад,
 * открытый и как `/warehouse/w-12/`, и как `/market/w-12/`. Без canonical это
 * четыре разные страницы с одинаковым текстом, и поисковик сам решает, какую
 * показывать, — обычно не ту.
 *
 * `hreflang` связывает русскую и английскую версии в пару: иначе они конкурируют
 * между собой как копии, вместо того чтобы показываться каждая своей аудитории.
 * `x-default` — куда вести всех остальных; у нас это русская версия.
 */
export function setCanonical(ru: string, en: string, lang: SiteLang): void {
  link("canonical").href = absoluteUrl(lang === "en" ? en : ru);
  link("alternate", "ru").href = absoluteUrl(ru);
  link("alternate", "en").href = absoluteUrl(en);
  link("alternate", "x-default").href = absoluteUrl(ru);
  setContent('meta[property="og:url"]', absoluteUrl(lang === "en" ? en : ru));
}
