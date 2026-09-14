import { ArrowRight, ArrowRightLeft, BadgeCheck, Check, Inbox, LayoutGrid } from "lucide-react";
import { Reveal } from "./components/Reveal";
import { SectionHead } from "./components/SectionHead";
import { InboxBoard } from "./components/warehouses/InboxBoard";
import { PLANS, YEARLY_DISCOUNT, yearlyPrice } from "./data/plans";
import { money } from "./data/warehouses";
import { warehousesRepository } from "./data/warehousesRepository";
import { c, useT, type Copy } from "./lib/copy";
import { eyebrow } from "./lib/eyebrow";
import { href } from "./lib/route";

/** Путь склада от письма до первой смены в системе. */
const PATH: { title: Copy; body: Copy }[] = [
  {
    title: c("Пишете нам", "You write to us"),
    body: c(
      "Город, площадь, схемы работы, площадки и сколько мест свободно. Отвечаем в тот же день.",
      "City, floor area, models, marketplaces and how many slots are free. We answer the same day.",
    ),
  },
  {
    title: c("Заполняете карточку", "You fill in the card"),
    body: c(
      "Услуги, режим хранения, минимальный объём. Прайс — по тем же строкам, что у всех: место в сутки, приёмка, сборка, маркировка.",
      "Services, storage mode, minimum volume. The price list breaks down like everyone else's: slot per day, intake, picking, labelling.",
    ),
  },
  {
    title: c("Уклад проверяет склад", "Uklad checks the warehouse"),
    body: c(
      "Госрегистрацию и право пользования помещением. Значок «проверено» ставится только после этого и только нами.",
      "State registration and the right to use the premises. The “checked” badge goes up only after that, and only from us.",
    ),
  },
  {
    title: c("Карточка встаёт в каталог", "The card goes into the catalogue"),
    body: c(
      "Склад попадает в фильтры по городу, схеме, площадкам и цене. Заявки от селлеров приходят в кабинет — без комиссии и платы за отклик.",
      "The warehouse enters the filters by city, model, marketplace and price. Seller requests land in your account — no commission, no pay-per-reply.",
    ),
  },
  {
    title: c("Переносим остатки", "We move the stock over"),
    body: c(
      "XLSX, выгрузка из вашей системы или ввод по ячейкам. Дальше смена работает по листам сборки, а не по памяти кладовщика.",
      "XLSX, an export from your system or entry cell by cell. From there the shift works from pick lists, not from memory.",
    ),
  },
];

/** Что склад получает вместе с системой. */
const GAINS: { icon: typeof Inbox; title: Copy; body: Copy }[] = [
  {
    icon: Inbox,
    title: c("Заявки без комиссии", "Requests with no commission"),
    body: c(
      "Селлер приходит с готовым запросом: товар, объём, площадки, город. Процента со сделки и платы за отклик нет — витрина зарабатывает на подписке.",
      "The seller arrives with a ready brief: goods, volume, marketplaces, city. No cut of the deal and no pay-per-reply — the marketplace lives on subscriptions.",
    ),
  },
  {
    icon: BadgeCheck,
    title: c("Значок проверенного склада", "A checked-warehouse badge"),
    body: c(
      "Проверенные собраны в отдельном фильтре, и селлеры смотрят их первыми. Самоописанием этот значок не получить.",
      "Checked warehouses have their own filter, and sellers look there first. No amount of self-description earns that badge.",
    ),
  },
  {
    icon: LayoutGrid,
    title: c("Кабинет клиента и план склада", "A client account and a floor plan"),
    body: c(
      "Селлер сам видит остатки, статусы и место хранения. Вопросов «а где мой товар» становится вдвое меньше, и задают их в чате у позиции.",
      "The seller sees stock, statuses and bin locations themselves. Half the “where are my goods” messages disappear, and the rest arrive pinned to the item.",
    ),
  },
  {
    icon: ArrowRightLeft,
    title: c("Перенос и обучение смены", "Migration and training"),
    body: c(
      "Остатки заводим вместе и не останавливая работу. Кладовщику хватает сканера и одного экрана — учиться неделю не нужно.",
      "We load the stock together, without stopping the shift. A picker needs a scanner and one screen — no week of training.",
    ),
  },
];

/**
 * Подписка строками. Цифры берутся из `data/plans` — того же файла, на который
 * смотрит страница тарифов и оферта. Переписать их в вёрстку значит завести
 * второй прайс, который однажды разойдётся с первым.
 */
const SUBSCRIPTION: { title: Copy; body: Copy }[] = [
  {
    title: c("14 дней бесплатно", "14 days free"),
    body: c(
      "Без карты и без счёта: заводим склад, переносим остатки, смотрите на своей смене.",
      "No card, no invoice: we set the warehouse up, move the stock, and you watch it on a real shift.",
    ),
  },
  ...PLANS.map((plan) => ({
    title: plan.title,
    body: {
      ru: `${money(plan.monthly)} ₽ в месяц, за год — ${money(yearlyPrice(plan))} ₽, это −${YEARLY_DISCOUNT * 100} %. ${plan.who.ru}.`,
      en: `${money(plan.monthly)} ₽ a month, or ${money(yearlyPrice(plan))} ₽ a year — ${YEARLY_DISCOUNT * 100} % off. ${plan.who.en}.`,
    },
  })),
  {
    title: c("Витрина остаётся бесплатной", "The listing stays free"),
    body: c(
      "Карточка и заявки работают без подписки. Платите за систему: учёт по ячейкам, документы и кабинет клиента.",
      "The card and the requests work without a subscription. You pay for the system: bin-level stock, documents and the client account.",
    ),
  },
];

