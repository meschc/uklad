import {
  ArrowRight,
  Boxes,
  FileSignature,
  LayoutGrid,
  MessagesSquare,
  Ruler,
  Truck,
} from "lucide-react";
import { ChatPanel } from "./components/ChatPanel";
import { Reveal } from "./components/Reveal";
import { SectionHead } from "./components/SectionHead";
import { RequestBoard } from "./components/sellers/RequestBoard";
import { CITIES } from "./data/cities";
import { WAREHOUSES } from "./data/warehouses";
import { plural } from "./lib/plural";
import { go, goAnchor, goMarket } from "./lib/route";

/** Путь селлера от выбора склада до товара у покупателя. */
const PATH = [
  {
    title: "Выбираете склад",
    body: "Город, схема работы, площадки, услуги, потолок по цене. Прайс у всех разложен по одним строкам, оплата у всех одна: по факту месяца, без депозита.",
  },
  {
    title: "Склад подтверждает",
    body: "Отвечает, сможет ли принять ваш товар, и присылает условия под него — с учётом габаритов, упаковки и режима хранения.",
  },
  {
    title: "Подписываете документы",
    body: "Договор и приложение с прайсом подписываются электронно, из кабинета. Так же потом — акты приёмки и отчёты.",
  },
  {
    title: "Отправляете товар",
    body: "Называете дату, склад бронирует окно на приёмку. Принимает по строкам и присылает отчёт: что приехало, что не сошлось, что ушло в брак.",
  },
  {
    title: "Создаёте заявку на отправку",
    body: "Партия на маркетплейс или единичный заказ покупателю — заявка одна и та же. Склад собирает, маркирует и отгружает.",
  },
];

/** Что открыто в кабинете селлера всё это время. */
const VISIBLE = [
  {
    icon: Boxes,
    title: "Остатки и стоимость",
    body: "Сколько единиц лежит, сколько зарезервировано, сколько места занято и на сколько набежало хранение.",
  },
  {
    icon: Truck,
    title: "Статусы приёмки и отправки",
    body: "На каком шаге поставка и каждая заявка на отгрузку: принимается, собирается, ждёт погрузки, уехала.",
  },
  {
    icon: LayoutGrid,
    title: "Где лежит товар",
    body: "Не строка «A-01-03-02», а склад сверху: видно ряд, стеллаж и ячейку, где стоит ваш товар.",
  },
  {
    icon: Ruler,
    title: "Условия под ваш товар",
    body: "Хрупкое, негабарит, режим хранения, нестандартная упаковка — склад считает отдельно и присылает условия до договора.",
  },
];

/**
 * Отдельная ветка для селлера.
 *
 * Основной покупатель Уклада — склад: он берёт WMS и вместе с ней получает
 * поток клиентов. Но у второй стороны свой вопрос — «а мне-то что с этого», —
 * и отвечать на него посреди страницы про WMS значит не ответить ни одной из
 * сторон. Поэтому у селлера своя страница, а лендинг остаётся складским.
 */
