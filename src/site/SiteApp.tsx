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
import { WarehousesPage } from "./WarehousesPage";
import { LegalScreen } from "./components/legal/LegalScreen";
import { NotFoundScreen } from "./components/NotFoundScreen";
import { consumePendingAnchor, useRoute } from "./lib/route";
import { pageMeta } from "./lib/pageMeta";
import { setCanonical, setDescription, setLocale, setNoIndex, setTitle } from "./lib/meta";
import { useTypography } from "./lib/typography";
import { useSystemTheme } from "./lib/theme";
import { useLinkNavigation } from "./lib/useLinkNavigation";
import { scrollPageTop, scrollToSection, useSmoothScroll } from "./lib/useSmoothScroll";
import { c, useT } from "./lib/copy";

const T = {
  notFoundCaption: c("Ошибка 404", "Error 404"),
  notFoundTitle: c("Такой страницы у нас нет", "There is no such page"),
  notFoundBody: c(
    "Адрес набран с ошибкой или раздел переехал. Всё, что есть на витрине, собрано в шапке и в подвале.",
    "The address is mistyped, or the section has moved. Everything the site has is in the header and the footer.",
  ),
};

/**
 * Витрина целиком: страницы на путях, общая шапка, подвал и баннер cookie.
 *
 * Заголовок вкладки меняется вместе со страницей — иначе десять вкладок с
 * одинаковым «Уклад» в истории браузера превращаются в лотерею. У правовых
 * документов заголовок ещё точнее: в истории должно быть видно, какой именно
 * документ человек открывал.
 */
export function SiteApp() {
  const route = useRoute();
  const t = useT();

  // Правило висячих предлогов — одно на всю витрину, включая тексты, которых
  // ещё нет: см. `lib/typography.ts`.
  useTypography();

  // Тема идёт за настройкой устройства и меняется вместе с ней, не дожидаясь
  // перезагрузки вкладки: см. `lib/theme.ts`.
  useSystemTheme();

  // Плавная прокрутка — на всю витрину: см. `lib/useSmoothScroll.ts`.
  useSmoothScroll();

  // Переходы по обычным ссылкам без перезагрузки: см. `lib/useLinkNavigation.ts`.
  useLinkNavigation();

  // Шапку документа считает `lib/pageMeta` — тот же код, что и у предрендера.
  // Здесь остаётся только записать посчитанное в живой документ: человек ходит
  // по витрине без перезагрузок, и заголовок вкладки обязан идти за ним.
  useEffect(() => {
    const meta = pageMeta(route, t.lang);
    setLocale(t.lang);
    setTitle(meta.title);
    setDescription(meta.description);
    // Несуществующий адрес каноническим быть не может — его просто закрывают
    // от индексации.
    setNoIndex(meta.noindex);
    if (!meta.noindex) setCanonical(meta.ru, meta.en, t.lang);
  }, [route, t]);

  // `pushState` прокрутку не сбрасывает: без этого переход из подвала
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
          {route.page === "warehouses" && <WarehousesPage />}
          {route.page === "sellers" && <SellersPage />}
          {route.page === "market" && <MarketScreen />}
          {route.page === "warehouse" && <WarehouseScreen id={route.id} />}
          {route.page === "legal" && <LegalScreen slug={route.id} />}
          {route.page === "pricing" && <PricingScreen />}
          {route.page === "contacts" && <ContactsScreen />}
          {route.page === "notfound" && (
            <NotFoundScreen caption={t(T.notFoundCaption)} title={t(T.notFoundTitle)}>
              {t(T.notFoundBody)}
            </NotFoundScreen>
          )}
        </main>
      )}
      <SiteFooter />
      <CookieBar />
    </>
  );
}
