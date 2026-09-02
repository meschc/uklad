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
import { go, goMarket } from "../lib/route";

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
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-6 sm:pt-32">
      <div className="text-center">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
          Тарифы
        </p>
        <h1 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[44px]">
          Поиск склада — бесплатно.
          <br className="hidden sm:block" /> Платно — только взгляд внутрь
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
          Искать, сравнивать и отправлять заявки можно сколько угодно и без
          комиссии: плата за отклик рано или поздно начинает торговать местом в
          выдаче. Деньги Уклад берёт за то, чего в каталогах складов нет вообще —
          за возможность заглянуть внутрь склада до отгрузки.
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
  return (
    <section className="mt-14">
      <SectionLabel
        eyebrow="Селлеру"
        title="Витрина бесплатна, дополнения — поштучно"
        note="Ни подписки, ни привязки карты: дополнение покупается под конкретный склад тогда, когда оно понадобилось."
      />

      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
        {/* Карточка не растягивается на высоту колонки дополнений: пустое поле
            между списком и кнопкой читается как «здесь что-то не загрузилось». */}
        <Reveal className="self-start">
          <div className="r-window flex flex-col border border-border bg-card p-6">
            <h3 className="font-display text-[19px] font-medium tracking-tight">
              Бесплатно навсегда
            </h3>
            <p className="mt-5 flex items-baseline gap-1.5">
              <span className="font-display text-[34px] font-medium tabular-nums tracking-tight">
                0 ₽
              </span>
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              без регистрации и без карты
            </p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {SELLER_FREE.map((f) => (
                <li key={f} className="flex gap-2.5 text-[13px] leading-snug">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={3} />
                  <span className="text-foreground/85">{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => goMarket()}
              className="group mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Открыть каталог
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
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
  const [yearly, setYearly] = useState(false);

  return (
    <section>
      <SectionLabel
        eyebrow="Складу"
        title="Подписка на учётную систему"
        note="Здесь платит тот, кто работает в системе каждый день. Первые две недели — бесплатно, без карты и без обязательств."
      />

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

function SectionLabel({
  eyebrow,
  title,
  note,
}: {
  eyebrow: string;
  title: string;
  note: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
        {eyebrow}
      </p>
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
  return (
    <div className="r-window flex h-full flex-col border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-display text-[16px] font-medium leading-tight tracking-tight">
          {extra.title}
        </h3>
        <span className="shrink-0 text-right">
          <span className="block font-display text-[20px] font-medium tabular-nums leading-none tracking-tight">
            {money(extra.price)} ₽
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground">
            {extraUnitLabel(extra)}
          </span>
        </span>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-foreground/85">{extra.what}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{extra.why}</p>
    </div>
  );
}

/**
 * Переключатель периода. Подложка едет за выбором, а не перекрашивается: так
 * видно, что это одно и то же место с двумя состояниями, а не две кнопки.
 */
function PeriodSwitch({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (v: boolean) => void;
}) {
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
        { label: "Помесячно", on: !yearly, v: false },
        { label: `За год · −${Math.round(YEARLY_DISCOUNT * 100)}%`, on: yearly, v: true },
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
        <h3 className="font-display text-[19px] font-medium tracking-tight">{plan.title}</h3>
        {plan.featured && (
          <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            Чаще берут
          </span>
        )}
      </div>
      <p className="mt-2 min-h-[40px] text-[13px] leading-snug text-muted-foreground">{plan.who}</p>

      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-[34px] font-medium tabular-nums tracking-tight">
          {money(amount)} ₽
        </span>
        <span className="text-[13px] text-muted-foreground">{yearly ? "за год" : "в месяц"}</span>
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {yearly
          ? `вместо ${money(plan.monthly * 12)} ₽ при помесячной оплате`
          : "НДС — по основаниям, указанным в оферте"}
      </p>

      <ul className="mt-6 flex flex-1 flex-col gap-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-[13px] leading-snug">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" strokeWidth={3} />
            <span className="text-foreground/85">{f}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => goMarket()}
        className={cn(
          "mt-6 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors",
          plan.featured
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border hover:bg-muted",
        )}
      >
        {plan.cta}
      </button>
    </div>
  );
}

/** Условия, которые обязана раскрыть страница, входящая в оферту. */
function PaymentFacts() {
  return (
    <Reveal className="r-window mt-16 border border-border bg-card/60 p-6 sm:p-7">
      <h2 className="font-display text-[19px] font-medium tracking-tight">
        Что важно знать до оплаты
      </h2>
      <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        <Fact term="Что оплачивается">
          Простая (неисключительная) лицензия на использование программы по
          модели удалённого доступа — подпиской либо разовым доступом к
          отдельной функции. Оборудование и услуги склада в цену не входят.
        </Fact>
        <Fact term="Порядок оплаты">
          Подписка — авансом за расчётный период, месяц или год. Дополнения —
          единовременно, доступ открывается сразу после оплаты. Безналичный
          перевод по счёту либо оплата картой; закрывающие документы — в течение
          пяти рабочих дней.
        </Fact>
        <Fact term="Возврат">
          За подписку деньги возвращаются пропорционально неиспользованным
          полным дням, в течение десяти рабочих дней. Разовое дополнение
          возвращается, только если доступ к нему ещё не открывался: после
          открытия функция считается предоставленной.
        </Fact>
        <Fact term="Изменение цен">
          Новые цены применяются к периодам и покупкам, начинающимся не раньше
          чем через тридцать дней после публикации. Уже оплаченный период и уже
          открытый доступ не пересчитываются.
        </Fact>
      </dl>
      <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
        Полные условия — в{" "}
        <button
          onClick={() => go("/legal/offer")}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          публичной оферте
        </button>
        : эта страница — её неотъемлемая часть.
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