const T = {
  eyebrow: c("Складу", "For warehouses"),
  // Заголовок разрезан надвое: вторая половина набрана акцентным цветом.
  // Разметка внутри перевода была бы ловушкой для того, кто переводит дальше.
  titleTop: c("Клиенты приходят с витрины,", "Clients come from the marketplace,"),
  titleAccent: c("смена работает в системе", "the shift runs in the system"),
  lead: c(
    "Уклад — учётная система для склада, а витрина идёт с ней в комплекте. Заявки от селлеров приходят в кабинет без комиссии, кабинет клиента и чат уже внутри.",
    "Uklad is a stock system for the warehouse, and the marketplace comes with it. Seller requests land in your account with no commission; the client account and chat are already inside.",
  ),
  ctaConnect: c("Подключить склад", "Add your warehouse"),
  ctaPricing: c("Сколько это стоит", "What it costs"),
  stats: c(
    "{n} {w} на витрине · {u} уже работают на Укладе · 14 дней бесплатно",
    "{n} {w} listed · {u} already run on Uklad · 14 days free",
  ),

  pathEyebrow: c("Как это идёт", "How it goes"),
  pathTitle: c("От письма до первой смены", "From the first email to the first shift"),
  pathLead: c(
    "Проверка и перенос остатков — до того, как склад появится в каталоге. В витрину не попадает никто непроверенный.",
    "The check and the stock migration happen before the warehouse appears in the catalogue. Nothing unchecked gets listed.",
  ),

  gainsEyebrow: c("Что получает склад", "What the warehouse gets"),
  gainsTitle: c("Система и поток клиентов вместе", "The system and the client flow together"),
  gainsLead: c(
    "Каталог складов без учётной системы приводит заявку и уходит. Здесь заявка попадает туда же, где ведут остатки.",
    "A catalogue without a stock system brings a request and leaves. Here the request lands where the stock is kept.",
  ),

  planEyebrow: c("Подписка", "Subscription"),
  planTitle: c("Платите за систему, а не за заявки", "You pay for the system, not for requests"),
  planLead: c(
    "Комиссия с заявок превратила бы витрину в аукцион позиций, где наверху не лучший склад, а тот, кто больше занёс.",
    "A commission on requests would turn the listing into an auction where the top slot goes to the highest bidder, not the best warehouse.",
  ),
  planLink: c("Все тарифы и что входит", "All plans and what's included"),

  endTitle: c("Расскажите про свой склад", "Tell us about your warehouse"),
  endLeadBefore: c(
    "Ответим в тот же день, остатки переносим вместе. У вас товар, а не склад? ",
    "We answer the same day and move your stock together. Sell goods rather than store them? ",
  ),
  endLeadLink: c("Уклад для селлеров", "Uklad for sellers"),
  endCta: c("Подключить склад", "Add your warehouse"),
};

/**
 * Отдельная ветка для склада.
 *
 * Склад — основной покупатель Уклада, и до этой страницы весь его разговор
 * умещался в одну секцию лендинга и пару вопросов в FAQ: вторая половина
 * маркетплейса была рассказана вчетверо короче первой. Лендинг остаётся входом
 * для обоих, а разбор по шагам — здесь, зеркально `SellersPage`.
 */
export function WarehousesPage() {
  const t = useT();
  const { total, withUklad } = warehousesRepository.stats();

  return (
    <div className="pb-24 pt-28 sm:pt-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] lg:gap-16">
        <Reveal className="max-w-2xl">
          <p className={eyebrow("mb-3")}>{t(T.eyebrow)}</p>
          <h1 className="font-display text-[32px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[42px]">
            {t(T.titleTop)} <span className="text-primary">{t(T.titleAccent)}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {t(T.lead)}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={href("/contacts")}
              className="group inline-flex h-[52px] w-full items-center justify-between gap-4 rounded-full bg-foreground pl-6 pr-1.5 text-sm font-medium text-background transition-transform hover:-translate-y-px active:translate-y-0 sm:w-auto sm:justify-start"
            >
              {t(T.ctaConnect)}
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
              u: withUklad,
            })}
          </p>
        </Reveal>

        <Reveal delay={120}>
          <InboxBoard />
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
          eyebrow={t(T.gainsEyebrow)}
          title={t(T.gainsTitle)}
          lead={t(T.gainsLead)}
        />

        <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-x-12">
          {GAINS.map((g, i) => (
            <Reveal key={g.title.ru} as="article" delay={i * 80}>
              <g.icon className="size-5 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-display text-lg font-medium tracking-tight">{t(g.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(g.body)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-6xl px-4 sm:mt-24 sm:px-6">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-16">
          <Reveal>
            <SectionHead
              align="left"
              eyebrow={t(T.planEyebrow)}
              title={t(T.planTitle)}
              lead={t(T.planLead)}
            />
            <a
              href={href("/pricing")}
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t(T.planLink)}
              <ArrowRight className="size-4" />
            </a>
          </Reveal>

          {/* Тарифы здесь перечислены строками, а не карточками: сетка тарифов
              живёт на странице цен, и вторая такая же превратила бы страницу в
              её дубль. Складу тут нужен ответ «во сколько это встанет», а не
              выбор плана. */}
          <ul className="divide-y divide-foreground/[0.07] border-y border-foreground/[0.07]">
            {SUBSCRIPTION.map((s, i) => (
              <Reveal key={s.title.ru} as="li" delay={i * 80}>
                <div className="flex gap-4 py-6">
                  <Check className="mt-1 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                  <div>
                    <h3 className="font-display text-[15px] font-medium tracking-tight">
                      {t(s.title)}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {t(s.body)}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ul>
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
                href={href("/sellers")}
                className="text-primary underline-offset-4 hover:underline"
              >
                {t(T.endLeadLink)}
              </a>
              .
            </p>
          </div>
          <a
            href={href("/contacts")}
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
