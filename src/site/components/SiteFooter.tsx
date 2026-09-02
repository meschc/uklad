import { WAREHOUSES } from "../data/warehouses";
import { CITIES } from "../data/cities";
import { LEGAL_DOCS } from "../data/legal";
import { ORG } from "../data/org";
import { Logo } from "./Logo";
import { go, goAnchor, goMarket } from "../lib/route";
import { plural } from "../lib/plural";
import { openCookieSettings } from "../lib/cookieConsent";

interface Item {
  label: string;
  /** Внешний адрес или якорь лендинга. */
  href?: string;
  /** Переход внутри витрины. */
  action?: () => void;
}

const COLUMNS: { title: string; items: Item[] }[] = [
  {
    title: "Складу",
    items: [
      { label: "Уклад для складов", action: () => goAnchor("operators") },
      { label: "Демо WMS", href: `${import.meta.env.BASE_URL}app/` },
      { label: "Тарифы", action: () => go("/pricing") },
      { label: "Контакты", action: () => go("/contacts") },
    ],
  },
  {
    title: "Селлеру",
    items: [
      { label: "Как это работает", action: () => go("/sellers") },
      { label: "Подобрать склад", action: () => goMarket() },
      { label: "Вопросы", action: () => goAnchor("faq") },
    ],
  },
  {
    title: "Правовая информация",
    items: [
      ...LEGAL_DOCS.map((doc) => ({
        label: doc.short,
        action: () => go(`/legal/${doc.slug}`),
      })),
      { label: "Настройки cookie", action: openCookieSettings },
    ],
  },
];

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
  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1.1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Маркетплейс фулфилмент-складов и WMS, на которой они работают.
            {" "}
            {WAREHOUSES.length}{" "}
            {plural(WAREHOUSES.length, "склад", "склада", "складов")} в{" "}
            {CITIES.length}{" "}
            {plural(CITIES.length, "городе", "городах", "городах")}.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} className="flex flex-col gap-2.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {col.title}
            </h3>
            {col.items.map((item) =>
              item.action ? (
                <button
                  key={item.label}
                  onClick={item.action}
                  className="text-left text-sm text-foreground/80 transition-colors hover:text-primary"
                >
                  {item.label}
                </button>
              ) : (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm text-foreground/80 transition-colors hover:text-primary"
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {ORG.legalName} · ИНН {ORG.inn} · ОГРН {ORG.ogrn} · {ORG.address} ·{" "}
            <a href={`mailto:${ORG.email}`} className="hover:text-primary">
              {ORG.email}
            </a>
          </p>
          <div className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Уклад</p>
            {/* Про реквизиты — только пока они заглушки: флаг `ORG.filled`
                поднимут вместе с настоящими, и оговорка снимется сама. */}
            <p>
              Склады, цены и остатки на витрине — демонстрационные
              {ORG.filled ? "" : ", реквизиты в документах учебные"}. Логотипы
              площадок принадлежат их правообладателям.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
