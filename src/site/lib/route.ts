import { useEffect, useState } from "react";
import { scrollPageTop, scrollToSection } from "./useSmoothScroll";

/**
 * Маршрутизация витрины — на хэше, без роутера.
 *
 * Причина не в экономии: сайт собирается как статика и раскладывается куда
 * угодно (в том числе в подкаталог GitHub Pages). Обычные пути потребовали бы
 * от хостинга fallback на `index.html`, которого у статики нет — прямая ссылка
 * на склад отдавала бы 404. Хэш работает везде одинаково.
 */
export type Page =
  | "landing"
  | "sellers"
  | "market"
  | "warehouse"
  | "legal"
  | "pricing"
  | "contacts"
  | "notfound";

export interface Route {
  page: Page;
  /**
   * Второй сегмент адреса. Для склада — его идентификатор
   * (`#/warehouse/w-12`), для правовой части — код документа
   * (`#/legal/privacy`).
   */
  id?: string;
}

/** Первые сегменты, которым соответствует отдельная страница. */
const PAGES: Record<string, Page> = {
  sellers: "sellers",
  market: "market",
  warehouse: "warehouse",
  legal: "legal",
  pricing: "pricing",
  contacts: "contacts",
};

export function parseRoute(hash: string): Route {
  // В хэше живут две разные вещи, и отличает их косая черта: `#/market` —
  // адрес раздела, `#how` — якорь секции лендинга. Разница видна только здесь,
  // а поступать с неизвестным нужно противоположно.
  const isRoute = hash.startsWith("#/");
  const [head, id] = hash.replace(/^#\/?/, "").split("/");
  const page = PAGES[head];
  if (!page) {
    // Якорь ведём на лендинг: ссылки вида `#how` стоят в самом лендинге и
    // расходятся по закладкам, а секцию могут переименовать — страница обязана
    // открыться в любом случае.
    //
    // Несуществующий раздел — честное «не найдено». Молча показывать лендинг
    // здесь нельзя: человек шёл по ссылке за конкретной страницей и решит, что
    // такого раздела у сервиса нет вовсе, вместо того чтобы поискать заново.
    return { page: isRoute && head ? "notfound" : "landing" };
  }
  // Склад раньше открывался поверх витрины и жил по адресу `#/market/w-12`.
  // Теперь это отдельная страница, но старые ссылки продолжают работать —
  // одна строка вместо редиректа, которого у статики всё равно нет.
  if (page === "market" && id) return { page: "warehouse", id };
  return { page, id: id || undefined };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return route;
}

export function go(to: string): void {
  window.location.hash = to;
}

/**
 * Переход на витрину складов с самого верха. Сам по себе переход хэшем
 * прокрутку не сбрасывает: пользователь, кликнувший «Подобрать склад» из
 * середины лендинга, оказался бы в середине каталога.
 */
export function goMarket(): void {
  go("/market");
  scrollPageTop();
}

/**
 * Адрес страницы склада.
 *
 * Отдаётся строкой, а не обработчиком, намеренно: карточка склада — ссылка,
 * а не кнопка. Раньше склад раскрывался поповером по клику, и всё, что умеет
 * обычная ссылка, у него не работало: средняя кнопка мыши, Cmd-клик, «открыть
 * в новой вкладке», копирование адреса из контекстного меню. Человек,
 * сравнивающий склады, открывает их именно так — по одному в своей вкладке.
 */
export function warehouseHref(id: string): string {
  return `#/warehouse/${id}`;
}

/** Переход на страницу склада программно — с карты, где клик по точке не ссылка. */
export function goWarehouse(id: string): void {
  go(`/warehouse/${id}`);
  scrollPageTop();
}

/**
 * Секция лендинга, к которой нужно прокрутиться сразу после его отрисовки.
 *
 * Обычный `href="#how"` работает только на самом лендинге: с правовой страницы
 * он меняет хэш, роутер показывает лендинг — но родная прокрутка браузера к
 * якорю случается раньше, чем React успевает эту секцию отрисовать. Гоняться за
 * порядком кадров бессмысленно: страница ещё и сама сбрасывает прокрутку
 * наверх при смене раздела. Поэтому намерение просто откладывается, а забирает
 * его тот же эффект, который иначе увёл бы страницу в начало.
 */
let pendingAnchor: string | null = null;

/** Переход к секции лендинга откуда угодно. */
export function goAnchor(id: string): void {
  const onLanding = !(window.location.hash.replace(/^#\/?/, "").split("/")[0] in PAGES);

  if (onLanding) {
    const target = document.getElementById(id);
    if (target) scrollToSection(target);
    return;
  }

  pendingAnchor = id;
  go("/");
}

/** Забрать отложенный якорь — ровно один раз. */
export function consumePendingAnchor(): string | null {
  const anchor = pendingAnchor;
  pendingAnchor = null;
  return anchor;
}
