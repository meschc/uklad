import { useState } from "react";
import { OFFER, monthsRu } from "../../data/offer";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { ru, useT, type Copy } from "../../lib/copy";

const T = {
  title: ru("Что ещё важно знать"),
};

/**
 * Только вопросы, которые остановят заявку; остальное обсуждается на
 * знакомстве. Про оборудование отвечаем «нет»: самый частый страх небольшого
 * склада — покупка ТСД. Про камеру телефона не пишем, пока нет функции
 * (узел `cab-phone-scan`): сейчас сканирование только сканером-клавиатурой.
 */
const QA: { q: Copy; a: Copy }[] = [
  {
    q: ru("У нас уже есть система или Excel. Что с ними?"),
    a: ru("Поможем перенести товары и остатки из Excel или вашей программы учёта."),
  },
  {
    q: ru("Мы храним только собственный товар, без клиентов. Подойдёт?"),
    a: ru(
      "Да. Хранение, сотрудники, задачи и документооборот работают и без кабинета для клиентов. Его можно включить, когда клиенты появятся.",
    ),
  },
  {
    q: ru("Нужно ли специальное оборудование?"),
    a: ru("Нет. Система работает со сканерами штрихкодов и ТСД, код можно ввести и вручную."),
  },
  {
    q: ru("Где хранятся данные?"),
    a: ru("На серверах в российском дата-центре."),
  },
  {
    q: ru("Кто видит данные моего склада?"),
    a: ru(
      "Только вы и клиенты, которым вы дали доступ, каждый свои товары. В каталоге только то, что вы решили показать.",
    ),
  },
  {
    q: ru("Почему нельзя оплатить сразу на несколько лет?"),
    a: ru(
      "Сейчас трудно планировать на несколько лет вперёд, и нам, и складам. Поэтому предлагаем гибкие сроки: месяц, полгода или год. Цена фиксируется на оплаченный срок, дальше вы решаете, продлевать ли.",
    ),
  },
  {
    q: ru(`Что будет через ${monthsRu(OFFER.freeMonths)}?`),
    a: ru(
      "Вы продолжаете работу по выбранному тарифу. Пока проект запускается, можно зафиксировать специальную цену на полгода.",
    ),
  },
];

export function Questions() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section
      id="faq"
      className="mx-auto mt-24 grid max-w-[1280px] scroll-mt-24 grid-cols-1 gap-10 px-5 sm:mt-36 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-20"
    >
      <Reveal>
        <h2 className="wh-h2 max-w-[9ch]">{t(T.title)}</h2>
      </Reveal>

      <div className="border-t border-[var(--wh-line)]">
        {QA.map((item, i) => {
          const on = open === i;
          return (
            <Reveal key={item.q.ru} delay={i * 50} className="border-b border-[var(--wh-line)]">
              <button
                type="button"
                onClick={() => setOpen(on ? null : i)}
                aria-expanded={on}
                className="flex w-full items-start justify-between gap-4 py-6 text-left"
              >
                <span className="text-[19px] font-medium leading-snug">{t(item.q)}</span>
                <Plus
                  className={cn(
                    "mt-0.5 size-5 shrink-0 text-[var(--wh-blue)] transition-transform duration-300",
                    on && "rotate-45",
                  )}
                />
              </button>
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out"
                style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <p className="wh-muted max-w-[40rem] pb-6 text-base leading-relaxed">
                    {t(item.a)}
                  </p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
