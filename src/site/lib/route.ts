import { useSyncExternalStore } from "react";
import { stripBase, withBase } from "./basePath";
import { EN_PREFIX, LANG_PARAM, getLang, setLang, splitLangPath, type SiteLang } from "./lang";
import { scrollPageTop } from "./useSmoothScroll";

/**
 * Маршрутизация витрины — на настоящих путях, без роутера.
 *
 * Раньше страницы жили на хэше (`#/market`): статический хостинг не умеет
 * отдавать `index.html` на произвольный путь, и прямая ссылка на склад
 * вернула бы 404. Расплата оказалась дороже: для поисковика всё, что после
 * решётки, — не адрес, а якорь одной и той же страницы. Шестьдесят три склада,
 * семь документов и тарифы существовали ровно для тех, кто уже на сайте, а в
 * выдаче был один-единственный адрес — главная.
 *
 * Поэтому 404 на прямую ссылку убран не хэшем, а тем, что каждая страница
 * действительно лежит файлом: `scripts/prerender.mjs` собирает `market/
 * index.html`, `warehouse/w-12/index.html` и так далее. Хостинг отдаёт готовый
 * html, дальше страницу подхватывает React, а переходы внутри сайта делает
 * `history.pushState` — без перезагрузки.
 *
 * Адрес всегда с завершающей косой чертой: так статика отдаёт каталог, и
 * `/market` и `/market/` не расходятся в две записи в индексе.
 */
export type Page =
  | "landing"
  | "warehouses"
  | "sellers"
  | "market"
  // Единственное число — карточка одного склада (`/warehouse/w-12/`),
  // множественное — страница для складов (`/warehouses/`). Формы соседние, и
  // перепутать их легко: `warehouses` отвечает на вопрос «зачем это складу»,
  // `warehouse` показывает конкретный склад с витрины.
  | "warehouse"
  | "legal"
  | "pricing"
  | "contacts"
  | "notfound";

export interface Route {
  page: Page;
  /**
   * Второй сегмент адреса. Для склада — его идентификатор
   * (`/warehouse/w-12/`), для правовой части — код документа
   * (`/legal/privacy/`).
   */
  id?: string;
}

/** Первые сегменты, которым соответствует отдельная страница. */
const PAGES: Record<string, Page> = {
  warehouses: "warehouses",
  sellers: "sellers",
  market: "market",
  warehouse: "warehouse",
  legal: "legal",
  pricing: "pricing",
  contacts: "contacts",
};

/**
 * Разбор адреса в маршрут.
 *
 * Язык из пути здесь уже не участвует: страница у обеих версий одна и та же,
 * и знать про `/en/` маршрутизации незачем — это дело `lib/lang`.
 */
export function parsePath(pathname: string): Route {
  const [head, id] = splitLangPath(pathname).path.split("/").filter(Boolean);
  if (!head) return { page: "landing" };

  const page = PAGES[head];
  // Несуществующий раздел — честное «не найдено». Молча показывать лендинг
  // нельзя: человек шёл по ссылке за конкретной страницей и решит, что такого
  // раздела у сервиса нет вовсе, вместо того чтобы поискать заново.
  if (!page) return { page: "notfound" };

  // Склад раньше открывался поверх витрины и жил по адресу `/market/w-12/`.
  // Теперь это отдельная страница, но старые ссылки продолжают работать —
  // одна строка вместо редиректа, которого у статики всё равно нет.
  if (page === "market" && id) return { page: "warehouse", id };
  return { page, id: id || undefined };
}

/**
 * Путь маршрута без языка: `{ page: "warehouse", id: "w-1" }` → `warehouse/w-1`.
 *
 * Обратная операция к `parsePath` — нужна там, где адрес собирают не из клика,
 * а из уже открытой страницы: canonical, `hreflang`, карта сайта.
 */
export function routePath(route: Route): string {
  if (route.page === "landing" || route.page === "notfound") return "";
  return route.id ? `${route.page}/${route.id}` : route.page;
}

/** Адрес страницы: `href("/legal/offer")` → `/legal/offer/` или `/en/legal/offer/`. */
export function href(to: string, lang: SiteLang = getLang()): string {
  const clean = to.replace(/^\/+/, "").replace(/\/+$/, "");
  const prefix = lang === "en" ? `${EN_PREFIX}/` : "";
  return withBase(clean ? `${prefix}${clean}/` : prefix);
}

