import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "./components/Reveal";
import { ConnectForm } from "./components/warehouses/ConnectForm";
import { ConnectPath } from "./components/warehouses/ConnectPath";
import { Inside } from "./components/warehouses/Inside";
import { LiveFlow } from "./components/warehouses/LiveFlow";
import { Questions } from "./components/warehouses/Questions";
import { Tariffs } from "./components/warehouses/Tariffs";
import { ru, useT, type Copy } from "./lib/copy";
import { href } from "./lib/route";

const T = {
  title: ru("Внедрим адаптивную систему управления складом"),
  lead: ru(
    "Хранение и учёт товара, сотрудники и задачи, связь с селлерами в одной системе. Адаптируем под ваши процессы. Три месяца бесплатно.",
  ),
  ctaConnect: ru("Подключить склад"),
  ctaInside: ru("Как устроена система"),
  heroNote: ru("Три месяца бесплатно с момента загрузки первых товаров"),

  painsTitle: ru("Склад работает, а учёт разбросан"),
  bridge: ru(
    "Типовые программы рассчитаны на средний склад: процессы приходится менять под программу. Уклад внедряется в ваши процессы и адаптируется под ваш склад.",
  ),

  offerTitle: ru("Систему, настроенную под ваш склад"),
  offerNote: ru("От вас нужно только короткое знакомство: расскажете, как устроен склад."),
  roadmapLink: ru("Дорожная карта"),

  endTitle: ru("Подключить склад"),
  endLead: ru(
    "Свяжемся в течение рабочего дня. Обсудим по телефону или в чате, как устроен ваш склад, и назовём дату подключения.",
  ),
};

const PAINS: { title: Copy; body: Copy }[] = [
  {
    title: ru("Учёт в Excel, чатах и разных программах"),
    body: ru(
      "Чтобы найти товар, проверить остаток, провести приёмку или отгрузку, приходится сверять несколько источников.",
    ),
  },
  {
    title: ru("Задачи ставятся устно, часы считаются отдельно"),
    body: ru(
      "Кто что сделал, не фиксируется. Рабочее время ведётся в другой программе или не ведётся вовсе.",
    ),
  },
  {
    title: ru("Ответы клиентам ищут по чатам"),
    body: ru(
      "Чтобы ответить про остатки и отгрузки, сотрудник ищет переписку в мессенджерах или вспоминает звонки.",
    ),
  },
];

/** Плитки с крупным числом: условия, которые склад сравнивает первыми. */
const NUMBERS: { value: Copy; unit: Copy; body: Copy }[] = [
  {
    value: ru("3"),
    unit: ru("месяца бесплатно"),
    body: ru("Отсчёт идёт с момента загрузки первых товаров, а не с даты заявки."),
  },
  {
    value: ru("4"),
    unit: ru("новые функции под ваш склад"),
    body: ru(
      "Например, новое поле в карточке товара, отчёт в вашей форме или свой бланк накладной. Каждая становится частью системы для всех складов.",
    ),
  },
  {
    value: ru("5"),
    unit: ru("рабочих дней на функцию"),
    body: ru("Критичные ошибки исправляем сразу."),
  },
  {
    value: ru("10–18"),
    unit: ru("чат в рабочие дни"),
    body: ru("Отвечаем по московскому времени."),
  },
];

/** Плитки без числа: то, что словом объясняется лучше, чем цифрой. */
const EXTRAS: { title: Copy; body: Copy; link?: boolean }[] = [
  {
    title: ru("Помогаем перенести склад в систему"),
    body: ru(
      "Настроить адреса ячеек, перенести товары и остатки из Excel или другой программы учёта, добавить сотрудников. Всё это можно сделать и самостоятельно; мы подключаемся там, где нужна помощь.",
    ),
  },
  {
    title: ru("Размещаем склад на витрине Уклада"),
    body: ru("У вас появляется ещё один источник клиентов."),
  },
  {
    title: ru("Открытая дорожная карта"),
    body: ru(
      "Что уже работает, что в работе и что будет дальше, видно на одной странице. Ваши функции появляются там же.",
    ),
    link: true,
  },
];

/**
 * Страница для складов — лендинг подключения и образец нового стиля витрины
 * (19 окт): светло-серое поле, целые поля синего вместо обводок, крупный
 * светлый гротеск. Токены — в `site.css` под `.wh`.
 *
 * Только по-русски: клиентов начинаем со складов в России. Порядок блоков:
 * боль → что получаете → путь с формой → что внутри → тарифы → вопросы →
 * форма. Все призывы ведут к форме в шаге «Заявка» (`#connect`): склад не
 * уходит со страницы, чтобы оставить заявку.
 */
