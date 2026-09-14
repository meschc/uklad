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
import { warehousesRepository } from "./data/warehousesRepository";
import { c, useT, type Copy } from "./lib/copy";
import { eyebrow } from "./lib/eyebrow";
import { href } from "./lib/route";

/** Путь селлера от выбора склада до товара у покупателя. */
const PATH: { title: Copy; body: Copy }[] = [
  {
    title: c("Выбираете склад", "You pick a warehouse"),
    body: c(
      "Город, схема, площадки, услуги, потолок по цене. Прайс у всех разложен по одним строкам, оплата — по факту месяца, без депозита.",
      "City, model, marketplaces, services, a price ceiling. Every price list breaks down the same way, and you pay for the month you used — no deposit.",
    ),
  },
  {
    title: c("Склад подтверждает", "The warehouse confirms"),
    body: c(
      "Отвечает, возьмёт ли ваш товар, и присылает условия под него: габариты, упаковка, режим хранения.",
      "It answers whether it will take your goods and sends terms for them: dimensions, packaging, storage mode.",
    ),
  },
  {
    title: c("Подписываете документы", "You sign the papers"),
    body: c(
      "Договор и приложение с прайсом — электронно, из кабинета. Так же потом акты приёмки и отчёты.",
      "The contract and the price annex are signed electronically, from your account. Intake acts and reports follow the same way.",
    ),
  },
  {
    title: c("Отправляете товар", "You ship the goods"),
    body: c(
      "Называете дату — склад бронирует окно на приёмку. Принимает по строкам и присылает отчёт: что приехало, что не сошлось, что в брак.",
      "You name a date, the warehouse books an intake slot. It receives line by line and reports what arrived, what did not match, what was damaged.",
    ),
  },
  {
    title: c("Создаёте заявку на отправку", "You create a shipment request"),
    body: c(
      "Партия на маркетплейс или заказ покупателю — заявка одна. Склад собирает, маркирует и отгружает.",
      "A batch for a marketplace or a single customer order — the same request. The warehouse picks, labels and ships.",
    ),
  },
];

/** Что открыто в кабинете селлера всё это время. */
const VISIBLE: { icon: typeof Boxes; title: Copy; body: Copy }[] = [
  {
    icon: Boxes,
    title: c("Остатки и стоимость", "Stock and cost"),
    body: c(
      "Сколько лежит, сколько зарезервировано, сколько места занято и на сколько набежало хранение.",
      "How much sits there, how much is reserved, how much space is taken and how much storage has run up.",
    ),
  },
  {
    icon: Truck,
    title: c("Статусы приёмки и отправки", "Intake and shipping statuses"),
    body: c(
      "На каком шаге поставка и каждая отгрузка: принимается, собирается, ждёт погрузки, уехала.",
      "Where each delivery and shipment stands: receiving, picking, waiting to load, gone.",
    ),
  },
  {
    icon: LayoutGrid,
    title: c("Где лежит товар", "Where the goods are"),
    body: c(
      "Не строка «A-01-03-02», а склад сверху: ряд, стеллаж и ячейка, где стоит ваш товар.",
      "Not a code like “A-01-03-02” but the floor from above: the row, the rack and the cell your goods stand in.",
    ),
  },
  {
    icon: Ruler,
    title: c("Условия под ваш товар", "Terms for your goods"),
    body: c(
      "Хрупкое, негабарит, режим хранения, нестандартная упаковка — склад считает отдельно, до договора.",
      "Fragile, oversized, temperature-controlled, odd packaging — the warehouse prices it separately, before the contract.",
    ),
  },
];

