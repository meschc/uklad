import { CalendarClock, EyeOff, FileStack } from "lucide-react";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { c, useT } from "../../lib/copy";

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
    title: c("Долго", "Slow"),
    body: c(
      "От «нашёл склад» до первой поставки — неделя-другая: созвоны, пересчёт сметы, поиск окна приёмки. Половина срока — ожидание ответа.",
      "From “found a warehouse” to the first delivery is a week or two: calls, re-quotes, hunting for an intake slot. Half of that is waiting for a reply.",
    ),
  },
  {
    icon: FileStack,
    title: c("Бумаги", "Paperwork"),
    body: c(
      "Договор, прайс, заявка, акты приёмки и расхождений — всё печатают, сканируют и возят курьером. Работа стоит, пока не придёт скан.",
      "The contract, the price list, the request, intake and discrepancy statements — printed, scanned and couriered. Work waits for the scan.",
    ),
  },
  {
    icon: EyeOff,
    title: c("Ничего не видно", "Nothing is visible"),
    body: c(
      "Товар уехал — дальше только вопросы в чат: сколько осталось, приняли ли поставку, ушёл ли заказ. Ответят, когда дойдут руки.",
      "The goods leave, and after that it is questions in a chat: how many are left, was the delivery accepted, did the order ship. You get an answer when someone gets round to it.",
    ),
  },
];

const T = {
  eyebrow: c("Знакомо?", "Sound familiar?"),
  title: c(
    "Между складом и товаром — две недели переписки",
    "Two weeks of email between the goods and the warehouse",
  ),
  lead: c(
    "Пока склад и селлер согласовывают условия в почте и вотсапе, первые дни уходят не на товар.",
    "While the warehouse and the seller agree terms over email and messengers, the first days go to correspondence, not to goods.",
  ),
};

export function Problem() {
  const t = useT();

  return (
    <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
      <SectionHead eyebrow={t(T.eyebrow)} title={t(T.title)} lead={t(T.lead)} />

      {/* Ряд без карточек: три колонки, разделённые волосяной линейкой, и
          иконка прямо на фоне. Карточка вокруг каждого пункта добавляла
          подложку и рамку там, где текста и заголовка достаточно — а три
          подложки подряд превращают перечисление в мозаику. */}
      <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
        {PAINS.map((p, i) => (
          <Reveal
            key={p.title.ru}
            delay={i * 90}
            as="article"
            className="md:px-7 md:first:pl-0 md:last:pr-0"
          >
            <p.icon className="size-5 text-primary" strokeWidth={1.75} />
            <h3 className="mt-4 font-display text-lg font-medium tracking-tight">{t(p.title)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(p.body)}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
