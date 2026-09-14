import { BRAND } from "../data/brand";
import { LEGAL_BY_SLUG } from "../data/legal";
import { warehousesRepository } from "../data/warehousesRepository";
import { c, pick, type Copy } from "./copy";
import type { SiteLang } from "./lang";
import { href, routePath, type Page, type Route } from "./route";

/**
 * Шапка документа для конкретного адреса: заголовок, описание, канонические
 * ссылки.
 *
 * Отдельный файл, а не часть `SiteApp`, по одной причине: то же самое нужно
 * предрендеру (`scripts/prerender.mjs`), который собирает страницы при сборке и
 * React не запускает вовсе. Пока эти строки лежали внутри эффекта, у витрины
 * было два источника заголовков — один для человека, другой для робота, — и
 * разойтись им ничто не мешало.
 *
 * Функция чистая: ни `window`, ни `document`. Всё, что она знает, приходит
 * аргументами.
 */

const TITLES: Record<Page, Copy> = {
  // «Витрина клиентов» читалась двусмысленно — чьих клиентов и кто кому
  // витрина. Здесь названы оба адресата продукта прямо: селлер ищет склад на
  // маркетплейсе, склад работает в WMS. Тот же текст стоит в шаблоне
  // `index.html` — он попадает в превью до того, как отработает предрендер.
  landing: c(
    "Уклад — маркетплейс складов и WMS для фулфилмента",
    "Uklad — a marketplace of warehouses and a WMS",
  ),
  warehouses: c(
    "Складу — заявки от селлеров и WMS — Уклад",
    "For warehouses — seller requests and a WMS — Uklad",
  ),
  sellers: c(
    "Селлеру — склад, который видно насквозь — Уклад",
    "For sellers — a warehouse you can see through — Uklad",
  ),
  market: c("Склады для фулфилмента — Уклад", "Fulfilment warehouses — Uklad"),
  warehouse: c("Склад — Уклад", "Warehouse — Uklad"),
  legal: c("Правовая информация — Уклад", "Legal — Uklad"),
  pricing: c("Тарифы — Уклад", "Pricing — Uklad"),
  contacts: c("Контакты — Уклад", "Contacts — Uklad"),
  notfound: c("Страница не найдена — Уклад", "Page not found — Uklad"),
};

/**
 * Описание страницы для выдачи и превью ссылки. Своё у каждого раздела: одно
 * описание на весь сайт означает, что в поиске все семь страниц выглядят
 * одинаково, и выбирать между ними человеку не по чему.
 *
 * Длина — до 160 знаков: дальше и Яндекс, и Google обрезают строку многоточием.
 */