export function SellersPage() {
  return (
    <div className="pb-24 pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:gap-16">
        <Reveal className="max-w-2xl">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
            Селлеру
          </p>
          {/* Перенос строки здесь не задан вручную: справа теперь макет заявки,
              колонка стала уже, и жёсткая разбивка в ней переполнялась. Кегль
              42, а не 46: на 46 первая строка не дотягивала до края четырёх
              пикселей и «не нужно» уезжало в отдельную строку. */}
          <h1 className="font-display text-[32px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[42px]">
            Склад, с которым не нужно{" "}
            <span className="text-primary">договариваться лично</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            Выбрали склад — он подтвердил приём. Подписали документы, назвали
            дату, отправили. Дальше склад принимает, хранит и отгружает, а вы
            всё это время видите, что происходит с товаром.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => goMarket()}
              className="group inline-flex h-[52px] w-full items-center justify-between gap-4 rounded-full bg-foreground pl-6 pr-1.5 text-sm font-medium text-background transition-transform hover:-translate-y-px active:translate-y-0 sm:w-auto sm:justify-start"
            >
              Подобрать склад
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-primary/85">
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
            <button
              onClick={() => go("/pricing")}
              className="inline-flex h-[52px] w-full items-center justify-center rounded-full border border-foreground/[0.14] px-7 text-sm font-medium transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04] sm:w-auto"
            >
              Сколько это стоит
            </button>
          </div>

          <p className="mt-8 text-[13px] leading-relaxed text-muted-foreground">
            {WAREHOUSES.length}{" "}
            {plural(WAREHOUSES.length, "склад", "склада", "складов")} в{" "}
            {CITIES.length}{" "}
            {plural(CITIES.length, "городе", "городах", "городах")} · FBO, FBS,
            DBS · заявка на склад ничего не стоит
          </p>
        </Reveal>

        <Reveal delay={120}>
          <RequestBoard />
        </Reveal>
      </div>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <SectionHead
          align="left"
          eyebrow="Как это идёт"
          title="От выбора склада до отгрузки покупателю"
          lead="Каждый шаг происходит внутри системы. Согласование и документы — до первой поставки, а не «потом подпишем»."
        />

        <ol className="mt-10 border-t border-border">
          {PATH.map((s, i) => (
            <Reveal key={s.title} as="li" delay={i * 70}>
              <div className="grid gap-2 border-b border-border py-6 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-6">
                <span className="font-mono text-[12px] tabular-nums text-primary">
                  0{i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg font-medium tracking-tight">
                    {s.title}
                  </h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {s.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <SectionHead
          align="left"
          eyebrow="Что открыто у вас"
          title="Вся информация о вашем товаре"
          lead="Одни и те же данные у вас и у кладовщика: не выгрузка на вчера, а то, что происходит на складе сейчас."
        />

        <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-x-12">
          {VISIBLE.map((v, i) => (
            <Reveal key={v.title} as="article" delay={i * 80}>
              <v.icon className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-lg font-medium tracking-tight">
                {v.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {v.body}
              </p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Документы и вопросы
            </p>
            <h2 className="font-display text-[26px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[34px]">
              Бумаги подписываются в кабинете, вопросы задаются там же
            </h2>
            <p className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <FileSignature className="mt-0.5 size-4 shrink-0 text-primary" />
              Договор, приложение с прайсом, акты приёмки и расхождений, отчёты
              об отгрузке — всё подписывается электронно, через Диадок или СБИС.
              Печатать и возить курьером нечего.
            </p>
            <p className="mt-3 flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <MessagesSquare className="mt-0.5 size-4 shrink-0 text-primary" />
              Чат открыт на каждой странице и знает, о чём вы спрашиваете: у
              позиции, у поставки, у заявки. Объяснять, по какому товару вопрос,
              не нужно.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ChatPanel
              to="Ярус Логистик"
              subject="УК-2003, заявка на отгрузку З-4472"
              responseHours={2}
              presets={[
                "Когда отгрузите заявку З-4472?",
                "Возьмёте товар с режимом хранения?",
                "Пришлите акт приёмки на подпись",
              ]}
            />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <div className="border-t border-border pt-10 sm:flex sm:items-end sm:justify-between sm:gap-8">
          <div>
            <h2 className="font-display text-[24px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[30px]">
              Посмотрите склады
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Фильтры по городу, схеме, площадкам, услугам и цене — без
              регистрации. У вас склад, а не товар?{" "}
              <button
                onClick={() => goAnchor("operators")}
                className="text-primary underline-offset-4 hover:underline"
              >
                Уклад для складов
              </button>
              .
            </p>
          </div>
          <button
            onClick={() => goMarket()}
            className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:mt-0 sm:w-auto"
          >
            Открыть витрину
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>
    </div>
  );
}
