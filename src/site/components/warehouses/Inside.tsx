import type { ReactNode } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { LogoMark } from "../Logo";
import { Reveal } from "../Reveal";
import { ru, useT, type Copy } from "../../lib/copy";
import { href } from "../../lib/route";
import { DEMO_HREF } from "./HeroScreens";

const T = {
  title: ru("Товар, сотрудники и селлеры"),
  titleTail: ru("в одном кабинете"),
  brand: ru("Уклад"),
  showcaseTitle: ru("Ваш склад на витрине Уклада"),
  showcaseBody: ru(
    "Селлеры ищут склад по городу, условиям и цене. Карточка вашего склада появляется в каталоге после подключения.",
  ),
  showcaseLink: ru("Открыть каталог →"),
  demo: ru("Посмотреть демо"),
};

/**
 * Четыре ветки системы деревом от «Уклада» (решение 19 окт), у каждой —
 * кусочек интерфейса вместо иконки. Только то, что в кабинете уже есть:
 * учёта рабочих часов здесь нет, пока нет функции (узел `cab-hours`).
 */
const BRANCHES: { title: Copy; body: Copy; ui: ReactNode }[] = [
  {
    title: ru("Хранение и учёт товара"),
    body: ru("У каждой ячейки адрес. Приёмка, размещение, сборка и отгрузка идут по нему."),
    ui: <CellsUi />,
  },
  {
    title: ru("Сотрудники и задачи"),
    body: ru("Задачи на приёмку и сборку, нагрузка по факту: кто сколько принял и отгрузил."),
    ui: <StaffUi />,
  },
  {
    title: ru("Связь с селлерами"),
    body: ru("Клиент сам видит остатки, оставляет заявку и пишет в чат. Вы отвечаете там же."),
    ui: <ChatUi />,
  },
  {
    title: ru("Документооборот"),
    body: ru("Лист приёмки, лист сборки и накладная формируются из данных системы."),
    ui: <DocsUi />,
  },
];

/** Центры колонок сетки из четырёх при ширине 1200 и зазоре 24 (в долях 1000). */
const BRANCH_X = [117.5, 352.5, 647.5, 882.5];

const SHOW_CATALOG = false;

