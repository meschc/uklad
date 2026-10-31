import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ru, useT } from "../../lib/copy";
import { href } from "../../lib/route";
import { UkladLogoLive } from "@/components/brand/UkladLogoLive";

const T = {
  brand: ru("Уклад"),
  navInside: ru("Как устроена система"),
  navTariffs: ru("Тарифы"),
  navFaq: ru("Вопросы"),
  connect: ru("Подключить склад"),
};

/** Высота закреплённой шапки: под неё встают закреплённые заголовки таблиц. */
export const STICKY_NAV_H = 64;

/**
 * Шапка, закреплённая на всём протяжении страницы (Кирилл, 20 окт). Своя
 * шапка первого экрана живёт внутри синего блока с `overflow-hidden` и
 * закрепиться не может, поэтому эта выезжает сверху, как только та ушла из
 * вида, и прячется, когда посетитель снова наверху.
 */
export function StickyNav() {
  const t = useT();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 96);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      aria-hidden={!shown}
      {...(shown ? {} : { inert: "" })}
      style={{ height: STICKY_NAV_H }}
      className={cn(
        "fixed inset-x-0 top-0 z-[60] border-b border-[var(--wh-line)] bg-[color-mix(in_srgb,var(--wh-ground)_88%,transparent)] backdrop-blur-md transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        shown ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between gap-6 px-5 sm:px-10">
        <a href={href("/")} className="flex items-center">
          <UkladLogoLive cell={18} label={t(T.brand)} />
        </a>
        <nav className="flex items-center gap-8 text-sm">
          <a href="#inside" className="wh-muted hidden hover:text-[var(--wh-ink)] md:inline">
            {t(T.navInside)}
          </a>
          <a href="#tariffs" className="wh-muted hidden hover:text-[var(--wh-ink)] md:inline">
            {t(T.navTariffs)}
          </a>
          <a href="#faq" className="wh-muted hidden hover:text-[var(--wh-ink)] md:inline">
            {t(T.navFaq)}
          </a>
          <a href="#connect" className="wh-btn wh-btn--blue !h-10 !px-[18px] !text-sm">
            {t(T.connect)}
          </a>
        </nav>
      </div>
    </div>
  );
}
