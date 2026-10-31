import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { c, useT, type Copy } from "../../lib/copy";
import { href, routePath, switchLang, type Route } from "../../lib/route";
import { UkladLogoLive } from "@/components/brand/UkladLogoLive";
import { RollText } from "../RollText";

/**
 * Пункты шапки страниц в новом стиле. Склад раньше селлера — тот же порядок,
 * что в старой шапке и в карте сайта: покупатель Уклада — склад.
 */
const LINKS: { label: Copy; to: string }[] = [
  { to: "/warehouses", label: c("Складам", "For warehouses") },
  // Каталог складов скрыт до запуска (Кирилл 26 окт), страницы живут по адресу.
  { to: "/pricing", label: c("Тарифы", "Pricing") },
  { to: "/roadmap", label: c("Дорожная карта", "Roadmap") },
];

const T = {
  brand: c("Уклад", "Uklad"),
  menu: c("Меню", "Menu"),
  connect: c("Подключить склад", "Connect a warehouse"),
  // Подпись — на том языке, куда ведёт переключатель (как в старой шапке).
  switchTo: c("Switch to English", "Показать по-русски"),
};

/** Высота закреплённой шапки. */
export const SITE_NAV_H = 64;

/**
 * Шапка страниц витрины в новом стиле — по образцу страницы для складов.
 *
 * `tone="blue"` — белая шапка на синем; `tone="sticky"` — светлая
 * закреплённая (`SiteBar`). У каждой страницы своя композиция первого экрана
 * (Кирилл 22 окт), шапка у всех одна.
 */
/** Английскую версию отложили (Кирилл 23 окт): переключатель скрыт, страницы /en/ остаются. */
const SHOW_LANG = false;

export function SiteNav({
  route,
  tone,
  extra,
}: {
  route: Route;
  tone: "blue" | "sticky";
  /** Своё у страницы справа от кнопки, например вход на дорожной карте. */
  extra?: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const other = t.lang === "ru" ? "en" : "ru";
  const onBlue = tone === "blue";
  const here = routePath(route).replace(/\/+$/, "");
  // Шапка не пересоздаётся при переходе между страницами витрины: меню
  // закрываем сами, иначе оно накрывает страницу, на которую перешли.
  const [openedOn, setOpenedOn] = useState(here);
  if (openedOn !== here) {
    setOpenedOn(here);
    setOpen(false);
  }

  const onSwitchLang = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    switchLang(other);
  };

  const linkClass = onBlue
    ? "text-white/85 hover:text-white"
    : "text-[var(--wh-muted)] hover:text-[var(--wh-ink)]";

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-6">
        <a href={href("/")} className="flex items-center">
          <UkladLogoLive cell={20} tone={onBlue ? "white" : "blue"} label={t(T.brand)} />
        </a>
        <nav className="flex items-center gap-7 text-sm">
          {LINKS.map((l) => (
            <a
              key={l.to}
              href={href(l.to)}
              aria-current={here === l.to ? "page" : undefined}
              className={cn(
                "hidden transition-colors lg:inline",
                linkClass,
                here === l.to && (onBlue ? "text-white" : "text-[var(--wh-ink)]"),
              )}
            >
              {t(l.label)}
            </a>
          ))}
          {SHOW_LANG && (
            <a
              href={href(routePath(route), other)}
              hrefLang={other}
              onClick={onSwitchLang}
              aria-label={t(T.switchTo)}
              className={cn("hidden uppercase tracking-[0.08em] sm:inline", linkClass)}
            >
              {other}
            </a>
          )}
          <a
            href={`${href("/warehouses")}#connect`}
            className={cn(
              "wh-btn !h-10 !px-[18px] !text-sm max-sm:!hidden",
              onBlue ? "wh-btn--white" : "wh-btn--blue",
            )}
          >
            <RollText text={t(T.connect)} />
          </a>
          {extra}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t(T.menu)}
            aria-expanded={open}
            className={cn(
              "flex size-10 items-center justify-center rounded-full lg:hidden",
              onBlue ? "bg-white/15 text-white" : "bg-[var(--wh-soft)] text-[var(--wh-ink)]",
            )}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </nav>
      </div>

      {open && (
        <nav className="wh-swap absolute inset-x-0 top-full z-10 mt-3 flex flex-col rounded-2xl bg-[var(--wh-ground)] p-2 text-[var(--wh-ink)] shadow-[0_24px_50px_-20px_rgba(0,0,0,0.3)] lg:hidden">
          {LINKS.map((l) => (
            <a
              key={l.to}
              href={href(l.to)}
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm hover:bg-[var(--wh-soft)]"
            >
              {t(l.label)}
            </a>
          ))}
          <a
            href={`${href("/warehouses")}#connect`}
            onClick={() => setOpen(false)}
            className="rounded-xl px-4 py-2.5 text-sm text-[var(--wh-blue)] hover:bg-[var(--wh-soft)] sm:hidden"
          >
            {t(T.connect)}
          </a>
          {SHOW_LANG && (
            <a
              href={href(routePath(route), other)}
              hrefLang={other}
              onClick={onSwitchLang}
              className="rounded-xl px-4 py-2.5 text-sm text-[var(--wh-muted)] hover:bg-[var(--wh-soft)] sm:hidden"
            >
              {t(T.switchTo)}
            </a>
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * Закреплённая шапка витрины. На странице с синим первым экраном (`overBlue`)
 * она сначала прозрачная, с белыми ссылками, и поле знаков идёт под ней, а с
 * прокруткой становится полупрозрачной по теме, с размытием — как было до
 * объединения шапок (Кирилл 31 окт). Когда под шапку заходит синий низ
 * страницы (блок заявки или подвал), она становится цветом подвала: светлая
 * плашка поверх синего выглядела тяжёлой.
 */
export function SiteBar({
  route,
  extra,
  overBlue = false,
}: {
  route: Route;
  extra?: React.ReactNode;
  overBlue?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [atBottom, setAtBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 96);
      // Синий низ — блок заявки, а где его нет, подвал.
      const low = document.getElementById("connect") ?? document.querySelector("footer");
      setAtBottom(!!low && low.getBoundingClientRect().top <= SITE_NAV_H / 2);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const top = overBlue && !scrolled;
  const blue = top || atBottom;

  return (
    <header
      style={{ height: SITE_NAV_H }}
      className={cn(
        "sticky top-0 z-[60] border-b transition-colors duration-200 motion-reduce:transition-none",
        top
          ? "border-transparent bg-transparent"
          : atBottom
            ? "border-transparent bg-[color-mix(in_srgb,var(--wh-blue)_88%,transparent)] backdrop-blur-md"
            : "border-[var(--wh-line)] bg-[color-mix(in_srgb,var(--wh-ground)_88%,transparent)] backdrop-blur-md",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1280px] flex-col justify-center px-5 sm:px-10">
        <SiteNav route={route} tone={blue ? "blue" : "sticky"} extra={extra} />
      </div>
    </header>
  );
}