export function WarehousesPage() {
  const t = useT();

  return (
    <div className="wh pb-3 pt-20 sm:pt-[72px]">
      {/* Первый экран — синее поле целиком, кабинет в рамке устройства.
          Белые полосы за рамкой — из референса Roombox: они дают полю
          глубину без градиента и тени. */}
      <section className="wh-blue relative mx-2 overflow-hidden sm:mx-3">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.14]">
          <span className="absolute -right-24 top-[18%] h-5 w-[70%] -rotate-[28deg] bg-white" />
          <span className="absolute -right-10 top-[62%] h-5 w-[55%] -rotate-[28deg] bg-white" />
          <span className="absolute right-[38%] top-0 h-full w-5 bg-white" />
        </div>

        <div className="relative mx-auto grid grid-cols-1 max-w-[1320px] items-center gap-12 px-5 py-14 sm:px-10 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16 lg:py-24">
          <Reveal>
            <h1 className="wh-h1 max-w-[17ch]">{t(T.title)}</h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/85">{t(T.lead)}</p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a href="#connect" className="wh-btn wh-btn--white group">
                {t(T.ctaConnect)}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="#inside" className="wh-btn wh-btn--ghost">
                {t(T.ctaInside)}
              </a>
            </div>
            <p className="mt-6 text-sm text-white/70">{t(T.heroNote)}</p>
          </Reveal>

          <Reveal delay={120}>
            <LiveFlow />
          </Reveal>
        </div>
      </section>

      {/* Боль: тихая колонка, без иконок — три утверждения. */}
      <section className="mx-auto mt-28 grid grid-cols-1 max-w-[1320px] gap-10 px-5 sm:mt-36 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <Reveal>
          <h2 className="wh-h2 max-w-[11ch] lg:sticky lg:top-28">{t(T.painsTitle)}</h2>
        </Reveal>
        <div className="flex flex-col gap-3">
          {PAINS.map((p, i) => (
            <Reveal key={p.title.ru} delay={i * 80} className="wh-tile p-6 sm:p-8">
              <h3 className="wh-h3">{t(p.title)}</h3>
              <p className="wh-muted mt-3 text-base leading-relaxed">{t(p.body)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal className="mx-auto mt-16 max-w-[1320px] px-5 sm:mt-24 sm:px-10">
        <p className="wh-statement max-w-4xl">{t(T.bridge)}</p>
      </Reveal>

      {/* Что получаете: числа — синими плитками во всю силу шрифта, как в
          референсе Denmar; остальное — белыми плитками словами. */}
      <section className="mx-auto mt-28 max-w-[1320px] px-5 sm:mt-36 sm:px-10">
        <Reveal>
          <h2 className="wh-h2 max-w-[14ch]">{t(T.offerTitle)}</h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map((n, i) => {
            const blue = i % 2 === 0;
            return (
              <Reveal
                key={n.unit.ru}
                as="article"
                delay={i * 70}
                className={`${blue ? "wh-blue" : "wh-tile"} flex min-h-[220px] flex-col p-6 sm:min-h-[300px] sm:p-7`}
              >
                <p
                  className={cn(
                    "wh-num",
                    !blue && "text-[var(--wh-blue)]",
                    // «10–18» вдвое длиннее одной цифры: тем же кеглем не влезает в строку.
                    n.value.ru.length > 2 && "!text-[clamp(52px,5vw,84px)]",
                  )}
                >
                  {t(n.value)}
                </p>
                <p className="mt-3 text-lg font-medium leading-snug">{t(n.unit)}</p>
                <p
                  className={`mt-auto pt-6 text-sm leading-relaxed ${blue ? "text-white/80" : "wh-muted"}`}
                >
                  {t(n.body)}
                </p>
              </Reveal>
            );
          })}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {EXTRAS.map((x, i) => (
            <Reveal
              key={x.title.ru}
              as="article"
              delay={i * 70}
              className="wh-tile flex flex-col p-6 sm:p-7"
            >
              <h3 className="wh-h3">{t(x.title)}</h3>
              <p className="wh-muted mt-3 text-base leading-relaxed">{t(x.body)}</p>
              {x.link && (
                <a
                  href={href("/roadmap")}
                  className="mt-5 inline-flex items-center gap-2 text-base font-medium text-[var(--wh-blue)] underline-offset-4 hover:underline"
                >
                  {t(T.roadmapLink)}
                  <ArrowRight className="size-4" />
                </a>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="wh-statement max-w-2xl">{t(T.offerNote)}</p>
          <a href="#connect" className="wh-btn wh-btn--blue group shrink-0">
            {t(T.ctaConnect)}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </Reveal>
      </section>

      <ConnectPath />
      <Inside />
      <Tariffs />
      <Questions />

      <section className="wh-blue mx-2 mt-28 sm:mx-3 sm:mt-36">
        <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 px-5 py-14 sm:px-10 sm:py-20 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <h2 className="wh-h2">{t(T.endTitle)}</h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white/85">{t(T.endLead)}</p>
          </div>
          <div className="-mx-3 min-w-0 rounded-[22px] bg-background p-4 text-foreground sm:mx-0 sm:p-8">
            <ConnectForm idPrefix="final" />
          </div>
        </div>
      </section>
    </div>
  );
}
