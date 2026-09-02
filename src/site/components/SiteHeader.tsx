import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { go, goAnchor, goMarket, type Route } from "../lib/route";
import { scrollPageTop } from "../lib/useSmoothScroll";

/**
 * Пункты меню. На лендинге это якоря его же секций, на остальных страницах
 * якорям вести некуда — там короткий набор ссылок на соседние разделы.
 *
 * «Складам» стоит раньше «Селлеру» и это не случайность: покупатель Уклада —
 * склад, он берёт систему и вместе с ней поток клиентов. Селлеру нужна своя
 * ветка, но не первая строчка меню.
 */
interface Link {
  label: string;
  /** Секция лендинга. */
  anchor?: string;
  /** Страница витрины. */
  to?: string;
}

const LANDING_LINKS: Link[] = [
  { anchor: "how", label: "Как это работает" },
  { anchor: "operators", label: "Складам" },
  { to: "/sellers", label: "Селлеру" },
  { anchor: "warehouses", label: "Витрина" },
  { to: "/pricing", label: "Тарифы" },
  { anchor: "faq", label: "Вопросы" },
];

const PAGE_LINKS: Link[] = [
  { to: "/sellers", label: "Селлеру" },
  { to: "/pricing", label: "Тарифы" },
  { to: "/contacts", label: "Контакты" },
  { to: "/legal", label: "Правовая информация" },
];

/**
 * Шапка витрины. Прозрачная поверх первого экрана и «стеклянная» после
 * прокрутки: над героем фон шапки резал бы градиент пополам, а над белым
 * текстом контента прозрачная шапка перестаёт читаться.
 */
export function SiteHeader({ route }: { route: Route }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const onLanding = route.page === "landing";
  const links = onLanding ? LANDING_LINKS : PAGE_LINKS;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Меню на телефоне закрывается при переходе: иначе оно осталось бы поверх
  // страницы, на которую только что ушли.
  useEffect(() => setOpen(false), [route.page, route.id]);

  const follow = (link: Link) => {
    setOpen(false);
    if (link.anchor) goAnchor(link.anchor);
    else if (link.to) go(link.to);
  };

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
        <button
          onClick={() => {
            go("/");
            // Единственный переход, где прокрутка едет, а не прыгает: с
            // лендинга на лендинг страница не меняется, и мгновенный скачок
            // наверх выглядел бы как перезагрузка.
            scrollPageTop(false);
          }}
          aria-label="На главную"
          className="shrink-0 rounded-full outline-none ring-primary/40 ring-offset-2 ring-offset-background focus-visible:ring-2"
        >
          <Logo />
        </button>

        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {links.map((l) => (
            <button
              key={l.label}
              onClick={() => follow(l)}
              className="rounded-full px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {l.label}
            </button>
          ))}
        </nav>

        {/* Действие в шапке ровно одно. Рядом с ним стояла ещё ссылка на
            демонстрацию системы, и две кнопки подряд делили внимание пополам:
            человек, пришедший за складом, выбирал между «подобрать» и
            «посмотреть», хотя посмотреть ему нечего. Вход в демонстрацию
            остался в подвале — там его ищут те, кому она и нужна. */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => goMarket()}
            className="group relative rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-colors hover:bg-foreground/85"
          >
            Подобрать склад
          </button>

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Меню"
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
            <button
              key={l.label}
              onClick={() => follow(l)}
              className="block w-full rounded-full px-4 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {l.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
