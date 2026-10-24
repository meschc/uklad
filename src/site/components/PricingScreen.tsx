import { FileText, ReceiptText, RotateCcw, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { href } from "../lib/route";
import { c, useT } from "../lib/copy";
import { Reveal } from "./Reveal";
import { FinalConnect } from "./warehouses/FinalConnect";
import { Tariffs } from "./warehouses/Tariffs";

const T = {
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
 * Тарифы (решение 23 окт): те же тарифы, что на странице для складов, —
 * Оператор, Склад, Старт и свой; цены и лимиты берутся из `data/plans` и
 * `data/offer`, вторых чисел на сайте нет.
 *
 * Страница обязательная, а не только продающая: оферта ссылается на неё как на
 * свою неотъемлемую часть, поэтому под тарифами — что именно оплачивается,
 * порядок оплаты, возврат и изменение цен. В конце — заявка на подключение:
 * кнопки тарифов ведут к ней (`#connect`) на этой же странице.
 *
 * Поштучные дополнения для селлеров со старой страницы сняты вместе с
 * селлерской веткой витрины (на паузе, Кирилл 21 окт).
 */
export function PricingScreen() {
  return (
    <>
      <Tariffs page />
      <PaymentFacts />
      <FinalConnect />
    </>
  );
}

/** Условия, которые обязана раскрыть страница, входящая в оферту. */
function PaymentFacts() {
  const t = useT();

  return (
    <section className="mx-auto mt-24 max-w-[1280px] px-5 sm:mt-32 sm:px-10">
      <Reveal>
        <h2 className="wh-h2 max-w-[16ch]">{t(T.factsTitle)}</h2>
        <dl className="mt-10 grid gap-4 sm:grid-cols-2">
          <Fact icon={<FileText className="size-5" />} term={t(T.factWhatTerm)}>
            {t(T.factWhat)}
          </Fact>
          <Fact icon={<ReceiptText className="size-5" />} term={t(T.factOrderTerm)}>
            {t(T.factOrder)}
          </Fact>
          <Fact icon={<RotateCcw className="size-5" />} term={t(T.factRefundTerm)}>
            {t(T.factRefund)}
          </Fact>
          <Fact icon={<TrendingUp className="size-5" />} term={t(T.factPricesTerm)}>
            {t(T.factPrices)}
          </Fact>
        </dl>
        <p className="mt-6 text-sm leading-relaxed text-[var(--wh-muted)]">
          {t(T.offerBefore)}
          <a
            href={href("/legal/offer")}
            className="font-medium text-[var(--wh-blue)] transition-opacity hover:opacity-75"
          >
            {t(T.offerLink)}
          </a>
          {t(T.offerAfter)}
        </p>
      </Reveal>
    </section>
  );
}

function Fact({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="flex h-full flex-col gap-4 rounded-[22px] bg-[var(--wh-soft)] p-6 sm:p-7">
      <span className="text-[var(--wh-blue)]">{icon}</span>
      <dt className="wh-h3">{term}</dt>
      <dd className="text-[15px] leading-relaxed text-[var(--wh-muted)]">{children}</dd>
    </div>
  );
}