export function Inside() {
  const t = useT();

  return (
    <section
      id="inside"
      className="mx-auto mt-24 max-w-[1280px] scroll-mt-24 px-5 sm:mt-32 sm:px-10"
    >
      <Reveal>
        <h2 className="wh-h2 mx-auto text-center">
          <span className="sm:block">{t(T.title)}</span> {t(T.titleTail)}
        </h2>
      </Reveal>

      <div className="mt-12 flex justify-center sm:mt-16">
        <div className="inline-flex h-14 items-center gap-2.5 rounded-2xl bg-[var(--wh-blue)] pl-3 pr-6 text-xl font-semibold tracking-tight text-white">
          <LogoMark className="rounded-lg ring-1 ring-white/40" />
          {t(T.brand)}
        </div>
      </div>

      {/* Плавные ветки к четырём колонкам. На узком экране колонки встают
          друг под друга, и ветки теряют смысл — их там нет. */}
      <svg
        viewBox="0 0 1000 140"
        preserveAspectRatio="none"
        className="hidden h-[120px] w-full overflow-visible lg:block"
        aria-hidden
      >
        <g fill="none" stroke="var(--wh-blue)" strokeWidth="2" strokeLinecap="round">
          {BRANCH_X.map((x) => (
            <path
              key={x}
              d={`M500 0 C500 80, ${x} 60, ${x} 140`}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      </svg>

      <div className="mt-12 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:mt-0 lg:grid-cols-4 lg:gap-6">
        {BRANCHES.map((b, i) => (
          <Reveal
            key={b.title.ru}
            delay={i * 70}
            className="flex flex-col items-center text-center"
          >
            <div className="w-full max-w-[260px] rounded-[18px] bg-[var(--wh-soft)] text-left">
              {b.ui}
            </div>
            <h3 className="mt-6 text-xl font-medium tracking-[-0.02em]">{t(b.title)}</h3>
            <p className="wh-muted mt-2 text-[15px] leading-relaxed">{t(b.body)}</p>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-12 flex justify-center sm:mt-14">
        <a href={DEMO_HREF} className="wh-btn wh-btn--soft group">
          {t(T.demo)}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </a>
      </Reveal>

      {/* Плашка каталога скрыта, пока витрина складов не запущена (26 окт). */}
      {SHOW_CATALOG && (
        <Reveal className="mt-16 flex flex-col gap-6 rounded-[22px] p-6 shadow-[inset_0_0_0_1.5px_var(--wh-blue)] sm:mt-[72px] sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
          <div className="flex items-center gap-5">
            <MapPin className="size-9 shrink-0 text-[var(--wh-blue)]" strokeWidth={1.6} />
            <div>
              <h3 className="text-xl font-medium tracking-[-0.02em]">{t(T.showcaseTitle)}</h3>
              <p className="wh-muted mt-1.5 text-[15px] leading-relaxed">{t(T.showcaseBody)}</p>
            </div>
          </div>
          <a
            href={href("/market")}
            className="shrink-0 text-[15px] font-medium text-[var(--wh-blue)] hover:underline"
          >
            {t(T.showcaseLink)}
          </a>
        </Reveal>
      )}
    </section>
  );
}

/* Кусочки интерфейса: та же раскладка, что в кабинете, но без данных.
   Плашка серая, детали белые, акцент синий — как у остальных иллюстраций. */

function CellsUi() {
  return (
    <div className="p-4">
      <div className="grid grid-cols-5 gap-1" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`block h-[18px] rounded-[3px] ${i === 2 ? "bg-[var(--wh-blue)]" : "bg-[var(--wh-tile)] shadow-[inset_0_0_0_1px_var(--wh-line)]"}`}
          />
        ))}
      </div>
      <p className="mt-3 font-mono text-[15px] font-medium text-[var(--wh-blue)]">B-01-02-03</p>
    </div>
  );
}

function StaffUi() {
  const people = [
    { name: "Алексей Ким", units: "339 ед.", share: 92 },
    { name: "Дарья Кузьмина", units: "297 ед.", share: 80 },
  ];
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 text-[13px]">
      {people.map((p) => (
        <div key={p.name}>
          <div className="flex justify-between">
            <span>{p.name}</span>
            <span className="wh-muted">{p.units}</span>
          </div>
          <div className="mt-1 h-1 rounded-sm bg-[var(--wh-tile)] shadow-[inset_0_0_0_1px_var(--wh-line)]">
            <div className="h-1 rounded-sm bg-[var(--wh-blue)]" style={{ width: `${p.share}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatUi() {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-3.5 text-[13px]">
      <span className="self-start rounded-[12px_12px_12px_4px] bg-[var(--wh-tile)] px-2.5 py-1.5 shadow-[inset_0_0_0_1px_var(--wh-line)]">
        Поставка уже принята?
      </span>
      <span className="self-end rounded-[12px_12px_4px_12px] bg-[var(--wh-blue)] px-2.5 py-1.5 text-white">
        Да, 120 из 120, всё на местах
      </span>
    </div>
  );
}

function DocsUi() {
  const docs = ["Лист приёмки", "Лист сборки", "Накладная"];
  return (
    <div className="flex flex-col px-4 py-3 text-[13px]">
      {docs.map((d, i) => (
        <span
          key={d}
          className={`flex justify-between py-1.5 ${i < docs.length - 1 ? "border-b border-[var(--wh-line)]" : ""}`}
        >
          <span>{d}</span>
          <span className="font-mono text-[var(--wh-blue)]">PDF</span>
        </span>
      ))}
    </div>
  );
}
