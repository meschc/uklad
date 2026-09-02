import { useEffect } from "react";
import { LandingPage } from "./LandingPage";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { CookieBar } from "./components/CookieBar";
import { ContactsScreen } from "./components/ContactsScreen";
import { PricingScreen } from "./components/PricingScreen";
import { MarketScreen } from "./components/market/MarketScreen";
import { WarehouseScreen } from "./components/market/WarehouseScreen";
import { SellersPage } from "./SellersPage";
import { LegalScreen } from "./components/legal/LegalScreen";
import { NotFoundScreen } from "./components/NotFoundScreen";
import { LEGAL_BY_SLUG } from "./data/legal";
import { WAREHOUSES } from "./data/warehouses";
import { consumePendingAnchor, useRoute, type Page } from "./lib/route";
import { useTypography } from "./lib/typography";
import { useSystemTheme } from "./lib/theme";
import { scrollPageTop, scrollToSection, useSmoothScroll } from "./lib/useSmoothScroll";

const TITLES: Record<Page, string> = {
  landing: "Уклад — WMS для склада и витрина клиентов",
  sellers: "Селлеру — склад, который видно насквозь — Уклад",
  market: "Склады для фулфилмента — Уклад",
  warehouse: "Склад — Уклад",
  legal: "Правовая информация — Уклад",
  pricing: "Тарифы — Уклад",
  contacts: "Контакты — Уклад",
  notfound: "Страница не найдена — Уклад",
};

/**
 * Витрина целиком: страницы на хэше, общая шапка, подвал и баннер cookie.
 *
 * Заголовок вкладки меняется вместе со страницей — иначе десять вкладок с
 * одинаковым «Уклад» в истории браузера превращаются в лотерею. У правовых
 * документов заголовок ещё точнее: в истории должно быть видно, какой именно
 * документ человек открывал.
 */
export function SiteApp() {
  const route = useRoute();

  // Правило висячих предлогов — одно на всю витрину, включая тексты, которых
  // ещё нет: см. `lib/typography.ts`.
  useTypography();

  // Тема идёт за настройкой устройства и меняется вместе с ней, не дожидаясь
  // перезагрузки вкладки: см. `lib/theme.ts`.
  useSystemTheme();

  // Плавная прокрутка — на всю витрину: см. `lib/useSmoothScroll.ts`.
  useSmoothScroll();

  useEffect(() => {
    const doc = route.page === "legal" && route.id ? LEGAL_BY_SLUG[route.id] : undefined;
    if (doc) {
      document.title = `${doc.short} — Уклад`;
      return;
    }
    // У склада в заголовке его название: склады сравнивают в соседних вкладках,
    // и различать их приходится по корешку вкладки, где помещается слов пять.
    const w = route.page === "warehouse" && route.id
      ? WAREHOUSES.find((x) => x.id === route.id)
      : undefined;
    if (w) {
      document.title = `${w.name}, ${w.city} — Уклад`;
      return;
    }
    // Адрес указывает на конкретный склад или документ, а его нет. В истории
    // браузера и в корешке вкладки это должно быть видно: иначе человек вернётся
    // по закладке «Оферта» в тот же тупик, уверенный, что открывает оферту.
    const missing = Boolean(route.id) && (route.page === "legal" || route.page === "warehouse");
    document.title = missing ? TITLES.notfound : (TITLES[route.page] ?? TITLES.landing);
  }, [route.page, route.id]);

  // Смена страницы хэшем прокрутку не сбрасывает: без этого переход из подвала
  // лендинга открывал бы каталог сразу с его же подвала. В правовом разделе и
  // на складах сменой страницы считается и переход между документами или
  // складами — из списка в карточку и обратно.
  const scrollKey =
    route.page === "legal" || route.page === "warehouse"
      ? `${route.page}/${route.id ?? ""}`
      : route.page;

  useEffect(() => {
    // Если на лендинг пришли по ссылке на секцию — ведём к ней, а не наверх.
    const anchor = consumePendingAnchor();
    const target = anchor && document.getElementById(anchor);
    if (target) {
      scrollToSection(target);
      return;
    }
    scrollPageTop();
  }, [scrollKey]);

  return (
    <>
      <SiteHeader route={route} />
      {route.page === "landing" ? (
        <LandingPage />
      ) : (
        <main>
          {route.page === "sellers" && <SellersPage />}
          {route.page === "market" && <MarketScreen />}
          {route.page === "warehouse" && <WarehouseScreen id={route.id} />}
          {route.page === "legal" && <LegalScreen slug={route.id} />}
          {route.page === "pricing" && <PricingScreen />}
          {route.page === "contacts" && <ContactsScreen />}
          {route.page === "notfound" && (
            <NotFoundScreen caption="Ошибка 404" title="Такой страницы у нас нет">
              Адрес набран с ошибкой или раздел переехал. Всё, что есть на
              витрине, собрано в шапке и в подвале — оттуда до нужного места
              два клика.
            </NotFoundScreen>
          )}
        </main>
      )}
      <SiteFooter />
      <CookieBar />
    </>
  );
}
