import { useSyncExternalStore } from "react";
import { readLocal, writeLocal } from "@/lib/safeStorage";
import { stripBase } from "./basePath";

/**
 * Язык витрины.
 *
 * У приложения язык лежит в профиле пользователя (`lib/i18n`), но витрина
 * профиля не знает: сюда приходят без учётной записи и часто один раз. Поэтому
 * язык здесь — свойство адреса, а не человека.
 *
 * Язык — сегмент пути (`/en/market/`), а не параметр запроса. Причина одна и
 * решающая: у английской версии должен быть собственный адрес. Поисковик
 * индексирует адреса, а не состояния страницы, и `?lang=en` поверх русского
 * пути для него та же самая страница — английская версия не попала бы в выдачу
 * вовсе. Сегмент пути ещё и позволяет собрать её статикой (см. `scripts/
 * prerender.mjs`) и связать версии тегами `hreflang`.
 *
 * Порядок определения ровно такой и не другой:
 *  1. префикс пути `/en/` — адрес всегда сильнее памяти браузера;
 *  2. `?lang=en` — старые ссылки, разосланные до перехода на пути; их
 *     `normalizeUrl` тут же переписывает на новый адрес;
 *  3. сохранённый выбор — человек уже переключал язык на этом сайте;
 *  4. язык браузера — по нему видно, на каком языке человеку удобнее;
 *  5. русский.
 */
export type SiteLang = "ru" | "en";

export const LANGS: readonly SiteLang[] = ["ru", "en"];

/** Ключ в localStorage — с префиксом проекта, чтобы не сталкиваться с чужими. */
const STORAGE_KEY = "uklad-site-lang";

/** Имя параметра в адресе. Остался ради ссылок, разосланных до перехода. */
export const LANG_PARAM = "lang";

/** Первый сегмент пути английской версии: `/en/market/`. */
export const EN_PREFIX = "en";

function isLang(value: unknown): value is SiteLang {
  return value === "ru" || value === "en";
}

/**
 * Отрезает языковой префикс от пути.
 *
 * Возвращает язык, если он был в адресе явно, и остаток пути — с ним дальше
 * работает маршрутизация, которой про язык знать нечего.
 */
export function splitLangPath(pathname: string): { lang: SiteLang | null; path: string } {
  const path = stripBase(pathname);
  const slash = path.indexOf("/");
  const head = slash === -1 ? path : path.slice(0, slash);
  if (head !== EN_PREFIX) return { lang: null, path };
  return { lang: "en", path: slash === -1 ? "" : path.slice(slash + 1) };
}

/**
 * Чистая часть определения языка — вынесена отдельно, чтобы проверять её
 * тестами без браузера: приоритеты источников важнее самого чтения хранилища.
 */
export function detectLang(
  pathname: string,
  search: string,
  stored: string | null,
  preferred: readonly string[],
): SiteLang {
  // Русский путь — это выбор, а не отсутствие выбора: `/market/` обязан
  // открыться по-русски даже у человека, который однажды нажал «EN».
  const { lang: fromPath, path } = splitLangPath(pathname);
  if (fromPath) return fromPath;
  const fromUrl = new URLSearchParams(search).get(LANG_PARAM);
  if (isLang(fromUrl)) return fromUrl;
  // Внутренние страницы русские по адресу; язык по памяти и по браузеру
  // выбирается только на входе — на самом корне сайта.
  if (path) return "ru";
  if (isLang(stored)) return stored;
  // `en-GB`, `en-US` и просто `en` — один и тот же английский. Языки, которых
  // у нас нет, пропускаем и смотрим следующий: список `navigator.languages`
  // человек расставил сам по убыванию удобства, и второй пункт в нём — уже
  // осознанный запасной вариант, а не догадка браузера.
  for (const tag of preferred) {
    if (tag.toLowerCase().startsWith("en")) return "en";
    if (tag.toLowerCase().startsWith("ru")) return "ru";
  }
  return "ru";
}

/**
 * Выбор языка не настолько важен, чтобы из-за него ронять страницу или
 * показывать ошибку: в недоступном хранилище (приватное окно Safari, запрет в
 * настройках) он всё равно применится в этой вкладке — просто не переживёт её
 * закрытия. Подробности — в `lib/safeStorage`.
 */
function readStored(): string | null {
  return readLocal(STORAGE_KEY);
}

function writeStored(lang: SiteLang): void {
  writeLocal(STORAGE_KEY, lang);
}

let current: SiteLang = "ru";
let initialized = false;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

/**
 * Отражает язык в разметке: `<html lang>` читают и скринридеры (иначе русский
 * текст произносится с английскими правилами чтения), и переносчик слов, и
 * поисковый робот.
 */
function reflect(lang: SiteLang): void {
  document.documentElement.lang = lang;
}

export function getLang(): SiteLang {
  if (!initialized) {
    initialized = true;
    current = detectLang(
      window.location.pathname,
      window.location.search,
      readStored(),
      navigator.languages ?? [],
    );
    reflect(current);
  }
  return current;
}

/**
 * Применение языка к странице.
 *
 * Адрес меняет не эта функция, а `lib/route`: язык живёт в пути, и менять его
 * отдельно от маршрута нельзя — переход должен быть один, иначе в истории
 * браузера появится шаг, ведущий на несуществующее сочетание пути и языка.
 */
export function setLang(lang: SiteLang): void {
  if (lang === current && initialized) return;
  initialized = true;
  current = lang;
  writeStored(lang);
  reflect(lang);
  emit();
}

/**
 * Язык страницы, собираемой при сборке.
 *
 * У предрендера нет ни адреса, ни хранилища: React берёт значение из третьего
 * аргумента `useSyncExternalStore`, и подставить туда язык страницы больше
 * неоткуда. В браузере эта функция не вызывается никогда.
 */
let serverLang: SiteLang = "ru";

export function setServerLang(lang: SiteLang): void {
  serverLang = lang;
  // И сразу же — как текущий язык модуля. `getLang` при сборке спрашивают не
  // только через хук: `href` без второго аргумента зовёт его прямо посреди
  // отрисовки, а определять язык там нечем — ни адреса, ни хранилища в Node
  // нет. Отметка `initialized` заодно закрывает путь к `window`.
  current = lang;
  initialized = true;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Подписка на язык. Ререндер идёт через внешнее хранилище, без контекста. */
export function useLang(): SiteLang {
  return useSyncExternalStore(subscribe, getLang, () => serverLang);
}
