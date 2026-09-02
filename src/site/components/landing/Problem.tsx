import { CalendarClock, EyeOff, FileStack } from "lucide-react";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";

/**
 * Боль. Три пункта, а не десять: список из десяти проблем читается как жалоба,
 * из трёх — как понимание.
 *
 * Формулировки нарочно бытовые. Ни склад, ни селлер не думает «отсутствует
 * прозрачность складских процессов» — думают «опять неделю согласовывали» и
 * «мне снова не отвечают в вотсапе».
 */
const PAINS = [
  {
    icon: CalendarClock,
    title: "Долго",
    body: "От «нашёл склад» до первой поставки — неделя-другая: созвоны, пересчёт сметы, поиск окна на приёмку. Половина срока — ожидание ответа.",
  },
  {
    icon: FileStack,
    title: "Бумаги",
    body: "Договор, прайс, заявка, акты приёмки и расхождений, отчёт комиссионера — всё печатают, сканируют и возят курьером. Работа стоит, пока не придёт скан.",
  },
  {
    icon: EyeOff,
    title: "Ничего не видно",
    body: "Товар уехал — дальше только вопросы в чат: сколько осталось, приняли ли поставку, ушёл ли заказ. Ответ придёт, когда у кладовщика дойдут руки.",
  },
];

export function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
      <SectionHead
        eyebrow="Знакомо?"
        title="Между складом и товаром — две недели переписки"
        lead="Пока склад и селлер согласовывают условия в почте и вотсапе, первые дни уходят на переписку, а не на товар."
      />

      {/* Ряд без карточек: три колонки, разделённые волосяной линейкой, и
          иконка прямо на фоне. Карточка вокруг каждого пункта добавляла
          подложку и рамку там, где текста и заголовка достаточно — а три
          подложки подряд превращают перечисление в мозаику. */}
      <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        {PAINS.map((p, i) => (
          <Reveal key={p.title} delay={i * 90} as="article" className="md:px-7 md:first:pl-0 md:last:pr-0">
            <p.icon className="size-5 text-primary" strokeWidth={1.75} />
            <h3 className="mt-4 font-display text-lg font-medium tracking-tight">
              {p.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {p.body}
            </p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
