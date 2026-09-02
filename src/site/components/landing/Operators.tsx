import { ArrowUpRight, Check } from "lucide-react";
import { Reveal } from "../Reveal";
import { WAREHOUSES } from "../../data/warehouses";
import { plural } from "../../lib/plural";

const GAINS = [
  {
    title: "Адресное хранение и подбор",
    body: "Размещение по правилам, подбор — маршрутом по проходам. Не «Серёга знает, где лежит», а лист сборки.",
  },
  {
    title: "Приёмка, маркировка, отгрузка",
    body: "Приёмка по строкам с расхождениями, печать этикеток и Честного знака, сборка заявок на площадки и единичных заказов.",
  },
  {
    title: "Электронный документооборот",
    body: "Договор, прайс, акты приёмки и расхождений уходят клиенту на подпись через Диадок или СБИС. Подписанный экземпляр возвращается в ту же поставку.",
  },
  {
    title: "Кабинет клиента и чат включены",
    body: "Селлер сам смотрит остатки, статусы и место хранения, а вопрос задаёт в чате у нужной позиции. Минус половина входящих в вотсапе.",
  },
];

const withUklad = WAREHOUSES.filter((w) => w.uklad).length;

/**
 * Вторая аудитория. Селлер и склад читают одну страницу, поэтому блок для
 * складов идёт после того, как человек уже понял продукт — но до FAQ, чтобы
 * оператор не искал «а мне-то что» в подвале.
 */
export function Operators() {
  return (
    <section id="operators" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-primary">
              Складам и фулфилменту
            </p>
            <h2 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[42px]">
              Продвинутая система
              <br />
              работы со складом
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              Сначала система для склада: адреса, приёмка, подбор, отгрузка,
              документы. Витрина идёт в комплекте — и приводит клиентов тому,
              кто ведёт остатки честно.
            </p>
          </Reveal>

          {/* Здесь стояла кнопка «Открыть демо» — и уводила склад со страницы
              ровно в тот момент, когда он дочитал, зачем ему система. Складу
              на этом шаге нужен не тур по интерфейсу, а разговор: он покупает
              систему вместе с потоком клиентов, а такое не выбирают кнопкой. */}
          <Reveal delay={120} className="mt-8 flex flex-wrap gap-3">
            <a
              href="#/contacts"
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Подключить склад
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            <a
              href="#faq"
              className="inline-flex h-11 items-center rounded-full border border-foreground/[0.14] px-5 text-sm font-medium transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04]"
            >
              Как попасть в витрину
            </a>
          </Reveal>

          <Reveal delay={200}>
            <p className="mt-6 text-xs text-muted-foreground">
              {withUklad} {plural(withUklad, "склад", "склада", "складов")} из
              витрины уже подключены — их карточки помечены значком «Уклад».
            </p>
          </Reveal>
        </div>

        {/* Четыре пункта — не четыре карточки. Рамка с заливкой вокруг двух
            строк текста ничего не отделяет: пункты и так стоят в столбце и
            читаются подряд. Она только добавляет четыре прямоугольника туда,
            где хватает волосяной линейки, — и именно из таких «на всякий
            случай обвели» страница набирает тяжесть. */}
        <ul className="divide-y divide-foreground/[0.07] border-y border-foreground/[0.07]">
          {GAINS.map((g, i) => (
            <Reveal key={g.title} as="li" delay={i * 80}>
              <div className="flex gap-4 py-6">
                <Check
                  className="mt-1 size-4 shrink-0 text-primary"
                  strokeWidth={2.5}
                />
                <div>
                  <h3 className="font-display text-[15px] font-medium tracking-tight">
                    {g.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {g.body}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
