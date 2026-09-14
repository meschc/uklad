import { warehousesRepository } from "../data/warehousesRepository";
import { CITIES } from "../data/cities";
import { LEGAL_DOCS } from "../data/legal";
import { ORG } from "../data/org";
import { BRAND } from "../data/brand";
import { Logo } from "./Logo";
import { anchorHref, href } from "../lib/route";
import { withBase } from "../lib/basePath";
import { openCookieSettings } from "../lib/cookieConsent";
import { c, useT, type Copy } from "../lib/copy";

interface Item {
  label: Copy;
  /** Страница витрины: `/pricing`. */
  to?: string;
  /** Секция лендинга. */
  anchor?: string;
  /** Готовый адрес — для того, что лежит вне витрины. */
  url?: string;
  /** Действие вместо перехода. Единственное: настройки cookie. */
  action?: () => void;
  /**
   * Ссылка остаётся русской на английской версии. Без пометки браузер прочитает
   * «Оферта» вслух по-английски, а поисковик посчитает страницу двуязычной.
   */
  ru?: boolean;
}

const COLUMNS: { title: Copy; items: Item[] }[] = [
  {
    title: c("Складу", "For warehouses"),
    items: [
      { label: c("Уклад для складов", "Uklad for warehouses"), to: "/warehouses" },
      { label: c("Демо WMS", "WMS demo"), url: withBase("app/") },
      { label: c("Тарифы", "Pricing"), to: "/pricing" },
      { label: c("Контакты", "Contacts"), to: "/contacts" },
    ],
  },
  {
    title: c("Селлеру", "For sellers"),
    items: [
      { label: c("Как это работает", "How it works"), to: "/sellers" },
      { label: c("Подобрать склад", "Find a warehouse"), to: "/market" },
      { label: c("Вопросы", "Questions"), anchor: "faq" },
    ],
  },
  {
    title: c("Правовая информация", "Legal"),
    items: [
      // Названия документов не переводятся вместе с витриной: это русские
      // правовые документы, и ссылка обязана называться так же, как то, что
      // по ней откроется.
      ...LEGAL_DOCS.map((doc) => ({
        label: c(doc.short, doc.short),
        to: `/legal/${doc.slug}`,
        ru: true,
      })),
      { label: c("Настройки cookie", "Cookie settings"), action: openCookieSettings },
    ],
  },
];

/**
 * Адрес пункта подвала. Подвал — карта сайта для робота: именно отсюда он
 * узнаёт про семь правовых документов и про демо, на которые больше ниоткуда
 * не ссылаются. Поэтому всё, что ведёт на страницу, — ссылка.
 */
function itemHref(item: Item): string | undefined {
  if (item.url) return item.url;
  if (item.anchor) return anchorHref(item.anchor);
  return item.to ? href(item.to) : undefined;
}

const T = {
  lead: c(
    "Маркетплейс фулфилмент-складов и WMS, на которой они работают. {n} {warehouses} в {c} {cities}.",
    "A marketplace of fulfilment warehouses and the WMS they run on. {n} {warehouses} in {c} {cities}.",
  ),
  demo: c(
    "Склады, цены и остатки на витрине — демонстрационные",
    "Warehouses, prices and stock here are demo data",
  ),
  fake: c(
    ", реквизиты в документах учебные",
    ", and the details in the documents are placeholders",
  ),
  logos: c(
    "Логотипы площадок принадлежат правообладателям.",
    "Marketplace logos belong to their owners.",
  ),
};

/**
 * Подвал.
 *
 * Кроме навигации несёт две обязательные вещи: реквизиты владельца сайта —
 * их требует ч. 2 ст. 10 149-ФЗ разместить так, чтобы посетитель мог найти их
 * без поиска, — и оговорку о характере данных.
 *
 * Оговорка на сайте ровно одна и стоит здесь. Раньше о демонстрационности
 * напоминали ещё и в вопросах, и под цифрами, и в карточках, и полосой поверх
 * каждого правового документа: страница сама себе не верила и повторяла это
 * читателю на каждом экране. Внизу сказано один раз — этого достаточно и для
 * честности, и для закона.
 *
 * По той же причине здесь единственный на сайте вход в демонстрацию системы.
 * Он был ещё в шапке, в финале лендинга и в блоке для складов, и всюду делил
 * внимание с действием, ради которого страница написана.
 */
export function SiteFooter() {
  const t = useT();
  const { total } = warehousesRepository.stats();

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            {t(T.lead, {
              n: total,
              warehouses: t.plural(
                total,
                ["склад", "склада", "складов"],
                ["warehouse", "warehouses"],
              ),
              c: CITIES.length,
              cities: t.plural(CITIES.length, ["городе", "городах", "городах"], ["city", "cities"]),
            })}
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title.ru} className="flex flex-col gap-2.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t(col.title)}
            </h3>
            {col.items.map((item) =>
              item.action ? (
                <button
                  key={item.label.ru}
                  lang={item.ru ? "ru" : undefined}
                  onClick={item.action}
                  className="text-left text-sm text-foreground/80 transition-colors hover:text-primary"
                >
                  {t(item.label)}
                </button>
              ) : (
                <a
                  key={item.label.ru}
                  lang={item.ru ? "ru" : undefined}
                  href={itemHref(item)}
                  className="text-sm text-foreground/80 transition-colors hover:text-primary"
                >
                  {t(item.label)}
                </a>
              ),
            )}
          </nav>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          {/* Реквизиты не переводятся: имя предпринимателя, адрес и номера в
              реестрах имеют силу ровно в том виде, в каком записаны в ЕГРИП —
              см. `data/org.ts`. Отсюда и пометка языка. */}
          <p lang="ru" className="text-xs leading-relaxed text-muted-foreground">
            {ORG.legalName} · ИНН {ORG.inn} · ОГРНИП {ORG.ogrnip} · {ORG.address} ·{" "}
            <a href={`mailto:${ORG.email}`} className="hover:text-primary">
              {ORG.email}
            </a>
          </p>
          <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} {t(BRAND)}
            </p>
            {/* Про реквизиты — только пока они заглушки: флаг `ORG.filled`
                поднимут вместе с настоящими, и оговорка снимется сама. */}
            <p>
              {t(T.demo)}
              {ORG.filled ? "" : t(T.fake)}. {t(T.logos)}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