/**
 * Адрес страницы склада.
 *
 * Отдаётся строкой, а не обработчиком, намеренно: карточка склада — ссылка,
 * а не кнопка. Раньше склад раскрывался поповером по клику, и всё, что умеет
 * обычная ссылка, у него не работало: средняя кнопка мыши, Cmd-клик, «открыть
 * в новой вкладке», копирование адреса из контекстного меню. Человек,
 * сравнивающий склады, открывает их именно так — по одному в своей вкладке.
 * Поисковый робот, к слову, тоже ходит только по ссылкам.
 */
export function warehouseHref(id: string): string {
  return href(`/warehouse/${id}`);
}

/** Адрес секции лендинга: работает и с других страниц. */
export function anchorHref(id: string): string {
  return `${href("/")}#${id}`;
}

// Текущий маршрут держим модулем, а не хуком: подписчиков несколько, а разбор
// адреса обязан быть один — иначе два компонента в одном кадре решат, что
// открыты разные страницы.
let current: Route | null = null;
// Хвост адреса — тем же складом. В нём живёт отбор витрины (см.
// `lib/marketQuery`), и меняется он куда чаще самой страницы.
let currentSearch: string | null = null;
const listeners = new Set<() => void>();

function readRoute(): Route {
  if (!current) current = parsePath(window.location.pathname);
  return current;
}

function readSearch(): string {
  if (currentSearch === null) currentSearch = window.location.search;
  return currentSearch;
}

/** Перечитать адрес и разбудить подписчиков. */
function refresh(): void {
  const next = parsePath(window.location.pathname);
  // Прежний объект маршрута переживает смену хвоста намеренно: отбор на
  // витрине правят десятками кликов, и новый объект на каждый из них
  // перерисовывал бы весь сайт вместе с шапкой, подвалом и картой.
  if (!current || current.page !== next.page || current.id !== next.id) current = next;
  currentSearch = window.location.search;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // `popstate` — это кнопки «назад» и «вперёд»; переходы внутри сайта будят
  // подписчиков сами, из `navigate`.
  if (listeners.size === 1) window.addEventListener("popstate", refresh);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) window.removeEventListener("popstate", refresh);
  };
}

/**
 * Маршрут страницы, собираемой при сборке, — см. `setServerLang` в `lib/lang`.
 */
let serverRoute: Route = { page: "landing" };

export function setServerRoute(route: Route): void {
  serverRoute = route;
}

/**
 * Правило для всех, кто подписывается на адрес хуками ниже.
 *
 * Компоненту-подписчику нельзя править своё состояние прямо в рендере —
 * приёмом «сравнить с прошлым входом и подстроиться», который React вообще-то
 * разрешает. На повторном проходе рендера React обнуляет очередь эффектов, а
 * вместе с ней теряется отметка о прочитанном снимке: подписка остаётся
 * живой, но сравнивает новый адрес со старой отметкой и решает, что менять
 * нечего. Наружу это выглядит так, что «назад» переписывает адрес, ничего не
 * трогая на экране.
 *
 * Состояние, которое обязано следовать за адресом, поэтому хранится вместе с
 * адресом, к которому относится, и к чужому просто не подходит — см. черновик
 * отбора в `lib/useMarketFilters` и длину списка в `components/market/
 * MarketScreen`. С хуками стора это ограничение снимается само: у zustand
 * снимок пересобирается на каждом рендере, здесь же он один на модуль.
 */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, readRoute, () => serverRoute);
}

/**
 * Хвост адреса вместе с `?`, как его отдаёт `location.search`.
 *
 * На сборке хвоста нет: страницы предрендерятся по чистым путям, и `/market/
 * index.html` обязан показывать всю витрину без отбора. Поэтому серверный
 * снимок — пустая строка, а настоящий хвост приезжает первым же обновлением
 * после подключения React.
 */
export function useSearch(): string {
  return useSyncExternalStore(subscribe, readSearch, () => "");
}

/**
 * Сменить хвост адреса, не уходя со страницы.
 *
 * `replace` — для правок, которые человек делает не разом (набор в поиске,
 * ведение ползунка): такие обязаны заменять текущую запись истории, иначе
 * «назад» отматывает набранное по букве. `push` — для отдельных решений
 * вроде выбранного города: их и снимают по одному кнопкой «назад».
 */
