import { ArrowRight, ClipboardList, MessageSquareText, Sheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eyebrow } from "@/components/ui/eyebrow";
import { CtaLink } from "./components/CtaLink";
import { Reveal } from "./components/Reveal";
import { SectionHead } from "./components/SectionHead";
import { PlanShowcase } from "./components/landing/PlanShowcase";
import { ConnectForm } from "./components/warehouses/ConnectForm";
import { ConnectPath } from "./components/warehouses/ConnectPath";
import { Inside } from "./components/warehouses/Inside";
import { Questions } from "./components/warehouses/Questions";
import { Tariffs } from "./components/warehouses/Tariffs";
import { ru, useT, type Copy } from "./lib/copy";
import { href } from "./lib/route";

const T = {
  eyebrow: ru("Бесплатное подключение складов"),
  // Заголовок разрезан надвое: вторая половина набрана акцентным цветом.
  titleTop: ru("Внедрим"),
  titleAccent: ru("адаптивную систему управления складом"),
  lead: ru(
    "Хранение и учёт товара, сотрудники и задачи, связь с селлерами в одной системе. Адаптируем под ваши процессы. Три месяца бесплатно.",
  ),
  ctaConnect: ru("Подключить склад"),
  ctaInside: ru("Как устроена система"),
  heroNote: ru("Три месяца бесплатно с момента загрузки первых товаров"),

  painsEyebrow: ru("Знакомо?"),
  painsTitle: ru("Склад работает, а учёт разбросан"),
  bridge: ru(
    "Типовые программы рассчитаны на средний склад: процессы приходится менять под программу. Уклад внедряется в ваши процессы и адаптируется под ваш склад.",
  ),

  offerEyebrow: ru("Что вы получаете"),
  offerTitle: ru("Систему, настроенную под ваш склад"),
  offerNote: ru("От вас нужно только короткое знакомство: расскажете, как устроен склад."),
  roadmapLink: ru("Дорожная карта"),

  endTitle: ru("Подключить склад"),
  endLead: ru(
    "Свяжемся в течение рабочего дня. Обсудим по телефону или в чате, как устроен ваш склад, и назовём дату подключения.",
  ),
};

const PAINS: { icon: typeof Sheet; title: Copy; body: Copy }[] = [
  {
    icon: Sheet,
    title: ru("Учёт в Excel, чатах и разных программах"),
    body: ru(
      "Чтобы найти товар, проверить остаток, провести приёмку или отгрузку, приходится сверять несколько источников.",
    ),
  },
  {
    icon: ClipboardList,
    title: ru("Задачи ставятся устно, часы считаются отдельно"),
    body: ru(
      "Кто что сделал, не фиксируется. Рабочее время ведётся в другой программе или не ведётся вовсе.",
    ),
  },
  {
    icon: MessageSquareText,
    title: ru("Ответы клиентам ищут по чатам"),
    body: ru(
      "Чтобы ответить про остатки и отгрузки, сотрудник ищет переписку в мессенджерах или вспоминает звонки.",
    ),
  },
];

