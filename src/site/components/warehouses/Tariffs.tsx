import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { PLANS, YEARLY_DISCOUNT } from "../../data/plans";
import { money } from "../../data/warehouses";
import { ru, useT } from "../../lib/copy";

const T = {
  title: ru("Тарифы"),
  special: ru(
    "Проект только запускается, поэтому сейчас можно получить специальную цену: она фиксируется на полгода при оплате за этот срок.",
  ),
  perMonth: ru("₽ в месяц"),
  yearly: ru("При оплате за год скидка {p} %."),
  optimal: ru("Оптимальный"),
  choose: ru("Подключить склад"),
  corpTitle: ru("Корпоративный"),
  corpPrice: ru("Цена по запросу"),
  corpBody: ru(
    "Сетям складов и компаниям со своими требованиями: отдельный сервер, интеграции с учётной системой, отдельный договор.",
  ),
  corpCta: ru("Обсудить"),
};

/**
 * Тарифы от дорогого к дешёвому (решение 19 окт): дорогая карточка первой
 * задаёт ориентир, и средний тариф после неё читается как разумный.
 * Корпоративный идёт отдельной полосой — у него нет цены, и сравнивать его с
 * карточками по рублям нельзя.
 *
 * Цифры берутся из `data/plans`, как и на странице цен: прайс один.
 */
export function Tariffs() {
  const t = useT();
  const plans = [...PLANS].sort((a, b) => b.monthly - a.monthly);

  return (
    <section
      id="tariffs"
      className="mx-auto mt-28 max-w-[1320px] scroll-mt-24 px-5 sm:mt-36 sm:px-10"
    >
      <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end lg:gap-20">
        <h2 className="wh-h2">{t(T.title)}</h2>
        <p className="wh-statement">{t(T.special)}</p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {plans.map((plan, i) => {
          const blue = !!plan.featured;
          return (
            <Reveal
              key={plan.id}
              delay={i * 80}
              as="article"
              className={cn(blue ? "wh-blue" : "wh-tile", "flex flex-col p-6 sm:p-8")}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="wh-h3">{t(plan.title)}</h3>
                {blue && (
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--wh-blue)]">
                    {t(T.optimal)}
                  </span>
                )}
              </div>
              <p
                className={cn("mt-2 text-sm leading-relaxed", blue ? "text-white/80" : "wh-muted")}
              >
                {t(plan.who)}
              </p>

              <p className="mt-8 flex items-baseline gap-2">
                <span className="wh-num !text-[clamp(52px,5vw,76px)]">{money(plan.monthly)}</span>
                <span className={cn("text-sm", blue ? "text-white/80" : "wh-muted")}>
                  {t(T.perMonth)}
                </span>
              </p>

              <ul className="mt-8 flex flex-1 flex-col gap-3">
                {plan.features.slice(0, 5).map((f) => (
                  <li key={f.ru} className="flex gap-3 text-base leading-snug">
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        blue ? "text-white" : "text-[var(--wh-blue)]",
                      )}
                      strokeWidth={2.25}
                    />
                    {t(f)}
                  </li>
                ))}
              </ul>

              <a
                href="#connect"
                className={cn("wh-btn mt-8 w-full", blue ? "wh-btn--white" : "wh-btn--blue")}
              >
                {t(T.choose)}
              </a>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="wh-ink mt-3 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="wh-h3">{t(T.corpTitle)}</h3>
            <span className="text-sm opacity-70">{t(T.corpPrice)}</span>
          </div>
          <p className="mt-2 max-w-2xl text-base leading-relaxed opacity-75">{t(T.corpBody)}</p>
        </div>
        <a href="#connect" className="wh-btn wh-btn--white shrink-0">
          {t(T.corpCta)}
        </a>
      </Reveal>

      <p className="wh-muted mt-5 text-sm">{t(T.yearly, { p: YEARLY_DISCOUNT * 100 })}</p>
    </section>
  );
}