const DESCRIPTIONS: Record<Page, Copy> = {
  landing: c(
    "WMS для фулфилмент-склада и витрина, где его находят селлеры. Приёмка, размещение по ячейкам, сборка и отгрузка — в одной системе.",
    "A WMS for a fulfilment warehouse and a marketplace where sellers find it. Intake, cell placement, picking and shipping in one system.",
  ),
  warehouses: c(
    "Как склад попадает на витрину и что получает: заявки от селлеров без комиссии, WMS для смены, кабинет клиента. 14 дней бесплатно.",
    "How a warehouse gets listed and what it gets: seller requests with no commission, a WMS for the shift, a client account. 14 days free.",
  ),
  sellers: c(
    "Выбрать склад, согласовать условия и отправить товар — без переписки и звонков. Остатки, статусы приёмки и отгрузки видны в кабинете.",
    "Pick a warehouse, agree the terms and ship — with no calls or email threads. Stock, intake and shipping statuses are in your account.",
  ),
  market: c(
    "Каталог фулфилмент-складов с ценами, услугами и свободными местами. Фильтры по городу, схеме работы (FBO, FBS, DBS) и площадкам.",
    "A catalogue of fulfilment warehouses with prices, services and free slots. Filters by city, model (FBO, FBS, DBS) and marketplace.",
  ),
  warehouse: c(
    "Склад на витрине Уклада: цены на хранение и обработку, услуги, режим хранения, свободные места и заявка без комиссии.",
    "A warehouse on Uklad: storage and handling prices, services, storage mode, free slots and a request with no commission.",
  ),
  legal: c(
    "Оферта, пользовательское соглашение, политика обработки персональных данных и сведения о владельце сайта и агрегатора.",
    "The offer, the terms of use, the personal data policy and the disclosure about the owner of the site and the aggregator.",
  ),
  pricing: c(
    "Поиск склада и заявки — бесплатно и без комиссии. Платно — план склада, остатки по ячейкам и расчёт хранения. Тарифы WMS для складов.",
    "Search and requests are free, with no commission. You pay for the floor plan, stock by cell and storage estimates. WMS plans for warehouses.",
  ),
  contacts: c(
    "Почта, телефон и режим работы Уклада, реквизиты владельца сайта и форма для вопросов о складе, интеграции или переносе остатков.",
    "Email, phone and working hours, the site owner's legal details and a form for questions about a warehouse, an integration or moving stock.",
  ),
  notfound: c(
    "Страница не найдена. Всё, что есть на витрине, собрано в шапке и в подвале сайта.",
    "Page not found. Everything the site has is in the header and the footer.",
  ),
};

export interface PageMeta {
  /** Заголовок вкладки и превью ссылки. */
  title: string;
  /** Описание для выдачи и превью. */
  description: string;
  /** Канонический адрес русской версии — путь от корня сайта. */
  ru: string;
  /** Канонический адрес английской версии. */
  en: string;
  /**
   * Страницы нет: адрес ведёт на несуществующий склад или документ. Такую
   * закрывают от индексации и не дают ей канонического адреса.
   */
  noindex: boolean;
}

export function pageMeta(route: Route, lang: SiteLang): PageMeta {
  // Марка в конце заголовка — та же, что в шапке: на английской версии там
  // «Uklad», и расходиться корешку вкладки со знаком незачем.
  const brand = pick(lang, BRAND);

  const named = namedTitle(route, lang, brand);
  // Адрес указывает на конкретный склад или документ, а его нет: тогда и
  // заголовок, и описание берутся от страницы «не найдено».
  const missing =
    Boolean(route.id) && !named && (route.page === "legal" || route.page === "warehouse");
  const page: Page = missing ? "notfound" : route.page;
  const noindex = page === "notfound";
  const path = noindex ? "" : routePath(route);

  return {
    // В истории браузера и в корешке вкладки тупик должен быть виден: иначе
    // человек вернётся по закладке «Оферта» в то же ничто, уверенный, что
    // открывает оферту.
    title: named ?? pick(lang, TITLES[page]),
    description: pick(lang, DESCRIPTIONS[page]),
    ru: href(path, "ru"),
    en: href(path, "en"),
    noindex,
  };
}

/**
 * Заголовок конкретного склада или документа — или `null`, если второй сегмент
 * адреса ни на что не указывает. Второе и есть признак несуществующей страницы:
 * список складов и список документов здесь единственный источник правды.
 */
function namedTitle(route: Route, lang: SiteLang, brand: string): string | null {
  if (!route.id) return null;

  if (route.page === "legal") {
    const doc = LEGAL_BY_SLUG[route.id];
    return doc ? `${doc.short} — ${brand}` : null;
  }

  if (route.page === "warehouse") {
    // У склада в заголовке его название: склады сравнивают в соседних вкладках,
    // и различать их приходится по корешку вкладки, где помещается слов пять.
    const w = route.id ? warehousesRepository.get(route.id) : undefined;
    // Название и город — двуязычные поля, а не строки: без `pick` в корешок
    // вкладки уезжало «[object Object]».
    return w ? `${pick(lang, w.name)}, ${pick(lang, w.cityTitle)} — ${brand}` : null;
  }

  return null;
}