/** Плитки с крупным числом: условия, которые склад сравнивает первыми. */
const NUMBERS: { value: Copy; label: Copy; body: Copy }[] = [
  {
    value: ru("3 месяца"),
    label: ru("бесплатно"),
    body: ru("Отсчёт идёт с момента загрузки первых товаров, а не с даты заявки."),
  },
  {
    value: ru("4 функции"),
    label: ru("под ваш склад"),
    body: ru(
      "Например, новое поле в карточке товара, отчёт в вашей форме или свой бланк накладной. Каждая становится частью системы для всех складов, а не отдельной версией под один.",
    ),
  },
  {
    value: ru("5 дней"),
    label: ru("на одну функцию"),
    body: ru("Рабочих. Критичные ошибки исправляем сразу."),
  },
  {
    value: ru("10–18"),
    label: ru("чат в рабочие дни"),
    body: ru("Отвечаем в чате по московскому времени."),
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
 * Страница для складов — лендинг подключения (19 окт).
 *
 * Только по-русски, английской пары у текстов нет: клиентов начинаем со складов
 * в России, и перевод, который никто не прочтёт, только задерживал бы правки.
 * Порядок блоков: боль → что получаете → путь с формой → что внутри → тарифы →
 * вопросы → форма. Тарифы стоят перед вопросами, потому что про цену
 * спрашивают последним, когда остальное уже понятно.
 *
 * Все призывы ведут к форме в шаге «Заявка» (`#connect`), а не на страницу
 * контактов: склад не уходит со страницы, чтобы оставить заявку.
 */
export function WarehousesPage() {
  const t = useT();

  return (
    <div className="pb-24 pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:gap-16">
        <Reveal className="max-w-2xl">
          <p className={eyebrow({ tone: "primary", className: "mb-3" })}>{t(T.eyebrow)}</p>
          <h1 className="font-display text-3xl font-heading leading-display tracking-tight sm:text-5xl">
            {t(T.titleTop)} <span className="text-primary">{t(T.titleAccent)}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t(T.lead)}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CtaLink href="#connect" className="w-full sm:w-auto">
              {t(T.ctaConnect)}
            </CtaLink>
            <Button asChild variant="outline" size="lg" shape="pill" className="w-full sm:w-auto">
              <a href="#inside">{t(T.ctaInside)}</a>
            </Button>
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{t(T.heroNote)}</p>
        </Reveal>

        <Reveal delay={120} className="r-window border border-border bg-card p-4 sm:p-6">
          <PlanShowcase />
        </Reveal>
      </div>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <SectionHead align="left" eyebrow={t(T.painsEyebrow)} title={t(T.painsTitle)} />

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PAINS.map((p, i) => (
            <Reveal
              key={p.title.ru}
              as="article"
              delay={i * 70}
              className="r-window border border-border bg-card p-5 sm:p-6"
            >
              <p.icon className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-lg font-heading tracking-tight">
                {t(p.title)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(p.body)}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 max-w-3xl border-l-2 border-primary pl-5">
          <p className="text-base leading-relaxed sm:text-lg">{t(T.bridge)}</p>
        </Reveal>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <SectionHead align="left" eyebrow={t(T.offerEyebrow)} title={t(T.offerTitle)} />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {NUMBERS.map((n, i) => (
            <Reveal
              key={n.value.ru}
              as="article"
              delay={i * 70}
              className="r-window flex flex-col border border-border bg-card p-5 sm:p-6"
            >
              <p className="font-display text-3xl font-medium tabular-nums tracking-tight text-primary">
                {t(n.value)}
              </p>
              <p className="mt-1 text-sm font-medium">{t(n.label)}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t(n.body)}</p>
            </Reveal>
          ))}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {EXTRAS.map((x, i) => (
            <Reveal
              key={x.title.ru}
              as="article"
              delay={i * 70}
              className="r-window flex flex-col border border-border bg-card p-5 sm:p-6"
            >
              <h3 className="font-display text-lg font-heading tracking-tight">{t(x.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(x.body)}</p>
              {x.link && (
                <a
                  href={href("/roadmap")}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t(T.roadmapLink)}
                  <ArrowRight className="size-4" />
                </a>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base leading-relaxed">{t(T.offerNote)}</p>
          <CtaLink href="#connect" className="w-full shrink-0 sm:w-auto">
            {t(T.ctaConnect)}
          </CtaLink>
        </Reveal>
      </section>

      <ConnectPath />
      <Inside />
      <Tariffs />
      <Questions />

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <div className="r-window grid gap-8 border border-border bg-card p-5 sm:p-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <h2 className="font-display text-2xl font-heading leading-title tracking-tight sm:text-3xl">
              {t(T.endTitle)}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t(T.endLead)}
            </p>
          </div>
          <ConnectForm idPrefix="final" />
        </div>
      </section>
    </div>
  );
}
