import { useState } from "react";
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
    q: ru("Что будет через 3 месяца?"),
    a: ru(
      "Вы продолжаете работу по выбранному тарифу. Пока проект запускается, можно зафиксировать специальную цену на полгода.",
    ),
  },
];

export function Questions() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto mt-28 grid max-w-[1320px] gap-10 px-5 sm:mt-36 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
      <Reveal>
        <h2 className="wh-h2 max-w-[10ch]">{t(T.title)}</h2>
      </Reveal>

      <div className="flex flex-col gap-2">
        {QA.map((item, i) => {
          const on = open === i;
          return (
            <Reveal key={item.q.ru} delay={i * 60}>
              <div
                className={cn(
                  "wh-tile overflow-hidden transition-shadow duration-300",
                  on && "shadow-[inset_0_0_0_2px_var(--wh-blue)]",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(on ? null : i)}
                  aria-expanded={on}
                  className="flex w-full items-center gap-4 px-6 py-5 text-left"
                >
                  <span className="flex-1 text-lg font-medium leading-snug tracking-tight">
                    {t(item.q)}
                  </span>
                  <Plus
                    className={cn(
                      "wh-muted size-5 shrink-0 transition-transform duration-300",
                      on && "rotate-45 !text-[var(--wh-blue)]",
                    )}
                  />
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="wh-muted px-6 pb-6 text-base leading-relaxed">{t(item.a)}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