export function setSearch(search: string, mode: "push" | "replace"): void {
  const { pathname, hash } = window.location;
  const query = !search || search.startsWith("?") ? search : `?${search}`;
  if (query === window.location.search) return;
  const url = `${pathname}${query}${hash}`;
  if (mode === "replace") window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  refresh();
}

/**
 * Секция лендинга, к которой нужно прокрутиться сразу после его отрисовки.
 *
 * Обычная ссылка `/#how` с правовой страницы работать не может: браузер ищет
 * секцию сразу после смены адреса, а нарисуется она позже — React ещё не
 * успел сменить страницу. Гоняться за порядком кадров бессмысленно: страница
 * ещё и сама сбрасывает прокрутку наверх при смене раздела. Поэтому намерение
 * откладывается, а забирает его тот же эффект, который иначе увёл бы страницу
 * в начало.
 */
let pendingAnchor: string | null = null;

/** Забрать отложенный якорь — ровно один раз. */
export function consumePendingAnchor(): string | null {
  const anchor = pendingAnchor;
  pendingAnchor = null;
  return anchor;
}

/** Переход по готовому адресу — без перезагрузки страницы. */
export function navigate(url: string): void {
  const { pathname, search, hash } = window.location;
  // Повторный клик по ссылке на текущую страницу не должен плодить шаги в
  // истории: иначе «назад» приходится нажимать столько раз, сколько человек
  // ткнул в один и тот же пункт меню.
  if (url === `${pathname}${search}${hash}`) return;
  window.history.pushState(null, "", url);
  const anchor = window.location.hash.slice(1);
  if (anchor) pendingAnchor = anchor;
  refresh();
}

/** Переход внутри витрины: `go("/legal/offer")`. */
export function go(to: string): void {
  navigate(href(to));
}

/** Переход на страницу склада программно — с карты, где клик по точке не ссылка. */
export function goWarehouse(id: string): void {
  go(`/warehouse/${id}`);
  scrollPageTop();
}

/**
 * Переключение языка.
 *
 * Язык — часть пути, поэтому смена языка это переход: тот же маршрут по
 * другому адресу. `replaceState`, а не `pushState`: кнопка «назад» после
 * переключения должна возвращать на предыдущую страницу, а не на ту же самую
 * по-русски.
 *
 * Хвост адреса переезжает вместе с путём: в нём собранный отбор витрины, и
 * терять его от переключения языка не за что.
 */
export function switchLang(lang: SiteLang): void {
  if (lang === getLang()) return;
  const { path } = splitLangPath(window.location.pathname);
  const { search, hash } = window.location;
  window.history.replaceState(null, "", `${href(path, lang)}${search}${hash}`);
  setLang(lang);
  refresh();
}

/**
 * Приведение адреса к нынешнему виду — один раз, до первой отрисовки.
 *
 * Чинит ссылки, разосланные до перехода на пути: `#/market` из чужой закладки,
 * `?lang=en` из переписки. Обе формы переписываются на нынешний адрес
 * `replaceState`-ом, то есть без лишнего шага в истории и без перезагрузки.
 *
 * Сюда же попадает случай «англичанин пришёл на корень»: язык выбран по памяти
 * или по браузеру, а адрес остался русским — и ссылка, скопированная из
 * адресной строки, открылась бы у собеседника по-русски.
 */
export function normalizeUrl(): void {
  const { pathname, search, hash } = window.location;
  const legacyHash = hash.startsWith("#/") ? hash.slice(1) : "";
  const params = new URLSearchParams(search);
  const hadLangParam = params.has(LANG_PARAM);
  params.delete(LANG_PARAM);

  const lang = getLang();
  const path = legacyHash || splitLangPath(pathname).path;
  const query = params.toString();
  const next = `${href(path, lang)}${query ? `?${query}` : ""}${legacyHash ? "" : hash}`;

  if (next === `${pathname}${search}${hash}`) return;
  // Смена адреса до первой отрисовки: React ещё не читал маршрут, будить
  // подписчиков не нужно и некого.
  window.history.replaceState(null, "", next);
  if (hadLangParam || legacyHash) current = null;
}

/** Внутренняя ссылка витрины: её перехватывает `useLinkNavigation`. */
export function isSiteHref(url: URL): boolean {
  if (url.origin !== window.location.origin) return false;
  // Демо WMS — отдельное приложение со своей точкой входа: его открывает
  // браузер целиком, а не роутер витрины.
  return !stripBase(url.pathname).startsWith("app/");
}
