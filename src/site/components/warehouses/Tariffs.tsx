import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { PLANS, YEARLY_DISCOUNT } from "../../data/plans";
import { money } from "../../data/warehouses";
import { ru, useT } from "../../lib/copy";

const T = {
  eyebrow: ru("Цена"),
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
    <section id="tariffs" className="mx-auto mt-20 max-w-6xl scroll-mt-24 px-4 sm:mt-24 sm:px-6">
      <SectionHead align="left" eyebrow={t(T.eyebrow)} title={t(T.title)} lead={t(T.special)} />

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {plans.map((plan, i) => (
          <Reveal
            key={plan.id}
            delay={i * 80}
            as="article"
            className={cn(
              "r-window flex flex-col border p-5 sm:p-6",
              plan.featured ? "border-primary/50 bg-primary/5" : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-heading tracking-tight">{t(plan.title)}</h3>
              {plan.featured && (
                <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {t(T.optimal)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(plan.who)}</p>

            <p className="mt-5">
              <span className="font-display text-3xl font-medium tabular-nums tracking-tight">
                {money(plan.monthly)}
              </span>{" "}
              <span className="text-sm text-muted-foreground">{t(T.perMonth)}</span>
            </p>

            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {plan.features.slice(0, 5).map((f) => (
                <li key={f.ru} className="flex gap-2.5 text-sm leading-snug">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.25} />
                  {t(f)}
                </li>
              ))}
            </ul>

            <Button
              asChild
              size="lg"
              shape="pill"
              variant={plan.featured ? "default" : "outline"}
              className="mt-6 w-full"
            >
              <a href="#connect">{t(T.choose)}</a>
            </Button>
          </Reveal>
        ))}
      </div>

      <Reveal className="r-window mt-4 flex flex-col gap-4 border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-6">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h3 className="font-display text-lg font-heading tracking-tight">{t(T.corpTitle)}</h3>
            <span className="text-sm text-muted-foreground">{t(T.corpPrice)}</span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t(T.corpBody)}
          </p>
        </div>
        <Button
          asChild
          size="lg"
          shape="pill"
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
        >
          <a href="#connect">{t(T.corpCta)}</a>
        </Button>
      </Reveal>

      <p className="mt-4 text-sm text-muted-foreground">
        {t(T.yearly, { p: YEARLY_DISCOUNT * 100 })}
      </p>
    </section>
  );
}
