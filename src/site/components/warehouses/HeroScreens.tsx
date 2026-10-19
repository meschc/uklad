import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ru, useT, type Copy } from "../../lib/copy";
import { href } from "../../lib/route";
import { AsciiField } from "./AsciiField";

const T = {
  brand: ru("Уклад"),
  navInside: ru("Как устроена система"),
  navTariffs: ru("Тарифы"),
  navFaq: ru("Вопросы"),
  connect: ru("Подключить склад"),
  title: ru("Внедрим адаптивную систему управления складом"),
  lead: ru(
    "Хранение и учёт товара, сотрудники и задачи, связь с селлерами в одной системе. Три\u00a0месяца бесплатно.",
  ),
  look: ru("Посмотреть кабинет"),
  tabs: ru("Экраны кабинета"),
  alt: ru("Кабинет склада, экран «{label}»"),
};

/** Настоящие экраны демо-кабинета, снятые с `/app/` (19 окт). */
const SCREENS: { label: Copy; file: string; caption: Copy }[] = [
  {
    label: ru("План склада"),
    file: "plan.webp",
    caption: ru("План склада: у каждой ячейки адрес, по нему идут приёмка и сборка"),
  },
  {
    label: ru("Задания"),
    file: "tasks.webp",
    caption: ru("Заявки селлеров сгруппированы по назначению"),
  },
  {
    label: ru("Приёмка"),
    file: "receiving.webp",
    caption: ru("Приёмка со сверкой план-факт по каждой поставке"),
  },
  {
    label: ru("Чат с селлерами"),
    file: "chat.webp",
    caption: ru("Вопросы селлеров в одном чате, а не в мессенджерах"),
  },
  {
    label: ru("Сотрудники"),
    file: "staff.webp",
    caption: ru("Нагрузка сотрудников по фактам: приёмки, единицы, отгрузки"),
  },
];

const ROTATE_MS = 4500;

/**
 * Первый экран: синее поле во всю ширину со скруглением только снизу, своя
 * белая шапка поверх него и окно кабинета, которое заходит на следующий
 * блок. Окно стоит ровно по ширине колонки контента (решение 19 окт).
 *
 * Экраны листаются сами, пока посетитель не выберет вкладку: после клика
 * автолистание останавливается, иначе экран уедет из-под взгляда.
 */
export function HeroScreens() {
  const t = useT();
  const [screen, setScreen] = useState(0);
  const [auto, setAuto] = useState(true);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  // Один и тот же массив на все рендеры: иначе поле пересобиралось бы при
  // каждой смене экрана и квадраты рассыпались бы на полуслове.
  const quiet = useMemo(() => [navRef, titleRef, leadRef, tabsRef], []);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setScreen((s) => (s + 1) % SCREENS.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [auto]);

  const cur = SCREENS[screen];
  const label = t(cur.label);

  return (
    <>
      <section
        ref={heroRef}
        className="relative overflow-hidden rounded-b-[24px] bg-[var(--wh-blue)] text-white sm:rounded-b-[32px]"
      >
        <AsciiField quiet={quiet} className="text-white" />

        <div className="relative mx-auto max-w-[1280px] px-5 pb-[clamp(120px,22vw,340px)] sm:px-10">
          <header ref={navRef} className="flex items-center justify-between gap-6 py-5 sm:py-6">
            <a
              href={href("/")}
              className="flex items-center gap-2 text-xl font-semibold tracking-tight text-white"
            >
              <span className="block size-8 rounded-lg bg-white" aria-hidden />
              {t(T.brand)}
            </a>
            <nav className="flex items-center gap-8 text-sm">
              <a href="#inside" className="hidden text-white/85 hover:text-white md:inline">
                {t(T.navInside)}
              </a>
              <a href="#tariffs" className="hidden text-white/85 hover:text-white md:inline">
                {t(T.navTariffs)}
              </a>
              <a href="#faq" className="hidden text-white/85 hover:text-white md:inline">
                {t(T.navFaq)}
              </a>
              <a href="#connect" className="wh-btn wh-btn--white !h-10 !px-[18px] !text-sm">
                {t(T.connect)}
              </a>
            </nav>
          </header>

          <div className="flex flex-col gap-8 pt-10 sm:pt-[72px] lg:flex-row lg:items-end lg:justify-between lg:gap-16">
            <h1
              ref={titleRef}
              className="max-w-[15ch] text-[clamp(40px,4.8vw,64px)] font-normal leading-[0.98] tracking-[-0.045em] [text-wrap:balance]"
            >
              {t(T.title)}
            </h1>
            <div ref={leadRef} className="flex min-w-0 flex-col gap-5 lg:w-[470px] lg:shrink-0">
              <p className="text-[17px] leading-[1.55] text-white/85">{t(T.lead)}</p>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <a href="#connect" className="wh-btn wh-btn--white group">
                  {t(T.connect)}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a href="#inside" className="wh-btn wh-btn--ghost">
                  {t(T.look)}
                </a>
              </div>
            </div>
          </div>

          <div
            ref={tabsRef}
            role="tablist"
            aria-label={t(T.tabs)}
            className="mb-5 mt-12 flex gap-1.5 overflow-x-auto pb-1 sm:mt-16 sm:flex-wrap sm:overflow-visible"
          >
            {SCREENS.map((s, i) => {
              const on = i === screen;
              return (
                <button
                  key={s.file}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setScreen(i);
                    setAuto(false);
                  }}
                  className={cn(
                    "h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
                    on
                      ? "bg-white text-[var(--wh-blue)]"
                      : "bg-white/15 text-white hover:bg-white/25",
                  )}
                >
                  {t(s.label)}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Окно кабинета ровно по колонке контента. За ним — полоса тех же
          знаков, которые складываются в рамку: подсветка окна, а не второе
          поле. */}
      <div className="relative mx-auto -mt-[clamp(120px,22vw,340px)] max-w-[1280px] px-5 sm:px-10">
        <div className="relative">
          <AsciiField
            mode="frame"
            over={heroRef}
            className="-inset-4 h-[calc(100%+32px)] w-[calc(100%+32px)] text-[var(--wh-blue)] sm:-inset-9 sm:h-[calc(100%+72px)] sm:w-[calc(100%+72px)]"
          />
          <div className="relative overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgba(13,14,17,0.1),0_4px_12px_rgba(13,14,17,0.06)]">
            <div className="flex h-9 items-center gap-4 border-b border-[#ececef] px-3.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="block size-2.5 rounded-full bg-[#e3e4e8]" />
                <span className="block size-2.5 rounded-full bg-[#e3e4e8]" />
                <span className="block size-2.5 rounded-full bg-[#e3e4e8]" />
              </span>
              <span className="flex-1 truncate text-center font-mono text-xs text-[#5b5e66]">
                u-klad.ru/app · {label}
              </span>
              <span className="w-[42px]" aria-hidden />
            </div>
            <img
              src={`${import.meta.env.BASE_URL}photos/cabinet/${cur.file}`}
              alt={t(T.alt, { label })}
              width={1240}
              height={640}
              className="block aspect-[1240/640] w-full object-cover object-left-top"
            />
          </div>
        </div>
        <p className="wh-muted mt-4 text-[15px]">{t(cur.caption)}</p>
      </div>
    </>
  );
}
