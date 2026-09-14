import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { anchorHref, href, routePath, switchLang, type Route } from "../lib/route";
import { c, useT, type Copy } from "../lib/copy";

/**
 * Пункты меню. На лендинге это якоря его же секций, на остальных страницах
 * якорям вести некуда — там короткий набор ссылок на соседние разделы.
 *
 * «Складам» стоит раньше «Селлеру» и это не случайность: покупатель Уклада —
 * склад, он берёт систему и вместе с ней поток клиентов. Селлеру нужна своя
 * ветка, но не первая строчка меню.
 */
interface Link {
  label: Copy;
  /** Секция лендинга. */
  anchor?: string;
  /** Страница витрины. */
  to?: string;
}

const LANDING_LINKS: Link[] = [
  { anchor: "how", label: c("Как это работает", "How it works") },
  // Обе стороны маркетплейса ведут на свои страницы, а не в секцию лендинга:
  // секция отвечает «зачем складу система», страница — «как это устроено».
  { to: "/warehouses", label: c("Складам", "For warehouses") },
  { to: "/sellers", label: c("Селлеру", "For sellers") },
  { anchor: "warehouses", label: c("Витрина", "Marketplace") },
  { to: "/pricing", label: c("Тарифы", "Pricing") },
  { anchor: "faq", label: c("Вопросы", "FAQ") },
];

const PAGE_LINKS: Link[] = [
  { to: "/warehouses", label: c("Складам", "For warehouses") },
  { to: "/sellers", label: c("Селлеру", "For sellers") },
  { to: "/pricing", label: c("Тарифы", "Pricing") },
  { to: "/contacts", label: c("Контакты", "Contacts") },
  { to: "/legal", label: c("Правовая информация", "Legal") },
];

const T = {
  home: c("На главную", "Home"),
  menu: c("Меню", "Menu"),
  cta: c("Подобрать склад", "Find a warehouse"),
  // Подпись переключателя написана на том языке, куда он ведёт, а не на том,
  // на котором страница: человек, открывший русскую версию по ошибке, ищет
  // глазами знакомое слово, а не перевод незнакомого.
  switchTo: c("Switch to English", "Показать по-русски"),
};

/**
 * Шапка витрины. Прозрачная поверх первого экрана и «стеклянная» после
 * прокрутки: над героем фон шапки резал бы градиент пополам, а над белым
 * текстом контента прозрачная шапка перестаёт читаться.
 */
export function SiteHeader({ route }: { route: Route }) {
  const t = useT();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const onLanding = route.page === "landing";
  const links = onLanding ? LANDING_LINKS : PAGE_LINKS;
  const other = t.lang === "ru" ? "en" : "ru";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Меню на телефоне закрывается при переходе: иначе оно осталось бы поверх
  // страницы, на которую только что ушли. Закрываем прямо в рендере, а не в
  // эффекте: эффект успел бы показать новую страницу с раскрытым меню поверх.
  const routeKey = `${route.page}:${route.id ?? ""}`;
  const [lastRoute, setLastRoute] = useState(routeKey);
  if (routeKey !== lastRoute) {
    setLastRoute(routeKey);
    setOpen(false);
  }

  // Адрес пункта меню. Якорь секции тоже адрес, а не действие: ссылка `/#faq`
  // работает и с других страниц, и в новой вкладке.
  const linkHref = (link: Link) => (link.anchor ? anchorHref(link.anchor) : href(link.to ?? "/"));

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color,box-shadow] duration-300",
        scrolled || !onLanding
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <a
          href={href("/")}
          aria-label={t(T.home)}
          className="shrink-0 rounded-full outline-none ring-primary/40 ring-offset-2 ring-offset-background focus-visible:ring-2"
        >
          <Logo />
        </a>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((l) => (
            <a
              key={l.anchor ?? l.to}
              href={linkHref(l)}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {t(l.label)}
            </a>
          ))}
        </nav>

        {/* Действие в шапке ровно одно. Рядом с ним стояла ещё ссылка на
            демонстрацию системы, и две кнопки подряд делили внимание пополам:
            человек, пришедший за складом, выбирал между «подобрать» и
            «посмотреть», хотя посмотреть ему нечего. Вход в демонстрацию
            остался в подвале — там его ищут те, кому она и нужна. */}
        <div className="ml-auto flex items-center gap-2">
          {/* Переключатель языка — двумя буквами: это служебная метка, а не
              пункт меню, и она не должна спорить за внимание с единственным
              действием шапки. Показываем язык, куда ведёт кнопка, а не
              текущий: «EN» рядом с русским текстом читается однозначно, «RU»
              рядом с ним — как утверждение, а не как ссылка. */}
          {/* Ссылка, а не кнопка: у английской версии свой адрес, и робот
              должен по нему пройти — иначе она в выдачу не попадёт вовсе.
              `hreflang` подсказывает, что за язык на том конце. */}
          <a
            href={href(routePath(route), other)}
            hrefLang={other}
            onClick={(e) => {
              // Переключение — не переход: адрес и язык меняются вместе, одним
              // `replaceState`, чтобы «назад» вело на предыдущую страницу, а не
              // на эту же по-русски.
              e.preventDefault();
              switchLang(other);
            }}
            aria-label={t(T.switchTo)}
            className="rounded-full px-2.5 py-2 text-[13px] font-medium uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
          >
            {other}
          </a>

          {/* `whitespace-nowrap` здесь не для красоты: на узком экране
              «Подобрать склад» переносилось по пробелу, и единственное
              действие шапки превращалось в двухэтажную пилюлю вдвое выше
              соседей — шапка ехала следом. Отступы на мобильном ужаты, чтобы
              строка в одну линию поместилась рядом с логотипом и меню. */}
          <a
            href={href("/market")}
            className="group relative whitespace-nowrap rounded-full bg-foreground px-3 py-2 text-[13px] font-medium text-background transition-colors hover:bg-foreground/85 sm:px-4"
          >
            {t(T.cta)}
          </a>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={t(T.menu)}
            aria-expanded={open}
            className="rounded-full border border-foreground/[0.14] p-2.5 text-muted-foreground transition-colors hover:border-foreground/30 lg:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {/* Тень у выпадающего меню обязательна: без неё панель садится вплотную
          к тексту страницы, обрезает его по строке — и читается не как слой
          поверх, а как сбой вёрстки. */}
      {open && (
        <nav className="animate-fade-in border-t border-border bg-background/95 px-4 py-2 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.22)] backdrop-blur-xl dark:shadow-[0_24px_50px_-20px_rgba(0,0,0,0.9)] lg:hidden">
          {links.map((l) => (
            <a
              key={l.anchor ?? l.to}
              href={linkHref(l)}
              onClick={() => setOpen(false)}
              className="block w-full rounded-full px-4 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {t(l.label)}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
