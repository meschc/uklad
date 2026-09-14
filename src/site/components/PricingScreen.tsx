import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PLANS,
  SELLER_EXTRAS,
  SELLER_FREE,
  YEARLY_DISCOUNT,
  extraUnitLabel,
  yearlyPrice,
  type Plan,
  type SellerExtra,
} from "../data/plans";
import { money } from "../data/warehouses";
import { Reveal } from "./Reveal";
import { href } from "../lib/route";
import { c, useT } from "../lib/copy";
// Под псевдонимом: `eyebrow` ниже — имя свойства с текстом надзаголовка.
import { eyebrow as eyebrowClass } from "../lib/eyebrow";

const T = {
  eyebrow: c("Тарифы", "Pricing"),
  // Заголовок разрезан надвое не ради красоты: между половинами стоит перенос,
  // который на узком экране убирается. Одной строкой с `<br>` внутри это было
  // бы разметкой внутри перевода — то есть ловушкой для того, кто переводит.
  titleTop: c("Поиск склада — бесплатно.", "Finding a warehouse is free."),
  titleBottom: c("Платно — только взгляд внутрь", "You pay only to look inside"),
  lead: c(
    "Искать, сравнивать и слать заявки можно без комиссии: плата за отклик рано или поздно начинает торговать местом в выдаче. Деньги Уклад берёт за то, чего в каталогах складов нет вообще, — за взгляд внутрь склада до отгрузки.",
    "Searching, comparing and sending requests costs nothing: pay-per-reply sooner or later starts selling places in the results. We charge for what no warehouse catalogue has at all — a look inside before you ship.",
  ),

  sellerEyebrow: c("Селлеру", "For sellers"),
  sellerTitle: c(
    "Витрина бесплатна, дополнения — поштучно",
    "The catalogue is free, add-ons come one at a time",
  ),
  sellerNote: c(
    "Ни подписки, ни карты: дополнение покупается под конкретный склад тогда, когда понадобилось.",
    "No subscription, no card on file: an add-on is bought for one warehouse, when you need it.",
  ),
  freeTitle: c("Бесплатно навсегда", "Free forever"),
  freeNote: c("без регистрации и без карты", "no sign-up, no card"),
  freeCta: c("Открыть каталог", "Open the catalogue"),

  whEyebrow: c("Складу", "For warehouses"),
  whTitle: c("Подписка на учётную систему", "A subscription to the WMS"),
  whNote: c(
    "Платит тот, кто работает в системе каждый день. Первые две недели — бесплатно и без карты.",
    "Here the payer is whoever works in the system every day. The first two weeks are free, no card.",
  ),

  monthly: c("Помесячно", "Monthly"),
  yearlyOpt: c("За год · −{n}%", "Yearly · −{n}%"),
  popular: c("Чаще берут", "Most picked"),
  perYear: c("за год", "a year"),
  perMonth: c("в месяц", "a month"),
  insteadOf: c("вместо {n} ₽ при помесячной оплате", "instead of {n} ₽ paid monthly"),
  vat: c("НДС — по основаниям, указанным в оферте", "VAT as stated in the offer"),

  factsTitle: c("Что важно знать до оплаты", "What to know before paying"),
  factWhatTerm: c("Что оплачивается", "What you pay for"),
  factWhat: c(
    "Простая (неисключительная) лицензия на программу по модели удалённого доступа — подпиской либо разовым доступом к отдельной функции. Услуги склада в цену не входят.",
    "A simple (non-exclusive) licence to use the software remotely — by subscription or as one-off access to a single feature. Warehouse services are not included.",
  ),
  factOrderTerm: c("Порядок оплаты", "How payment works"),
  factOrder: c(
    "Подписка — авансом за месяц или год. Дополнения — разово, доступ открывается сразу после оплаты. Перевод по счёту либо карта; закрывающие документы — за пять рабочих дней.",
    "Subscriptions are paid in advance, monthly or yearly. Add-ons are one-off and open right after payment. Bank transfer or card; closing documents within five business days.",
  ),
  factRefundTerm: c("Возврат", "Refunds"),
  factRefund: c(
    "За подписку — пропорционально неиспользованным полным дням, в течение десяти рабочих дней. Разовое дополнение — только пока доступ не открыт: после открытия функция считается предоставленной.",
    "A subscription is refunded pro rata for whole unused days, within ten business days. A one-off add-on only while its access is still closed: once opened, the feature counts as delivered.",
  ),
  factPricesTerm: c("Изменение цен", "Price changes"),
  factPrices: c(
    "Новые цены действуют для периодов и покупок, начинающихся не раньше чем через тридцать дней после публикации. Оплаченное не пересчитывается.",
    "New prices apply to periods and purchases starting no sooner than thirty days after publication. Anything already paid for is not recalculated.",
  ),
  offerBefore: c("Полные условия — в ", "The full terms are in the "),
  offerLink: c("публичной оферте", "public offer"),
  offerAfter: c(": эта страница — её неотъемлемая часть.", ": this page is part of it."),
};