const T = {
  eyebrow: c("Селлеру", "For sellers"),
  // Заголовок разрезан надвое: вторая половина набрана акцентным цветом.
  // Разметка внутри перевода была бы ловушкой для того, кто переводит дальше.
  titleTop: c("Склад, с которым не нужно", "A warehouse you never have to"),
  titleAccent: c("договариваться лично", "negotiate with in person"),
  lead: c(
    "Выбрали склад — он подтвердил приём. Подписали документы, назвали дату, отправили. Дальше склад принимает, хранит и отгружает, а вы видите каждый шаг.",
    "You pick a warehouse, it confirms intake. You sign, name a date, ship. From there it receives, stores and ships out — and you see every step.",
  ),
  ctaMarket: c("Подобрать склад", "Find a warehouse"),
  ctaPricing: c("Сколько это стоит", "What it costs"),
  stats: c(
    "{n} {w} в {m} {c} · FBO, FBS, DBS · заявка на склад ничего не стоит",
    "{n} {w} in {m} {c} · FBO, FBS, DBS · sending a request costs nothing",
  ),

  pathEyebrow: c("Как это идёт", "How it goes"),
  pathTitle: c(
    "От выбора склада до отгрузки покупателю",
    "From picking a warehouse to the customer's door",
  ),
  pathLead: c(
    "Каждый шаг — внутри системы. Согласование и документы до первой поставки, а не «потом подпишем».",
    "Every step happens inside the system. Terms and papers come before the first delivery, not “we'll sign later”.",
  ),

  visibleEyebrow: c("Что открыто у вас", "What you see"),
  visibleTitle: c("Вся информация о вашем товаре", "Everything about your goods"),
  visibleLead: c(
    "Одни и те же данные у вас и у кладовщика: не выгрузка на вчера, а склад сейчас.",
    "The same data for you and for the picker: not yesterday's export, but the warehouse right now.",
  ),

  docsEyebrow: c("Документы и вопросы", "Papers and questions"),
  docsTitle: c(
    "Бумаги подписываются в кабинете, вопросы задаются там же",
    "Papers are signed in your account, and questions asked there too",
  ),
  docsSign: c(
    "Договор, приложение с прайсом, акты приёмки и расхождений, отчёты об отгрузке — всё электронно, через Диадок или СБИС. Печатать и возить нечего.",
    "The contract, the price annex, intake and discrepancy acts, shipment reports — all signed electronically through Diadoc or SBIS. Nothing to print or courier.",
  ),
  docsChat: c(
    "Чат открыт на каждой странице и знает, о чём вы спрашиваете: у позиции, у поставки, у заявки. Объяснять, по какому товару, не нужно.",
    "The chat sits on every page and knows what you are asking about: an item, a delivery, a request. No need to explain which goods you mean.",
  ),
  chatTo: c("Ярус Логистик", "Yarus Logistics"),
  chatSubject: c("УК-2003, заявка на отгрузку З-4472", "UK-2003, shipment request Z-4472"),
  chatPresets: [
    c("Когда отгрузите заявку З-4472?", "When will request Z-4472 ship?"),
    c("Возьмёте товар с режимом хранения?", "Can you take climate-controlled goods?"),
    c("Пришлите акт приёмки на подпись", "Send the intake act for signing"),
  ],

  endTitle: c("Посмотрите склады", "Take a look at the warehouses"),
  endLeadBefore: c(
    "Фильтры по городу, схеме, площадкам, услугам и цене — без регистрации. У вас склад, а не товар? ",
    "Filters by city, model, marketplace, service and price — no signup. Run a warehouse rather than sell? ",
  ),
  endLeadLink: c("Уклад для складов", "Uklad for warehouses"),
  endCta: c("Открыть витрину", "Open the catalogue"),
};

/**
 * Отдельная ветка для селлера.
 *
 * Основной покупатель Уклада — склад: он берёт WMS и вместе с ней получает
 * поток клиентов. Но у второй стороны свой вопрос — «а мне-то что с этого», —
 * и отвечать на него посреди страницы про WMS значит не ответить ни одной из
 * сторон. Поэтому у селлера своя страница, а лендинг остаётся складским.
 */
