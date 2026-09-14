import { CountUp } from "../CountUp";
import { Reveal } from "../Reveal";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT } from "../../lib/copy";

const stats = warehousesRepository.stats();

const STATS = [
  {
    id: "warehouses",
    value: stats.total,
    suffix: "",
    label: c("складов на витрине", "warehouses listed"),
  },
  { id: "cities", value: stats.cities, suffix: "", label: c("городов и хабов", "cities and hubs") },
  {
    id: "cells",
    value: stats.freeCells,
    suffix: "",
    label: c("свободных мест хранения", "free storage slots"),
  },
  {
    id: "price",
    value: stats.cheapest,
    prefix: c("от ", "from "),
    suffix: " ₽",
    label: c("за место хранения в сутки", "per storage slot a day"),
  },
];

/**
 * Полоса цифр между «как сейчас» и «как будет». Числа не выдуманы вручную —
 * они посчитаны из тех же карточек, которые человек через минуту увидит в
 * витрине. Если витрина изменится, полоса изменится вместе с ней.
 *
 * Заливки у полосы больше нет — только две волосяные линейки сверху и снизу.
 * Подложка другого тона отделяет полосу от страницы ровно так же, как линейка,
 * но заодно делает её отдельным предметом: ещё одним прямоугольником, который
 * надо заметить.
 *
 * Подписи под цифрами тоже нет. Стояла строка «столько-то складов уже работают
 * в Укладе» — и ровно то же самое сказано ниже, в блоке для складов, и третий
 * раз в вопросах, где объясняется значок. Полоса цифр в этом счёте лишняя: она
 * про витрину целиком, а не про то, кто в ней подключён.
 */
export function Numbers() {
  const t = useT();

  return (
    <section className="border-y border-foreground/[0.07]">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        {/* На широком экране числа стоят в один ряд и разделены такими же
            волосяными вертикалями — так же, как разложены колонки у страниц,
            с которых взят ориентир. На узком ряд ломается на две строки, и
            вертикаль пришлась бы посреди строки, поэтому только с lg. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-foreground/[0.07]">
          {STATS.map((s, i) => (
            <Reveal key={s.id} delay={i * 80} className="text-center lg:px-6">
              <CountUp
                to={s.value}
                prefix={s.prefix && t(s.prefix)}
                suffix={s.suffix}
                className="block font-display text-[34px] font-medium tabular-nums tracking-[-0.02em] text-primary sm:text-[46px]"
              />
              <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{t(s.label)}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