/**
 * Тарифы.
 *
 * Страница обязательная, а не маркетинговая: оферта ссылается на неё как на
 * свою неотъемлемую часть, поэтому цена здесь — в рублях, с прямым указанием,
 * что именно оплачивается и что бесплатно навсегда.
 *
 * Порядок блоков — от бесплатного к платному, и это не вежливость. У витрины
 * два кошелька: селлер платит за отдельные функции, склад — подпиской. Если
 * начать с подписки, селлер решит, что каталог платный, и закроет страницу
 * раньше, чем дойдёт до строчки «заявки без комиссии».
 */
export function PricingScreen() {
  const t = useT();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div className="text-center">
        <p className={eyebrowClass("mb-3")}>{t(T.eyebrow)}</p>
        <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[44px]">
          {t(T.titleTop)}
          <br className="hidden sm:block" /> {t(T.titleBottom)}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          {t(T.lead)}
        </p>
      </div>

      <SellerBlock />

      <hr className="beam my-16 sm:my-20" />

      <WarehouseBlock />

      <PaymentFacts />
    </div>
  );
}

/** Селлер: бесплатная база слева, платные дополнения справа. */
function SellerBlock() {
  const t = useT();

  return (
    <section className="mt-14">
      <SectionLabel eyebrow={t(T.sellerEyebrow)} title={t(T.sellerTitle)} note={t(T.sellerNote)} />

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
        {/* Карточка не растягивается на высоту колонки дополнений: пустое поле
            между списком и кнопкой читается как «здесь что-то не загрузилось». */}
        <Reveal className="self-start">
          <div className="r-window flex flex-col border border-border bg-card p-6">
            <h3 className="font-display text-[19px] font-medium tracking-tight">
              {t(T.freeTitle)}
            </h3>
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-[34px] font-medium tabular-nums tracking-tight">
                0 ₽
              </span>
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{t(T.freeNote)}</p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {SELLER_FREE.map((f) => (
                <li key={f.ru} className="flex gap-2.5 text-[13px] leading-snug">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={3} />
                  <span className="text-foreground/85">{t(f)}</span>
                </li>
              ))}
            </ul>

            <a
              href={href("/market")}
              className="group mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(T.freeCta)}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          {SELLER_EXTRAS.map((extra, i) => (
            <Reveal
              key={extra.id}
              delay={i * 70}
              className={cn("h-full", extra.featured && "sm:col-span-2")}
            >
              <ExtraCard extra={extra} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Склад: подписка на учётную систему. */
function WarehouseBlock() {
  const t = useT();
  const [yearly, setYearly] = useState(false);

  return (
    <section>
      <SectionLabel eyebrow={t(T.whEyebrow)} title={t(T.whTitle)} note={t(T.whNote)} />

      <div className="mt-8 flex justify-center">
        <PeriodSwitch yearly={yearly} onChange={setYearly} />
      </div>

      <div className="mx-auto mt-8 grid max-w-4xl gap-5 sm:grid-cols-2">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 90} className="h-full">
            <PlanCard plan={plan} yearly={yearly} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function SectionLabel({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className={eyebrowClass()}>{eyebrow}</p>
      <h2 className="mt-2 font-display text-[22px] font-medium tracking-tight sm:text-[26px]">
        {title}
      </h2>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * Дополнение. Цена стоит рядом с заголовком, а не под списком: у поштучной
 * покупки решение принимается по цене, и прятать её в подвал карточки значит
 * заставлять человека читать до конца ради одной цифры.
 */
function ExtraCard({ extra }: { extra: SellerExtra }) {
  const t = useT();

  return (
    <div className="r-window flex h-full flex-col border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-[16px] font-medium leading-tight tracking-tight">
          {t(extra.title)}
        </h3>
        <span className="shrink-0 text-right">
          <span className="block font-display text-[20px] font-medium tabular-nums leading-none tracking-tight">
            {money(extra.price)} ₽
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {t(extraUnitLabel(extra))}
          </span>
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">{t(extra.what)}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{t(extra.why)}</p>

      <FirstScreen text={t(extra.firstScreen)} />
    </div>
  );
}

/**
 * Строка про первый экран после оплаты — отбита линией и прижата к низу
 * карточки.
 *
 * Отбита потому, что это не третье предложение описания: выше сказано, что
 * функция делает и зачем, а здесь — что произойдёт через секунду после кнопки
 * «Оплатить». Прижата к низу, чтобы во всех карточках сетки эта строка стояла
 * на одной линии: её читают, сравнивая, а не по одной.
 */
function FirstScreen({ text }: { text: string }) {
  return (
    // Отступ сверху живёт на обёртке, а не на самой строке: `mt-auto` съел бы
    // любой `mt-*`, и линия прилипла бы к тексту выше.
    <div className="mt-auto pt-4">
      <p className="flex items-start gap-2 border-t border-border/60 pt-3.5 text-[12px] leading-relaxed text-muted-foreground">
        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>{text}</span>
      </p>
    </div>
  );
}

/**
 * Переключатель периода. Подложка едет за выбором, а не перекрашивается: так
 * видно, что это одно и то же место с двумя состояниями, а не две кнопки.
 */
function PeriodSwitch({ yearly, onChange }: { yearly: boolean; onChange: (v: boolean) => void }) {
  const t = useT();

  return (
    <div className="relative inline-flex rounded-full border border-border bg-card p-1">
      {/* Подложка едет вправо ровно на свою ширину: `left: 4` и
          `calc(50% - 4px)` дают симметричные поля с обеих сторон. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 rounded-full bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          yearly ? "translate-x-full" : "translate-x-0",
        )}
        style={{ left: 4, width: "calc(50% - 4px)" }}
      />
      {[
        { label: t(T.monthly), on: !yearly, v: false },
        {
          label: t(T.yearlyOpt, { n: Math.round(YEARLY_DISCOUNT * 100) }),
          on: yearly,
          v: true,
        },
      ].map((opt) => (
        <button
          key={opt.label}
          onClick={() => onChange(opt.v)}
          aria-pressed={opt.on}
          className={cn(
            "relative z-10 inline-flex h-9 min-w-[140px] items-center justify-center rounded-full px-4 text-[13px] font-medium transition-colors",
            opt.on ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const t = useT();
  // За год показываем цену года целиком, а не «в пересчёте на месяц»: месяц из
  // годового платежа — цифра, которой в счёте не будет.
  const amount = yearly ? yearlyPrice(plan) : plan.monthly;

  return (
    <div
      className={cn(
        "r-window flex h-full flex-col border bg-card p-6 transition-colors",
        plan.featured ? "border-primary/50" : "border-border hover:border-primary/30",
      )}
    >
      <div className="flex items-center gap-2">
        <h3 className="font-display text-[19px] font-medium tracking-tight">{t(plan.title)}</h3>
        {plan.featured && (
          <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {t(T.popular)}
          </span>
        )}
      </div>
      <p className="mt-2 min-h-[40px] text-[13px] leading-snug text-muted-foreground">
        {t(plan.who)}
      </p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-medium tabular-nums tracking-tight">
          {money(amount)} ₽
        </span>
        <span className="text-[13px] text-muted-foreground">
          {t(yearly ? T.perYear : T.perMonth)}
        </span>
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {yearly ? t(T.insteadOf, { n: money(plan.monthly * 12) }) : t(T.vat)}
      </p>

      <ul className="mt-6 flex flex-1 flex-col gap-2.5">
        {plan.features.map((f) => (
          <li key={f.ru} className="flex gap-2.5 text-[13px] leading-snug">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={3} />
            <span className="text-foreground/85">{t(f)}</span>
          </li>
        ))}
      </ul>

      <FirstScreen text={t(plan.firstScreen)} />

      <a
        href={href("/market")}
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors",
          plan.featured
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border hover:bg-muted",
        )}
      >
        {t(plan.cta)}
      </a>
    </div>
  );
}

/** Условия, которые обязана раскрыть страница, входящая в оферту. */
function PaymentFacts() {
  const t = useT();

  return (
    <Reveal className="r-window mt-16 border border-border bg-card/60 p-6 sm:p-7">
      <h2 className="font-display text-[19px] font-medium tracking-tight">{t(T.factsTitle)}</h2>
      <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Fact term={t(T.factWhatTerm)}>{t(T.factWhat)}</Fact>
        <Fact term={t(T.factOrderTerm)}>{t(T.factOrder)}</Fact>
        <Fact term={t(T.factRefundTerm)}>{t(T.factRefund)}</Fact>
        <Fact term={t(T.factPricesTerm)}>{t(T.factPrices)}</Fact>
      </dl>
      <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
        {t(T.offerBefore)}
        <a
          href={href("/legal/offer")}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t(T.offerLink)}
        </a>
        {t(T.offerAfter)}
      </p>
    </Reveal>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {term}
      </dt>
      <dd className="mt-1.5 text-[14px] leading-relaxed text-foreground/85">{children}</dd>
    </div>
  );
}
