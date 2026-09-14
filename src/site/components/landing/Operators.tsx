import { ArrowUpRight, Check } from "lucide-react";
import { Reveal } from "../Reveal";
import { warehousesRepository } from "../../data/warehousesRepository";
import { c, useT } from "../../lib/copy";
import { eyebrow } from "../../lib/eyebrow";
import { href } from "../../lib/route";

const GAINS = [
  {
    title: c("Адресное хранение и подбор", "Bin storage and picking"),
    body: c(
      "Размещение по правилам, подбор — маршрутом по проходам. Не «Серёга знает, где лежит», а лист сборки.",
      "Put-away by rules, picking by a route through the aisles. Not “Bob knows where it is”, but a pick list.",
    ),
  },
  {
    title: c("Приёмка, маркировка, отгрузка", "Intake, labelling, shipping"),
    body: c(
      "Приёмка по строкам с расхождениями, печать этикеток и Честного знака, сборка заявок на площадки и единичных заказов.",
      "Line-by-line intake with discrepancies, printing labels and Chestny Znak codes, picking both marketplace batches and single orders.",
    ),
  },
  {
    title: c("Электронный документооборот", "Electronic documents"),
    body: c(
      "Договор, прайс и акты уходят клиенту на подпись через Диадок или СБИС. Подписанный экземпляр возвращается в ту же поставку.",
      "The contract, the price list and the statements go to the client for signing via Diadoc or SBIS. The signed copy comes back to the same delivery.",
    ),
  },
  {
    title: c("Кабинет клиента и чат включены", "Client account and chat included"),
    body: c(
      "Селлер сам смотрит остатки, статусы и место хранения, а вопрос задаёт в чате у нужной позиции. Минус половина входящих.",
      "The seller checks stock, statuses and bin locations themselves, and asks questions in a chat pinned to the item. Half the inbound messages disappear.",
    ),
  },
];

const T = {
  eyebrow: c("Складам и фулфилменту", "For warehouses and fulfilment"),
  titleTop: c("Продвинутая система", "An advanced system"),
  titleBottom: c("работы со складом", "for running a warehouse"),
  lead: c(
    "Сначала система для склада: адреса, приёмка, подбор, отгрузка, документы. Витрина идёт в комплекте и приводит клиентов тому, кто ведёт остатки честно.",
    "First a system for the warehouse: bins, intake, picking, shipping, documents. The marketplace comes with it and brings clients to whoever keeps honest stock.",
  ),
  connect: c("Подключить склад", "Add your warehouse"),
  howToList: c("Как попасть в витрину", "How to get listed"),
  connected: c(
    "{n} {word} из витрины уже подключены — их карточки помечены значком «Уклад».",
    "{n} {word} in the listing already run on it — their cards carry the “Uklad” badge.",
  ),
};

const withUklad = warehousesRepository.stats().withUklad;

/**
 * Вторая аудитория. Селлер и склад читают одну страницу, поэтому блок для
 * складов идёт после того, как человек уже понял продукт — но до FAQ, чтобы
 * оператор не искал «а мне-то что» в подвале.
 */
export function Operators() {
  const t = useT();

  return (
    <section id="operators" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-28">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <Reveal>
            <p className={eyebrow("mb-3")}>{t(T.eyebrow)}</p>
            <h2 className="font-display text-[30px] font-medium leading-[1.05] tracking-[-0.02em] sm:text-[42px]">
              {t(T.titleTop)}
              <br />
              {t(T.titleBottom)}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              {t(T.lead)}
            </p>
          </Reveal>

          {/* Здесь стояла кнопка «Открыть демо» — и уводила склад со страницы
              ровно в тот момент, когда он дочитал, зачем ему система. Складу
              на этом шаге нужен не тур по интерфейсу, а разговор: он покупает
              систему вместе с потоком клиентов, а такое не выбирают кнопкой. */}
          <Reveal delay={120} className="mt-8 flex flex-wrap gap-3">
            <a
              href={href("/contacts")}
              className="group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t(T.connect)}
              <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
            {/* Раньше вторая кнопка вела в FAQ — то есть отвечала на вопрос
                «как попасть в витрину» тремя строками в чужом разделе. Теперь
                у склада есть своя страница с разбором по шагам. */}
            <a
              href={href("/warehouses")}
              className="inline-flex h-11 items-center rounded-full border border-foreground/[0.14] px-5 text-sm font-medium transition-colors hover:border-foreground/30 hover:bg-foreground/[0.04]"
            >
              {t(T.howToList)}
            </a>
          </Reveal>

          <Reveal delay={200}>
            <p className="mt-6 text-xs text-muted-foreground">
              {t(T.connected, {
                n: withUklad,
                word: t.plural(
                  withUklad,
                  ["склад", "склада", "складов"],
                  ["warehouse", "warehouses"],
                ),
              })}
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
            <Reveal key={g.title.ru} as="li" delay={i * 80}>
              <div className="flex gap-4 py-6">
                <Check className="mt-1 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                <div>
                  <h3 className="font-display text-[15px] font-medium tracking-tight">
                    {t(g.title)}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(g.body)}
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
