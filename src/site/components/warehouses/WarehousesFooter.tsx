import { useId, useState } from "react";
import { ArrowUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEGAL_DOCS } from "../../data/legal";
import { ORG } from "../../data/org";
import { openCookieSettings } from "../../lib/cookieConsent";
import { ru, useT, type Copy } from "../../lib/copy";
import { href } from "../../lib/route";

const T = {
  contactTitle: ru("Связь"),
  mail: ru("[почта]"),
  chat: ru("Чат в рабочие дни, 10–18 МСК"),
  product: ru("Продукт"),
  uklad: ru("Уклад"),
  legal: ru("Правовая информация"),
  docs: ru("Документы"),
  cookies: ru("Настройки cookie"),
  up: ru("Наверх"),
  copyright: ru("© {year} Уклад"),
  demo: ru("Склады, цены и остатки на витрине демонстрационные"),
  fake: ru(", реквизиты в документах учебные"),
};

const LINKS: { title: Copy; items: { label: Copy; to: string }[] }[] = [
  {
    title: T.product,
    items: [
      { label: ru("Как устроена система"), to: "#inside" },
      { label: ru("Тарифы"), to: "#tariffs" },
      { label: ru("Дорожная карта"), to: "/roadmap" },
    ],
  },
  {
    title: T.uklad,
    items: [
      { label: ru("Каталог складов"), to: "/market" },
      { label: ru("Селлерам"), to: "/sellers" },
      { label: ru("Контакты"), to: "/contacts" },
    ],
  },
];

/**
 * Единственный подвал страницы для складов (Кирилл 19 окт: «подвал должен
 * быть один»). Продолжает синий финальный блок и забирает у общего подвала
 * витрины всё обязательное: реквизиты владельца сайта (ч. 2 ст. 10 149-ФЗ),
 * ссылки на правовые документы, вход в настройки cookie и оговорку о
 * демонстрационных данных. Обязательное — мелко, нижней строкой, документы —
 * раскрывающимся списком.
 *
 * Стоит вне `main`, поэтому для вспомогательных технологий это настоящий
 * подвал страницы (`contentinfo`), как и общий.
 */
export function WarehousesFooter() {
  const t = useT();
  const [docsOpen, setDocsOpen] = useState(false);
  const docsId = useId();

  return (
    <footer className="overflow-hidden bg-[var(--wh-blue)] text-white">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-10">
        {/* Отделён от финального блока воздухом, а не линией: тонкая черта под
            карточкой заявки читалась как обрыв (Кирилл 19 окт). */}
        <div className="flex flex-wrap justify-between gap-8 pt-20 text-sm sm:pt-28">
          <div className="flex min-w-[200px] flex-1 flex-col gap-2.5">
            <span className="text-white/60">{t(T.contactTitle)}</span>
            <span className="text-xl tracking-[-0.02em]">{t(T.mail)}</span>
            <span className="text-white/70">{t(T.chat)}</span>
          </div>
          {LINKS.map((col) => (
            <nav
              key={col.title.ru}
              aria-label={t(col.title)}
              className="flex min-w-[160px] flex-col gap-2.5"
            >
              <span className="text-white/60">{t(col.title)}</span>
              {col.items.map((l) => (
                <a
                  key={l.label.ru}
                  href={l.to.startsWith("#") ? l.to : href(l.to)}
                  className="text-white hover:underline"
                >
                  {t(l.label)}
                </a>
              ))}
            </nav>
          ))}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-label={t(T.up)}
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white text-[var(--wh-blue)]"
          >
            <ArrowUp className="size-5" />
          </a>
        </div>

        {/* Обязательное — одной строкой (Кирилл 19 окт: длинный список
            документов «выглядит плохо»). Семь документов прячутся под
            «Документы», ссылки остаются в разметке и для робота. */}
        <div className="mt-12 flex flex-col gap-3 text-xs leading-relaxed text-white/60">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>{t(T.copyright, { year: new Date().getFullYear() })}</span>
            <button
              type="button"
              aria-expanded={docsOpen}
              aria-controls={docsId}
              onClick={() => setDocsOpen((v) => !v)}
              className="inline-flex items-center gap-1 hover:text-white"
            >
              {t(T.docs)}
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-300 motion-reduce:transition-none",
                  docsOpen && "rotate-180",
                )}
              />
            </button>
            <button type="button" onClick={openCookieSettings} className="hover:text-white">
              {t(T.cookies)}
            </button>
            {/* Реквизиты не переводятся: см. `data/org.ts` и общий подвал. */}
            <span lang="ru" className="sm:ml-auto">
              {ORG.legalName} · ИНН {ORG.inn} ·{" "}
              <a href={`mailto:${ORG.email}`} className="hover:text-white">
                {ORG.email}
              </a>
            </span>
          </div>
          <nav
            id={docsId}
            aria-label={t(T.legal)}
            hidden={!docsOpen}
            className={cn(
              "gap-x-6 gap-y-1.5 rounded-xl bg-white/10 p-4 sm:grid-cols-2 lg:grid-cols-4",
              docsOpen ? "grid" : "hidden",
            )}
          >
            {LEGAL_DOCS.map((doc) => (
              <a key={doc.slug} href={href(`/legal/${doc.slug}`)} className="hover:text-white">
                {doc.short}
              </a>
            ))}
          </nav>
          <p>
            {t(T.demo)}
            {ORG.filled ? "" : t(T.fake)}.
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="mt-2 h-[0.6em] select-none overflow-hidden whitespace-nowrap px-6 text-center text-[27vw] font-semibold leading-[0.72] tracking-[-0.07em] text-white/[0.14]"
      >
        {t(T.uklad)}
      </div>
    </footer>
  );
}
