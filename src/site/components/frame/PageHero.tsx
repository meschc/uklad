import { useMemo, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Route } from "../../lib/route";
import { Reveal } from "../Reveal";
import { AsciiField } from "../warehouses/AsciiField";
import { SiteNav } from "./SiteNav";

/**
 * Синий первый экран страниц витрины в новом стиле (образец — страница для
 * складов): во всю ширину, скруглён только снизу, под ним ASCII-волны. Под
 * шапкой и текстом знаки прозрачнее — текст читается.
 *
 * `overlap` — на сколько пикселей следующий блок заезжает на синее: нижний
 * отступ первого экрана растёт ровно на столько, а блок сам ставит себе такой
 * же отрицательный отступ.
 */
export function PageHero({
  route,
  eyebrow,
  title,
  lead,
  children,
  overlap = 0,
}: {
  route: Route;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Действия под подводкой. */
  children?: ReactNode;
  overlap?: number;
}) {
  const navRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const quiet = useMemo(() => [navRef, textRef], []);

  return (
    <section className="relative rounded-b-[24px] bg-[var(--wh-blue)] text-white sm:rounded-b-[32px]">
      {/* Поле обрезается своей обёрткой, а не всем блоком: иначе обрезалось
          бы и выпадающее меню шапки на телефоне. */}
      <div className="absolute inset-0 overflow-hidden rounded-b-[24px] sm:rounded-b-[32px]">
        <AsciiField quiet={quiet} />
      </div>
      <div
        className="relative mx-auto max-w-[1280px] px-5 sm:px-10"
        style={{ paddingBottom: `calc(clamp(56px, 8vw, 104px) + ${overlap}px)` }}
      >
        <header ref={navRef} className="relative z-20 py-5 sm:py-6">
          <SiteNav route={route} tone="blue" />
        </header>

        <Reveal className="pt-8 sm:pt-14">
          <div
            ref={textRef}
            className={cn(
              "flex flex-col gap-6",
              (lead || children) && "lg:flex-row lg:items-end lg:justify-between lg:gap-16",
            )}
          >
            <div className="min-w-0">
              {eyebrow && <div className="mb-4 text-sm text-white/70">{eyebrow}</div>}
              <h1 className="max-w-[18ch] text-[clamp(38px,4.6vw,64px)] font-normal leading-[0.98] tracking-[-0.045em] [text-wrap:balance]">
                {title}
              </h1>
            </div>
            {(lead || children) && (
              <div className="flex min-w-0 flex-col gap-5 lg:w-[470px] lg:shrink-0">
                {lead && <p className="text-[17px] leading-[1.55] text-white/85">{lead}</p>}
                {children}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