export function SellersPage() {
  const t = useT();
  const { total } = warehousesRepository.stats();

  return (
    <div className="pb-24 pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:gap-16">
        <Reveal className="max-w-2xl">
          <p className={eyebrow("mb-3")}>{t(T.eyebrow)}</p>
          {/* Перенос строки здесь не задан вручную: справа теперь макет заявки,
              колонка стала уже, и жёсткая разбивка в ней переполнялась. Кегль
              42, а не 46: на 46 первая строка не дотягивала до края четырёх
              пикселей и «не нужно» уезжало в отдельную строку. */}
          <h1 className="font-display text-[32px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[42px]">
            {t(T.titleTop)} <span className="text-primary">{t(T.titleAccent)}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {t(T.lead)}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={href("/market")}
              className="group inline-flex h-[52px] w-full items-center justify-between gap-4 rounded-full bg-foreground pl-6 pr-1.5 text-sm font-medium text-background transition-transform hover:-translate-y-px active:translate-y-0 sm:w-auto sm:justify-start"
            >
              {t(T.ctaMarket)}
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-primary/85">
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </a>
            <a
              href={href("/pricing")}
              className="inline-flex h-[52px] w-full items-center justify-center rounded-full border border-foreground/[0.14] px-7 text-sm font-medium transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04] sm:w-auto"
            >
              {t(T.ctaPricing)}
            </a>
          </div>

          <p className="mt-8 text-[13px] leading-relaxed text-muted-foreground">
            {t(T.stats, {
              n: total,
              w: t.plural(total, ["склад", "склада", "складов"], ["warehouse", "warehouses"]),
              m: CITIES.length,
              c: t.plural(CITIES.length, ["городе", "городах", "городах"], ["city", "cities"]),
            })}
          </p>
        </Reveal>

        <Reveal delay={120}>
          <RequestBoard />
        </Reveal>
      </div>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <SectionHead
          align="left"
          eyebrow={t(T.pathEyebrow)}
          title={t(T.pathTitle)}
          lead={t(T.pathLead)}
        />

        <ol className="mt-10 border-t border-border">
          {PATH.map((s, i) => (
            <Reveal key={s.title.ru} as="li" delay={i * 70}>
              <div className="grid gap-2 border-b border-border py-6 sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-6">
                <span className="font-mono text-[12px] tabular-nums text-primary">0{i + 1}</span>
                <div>
                  <h3 className="font-display text-lg font-medium tracking-tight">{t(s.title)}</h3>
                  <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {t(s.body)}
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
          eyebrow={t(T.visibleEyebrow)}
          title={t(T.visibleTitle)}
          lead={t(T.visibleLead)}
        />

        <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-x-12">
          {VISIBLE.map((v, i) => (
            <Reveal key={v.title.ru} as="article" delay={i * 80}>
              <v.icon className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-lg font-medium tracking-tight">{t(v.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(v.body)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className={eyebrow("mb-3")}>{t(T.docsEyebrow)}</p>
            <h2 className="font-display text-[26px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[34px]">
              {t(T.docsTitle)}
            </h2>
            <p className="mt-4 flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <FileSignature className="mt-0.5 size-4 shrink-0 text-primary" />
              {t(T.docsSign)}
            </p>
            <p className="mt-3 flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <MessagesSquare className="mt-0.5 size-4 shrink-0 text-primary" />
              {t(T.docsChat)}
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ChatPanel
              to={t(T.chatTo)}
              subject={t(T.chatSubject)}
              responseHours={2}
              presets={T.chatPresets.map((p) => t(p))}
            />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <div className="border-t border-border pt-10 sm:flex sm:items-end sm:justify-between sm:gap-8">
          <div>
            <h2 className="font-display text-[24px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[30px]">
              {t(T.endTitle)}
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {t(T.endLeadBefore)}
              <a
                href={href("/warehouses")}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t(T.endLeadLink)}
              </a>
              .
            </p>
          </div>
          <a
            href={href("/market")}
            className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:mt-0 sm:w-auto"
          >
            {t(T.endCta)}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </section>
    </div>
  );
}
