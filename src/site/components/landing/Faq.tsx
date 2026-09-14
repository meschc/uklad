import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { c, useT, type Copy, type Vars } from "../../lib/copy";
import { COMPLAINT_ANSWER_DAYS } from "../../lib/reputation";

/**
 * Вопросы выбраны по одному правилу: их задают, когда решение уже почти
 * принято и остаётся страшное — отдать весь свой товар чужим людям и не иметь
 * возможности его увидеть. Отсюда порядок: деньги, ответственность, спор,
 * документы, схемы работы, нестандартный товар, выход со склада.
 *
 * У ответа может быть `vars`: сроки и пороги правил живут в `lib/reputation`, и
 * переписать «14 дней» словами в FAQ значило бы завести второй источник правды,
 * который однажды разойдётся с первым.
 */
const QA: { q: Copy; a: Copy; vars?: Vars }[] = [
  {
    q: c("Сколько это стоит селлеру?", "What does it cost the seller?"),
    a: c(
      "Поиск, фильтры, карточки и заявки — бесплатно и без регистрации. Комиссии с заявки нет: пока витрина не зарабатывает на заявках, у неё нет причины подкручивать выдачу. Платные только дополнения и поштучно: расчёт хранения, сравнение таблицей, визуальное размещение. За работу склада вы платите складу — по прайсу из карточки, без наценки.",
      "Search, filters, cards and requests are free and need no sign-up. There is no commission on a request: while the listing earns nothing from requests, it has no reason to tilt the results. Only add-ons are paid, and one at a time: a storage estimate, a comparison table, visual placement. For the warehouse’s work you pay the warehouse, at the rates in its card, with no markup.",
    ),
  },
  {
    q: c(
      "Кто отвечает, если товар потеряют или повредят?",
      "Who is liable if goods are lost or damaged?",
    ),
    a: c(
      "Склад — по договору хранения. Поэтому и важна приёмка по строкам: в отчёте видно, сколько единиц приехало, сколько принято и что ушло в брак, с фотографиями. Расхождение фиксируется актом в день приёмки, а не всплывает через месяц. Пределы ответственности и страхование — в договоре, который вы подписываете до первой поставки.",
      "The warehouse, under the storage contract. That is why line-by-line intake matters: the report shows how many units arrived, how many were accepted and what went to defects, with photos. A discrepancy is recorded the same day, not a month later. Liability limits and insurance are in the contract you sign before the first delivery.",
    ),
  },
  {
    q: c("Мы со складом не сошлись. Что дальше?", "The warehouse and I disagree. What now?"),
    a: c(
      "Сначала — со складом напрямую: расхождение по приёмке закрывается актом в тот же день, остальное — претензией по договору. Уклад в споре не сторона: договор у вас со складом, деньги идут мимо витрины, и отменить решение склада мы не можем. Что мы можем — не дать спору остаться незаметным. По закрытой сделке вы вправе оставить публичную жалобу на странице склада. У склада есть {days} дней на публичный ответ: ответит — ответ висит рядом с жалобой, промолчит — жалоба считается подтверждённой и остаётся на карточке, а повторное молчание опускает склад в выдаче. Жалоба репутационная: денег она не возвращает и претензию с судом не заменяет.",
      "First, with the warehouse itself: an intake discrepancy is recorded the same day, anything else goes through a formal claim under the contract. Uklad is not a party to the dispute: your contract is with the warehouse, the money never passes through us, and we cannot overrule its decision. What we can do is keep the dispute visible. On a closed deal you may file a public complaint on the warehouse's page. The warehouse has {days} days to answer publicly: if it answers, the answer sits next to the complaint; if it stays silent, the complaint counts as confirmed and stays on the card, and repeated silence pushes the warehouse down the results. A complaint is about reputation: it returns no money and replaces no legal claim.",
    ),
    vars: { days: COMPLAINT_ANSWER_DAYS },
  },
  {
    q: c("Как подписываются договор и акты?", "How are the contract and statements signed?"),
    a: c(
      "Электронной подписью, из кабинета: договор, прайс, акты приёмки и расхождений, отчёты об отгрузке. Уклад отдаёт их в Диадок или СБИС — туда, к чему подключён склад, — а подписанный экземпляр возвращается в ту же поставку.",
      "With an electronic signature, from your account: the contract, the price list, intake and discrepancy statements, shipping reports. Uklad passes them to Diadoc or SBIS — whichever the warehouse uses — and the signed copy comes back to the same delivery.",
    ),
  },
  {
    q: c("Чем FBO отличается от FBS и DBS?", "How do FBO, FBS and DBS differ?"),
    a: c(
      "FBO — товар лежит на складе площадки, она же доставляет. FBS — товар у вас или на фулфилменте, площадка забирает под заказ. DBS — доставляете сами. Склад нужен во всех трёх, но работа разная: под FBO — партии, под FBS — ежедневная сборка заказов.",
      "FBO — the goods sit in the marketplace’s own warehouse and it delivers them. FBS — the goods are with you or at a fulfilment centre, and the marketplace collects them per order. DBS — you deliver yourself. All three need a warehouse, but the work differs: FBO means batches, FBS means picking orders every day.",
    ),
  },
  {
    q: c(
      "У меня хрупкий товар и негабарит. Возьмут?",
      "My goods are fragile and oversized. Will anyone take them?",
    ),
    a: c(
      "Ставки в карточке базовые — по ним склады сравниваются между собой. Хрупкое, негабарит, режим хранения, особая упаковка — всё, что не встаёт в стандартное место, склад считает отдельно. Условия под ваш товар приходят вместе с подтверждением заявки, до договора.",
      "The rates in a card are the base ones — that is what makes warehouses comparable. Fragile, oversized, temperature-controlled, specially packed — anything that does not fit a standard slot is quoted separately. Terms for your goods arrive with the confirmation of your request, before the contract.",
    ),
  },
  {
    q: c("Как я узнаю, что происходит с товаром?", "How do I know what is happening to my goods?"),
    a: c(
      "Из кабинета: остатки и резервы, занятое место, начисленная стоимость, статусы приёмки и каждой отгрузки — те же данные, что у кладовщика. Там же видно, где лежит товар, и там же чат: вопрос задаётся у конкретной позиции.",
      "From your account: stock and reservations, space taken, charges accrued, intake and shipping statuses — the same data the storekeeper sees. It also shows where the goods sit, and the chat is right there: a question is asked against a specific item.",
    ),
  },
  {
    q: c("Что значит значок «Уклад» на карточке?", "What does the “Uklad” badge on a card mean?"),
    a: c(
      "Что склад ведёт учёт в Укладе и у его клиентов есть кабинет: остатки, статусы, документы на подпись, чат, размещение на плане. У остальных — обычная карточка с прайсом и контактами.",
      "That the warehouse runs its records in Uklad and its clients get an account: stock, statuses, documents to sign, chat, placement on the floor plan. The rest have an ordinary card with rates and contacts.",
    ),
  },
  {
    q: c(
      "Можно забрать товар и уйти на другой склад?",
      "Can I take my goods and move to another warehouse?",
    ),
    a: c(
      "Да. Товар ваш, склад его только хранит; порядок вывоза и срок предупреждения — в договоре. Заявка на вывоз оформляется как обычная отгрузка, расчёт закрывается по факту месяца — депозита, который пришлось бы «дожигать», нет.",
      "Yes. The goods are yours, the warehouse only stores them; the removal procedure and the notice period are in the contract. A removal request is filed like any other shipment, and the account closes on the month’s actuals — there is no deposit left to burn through.",
    ),
  },
  {
    q: c(
      "У склада своя WMS. Можно просто попасть в витрину?",
      "The warehouse has its own WMS. Can it just get listed?",
    ),
    a: c(
      "Да. Витрина не требует переезжать на Уклад — карточка, прайс и заявки работают отдельно. Значка «Уклад» и кабинета для клиентов не будет, но искать вас селлеры смогут наравне со всеми.",
      "Yes. The listing does not require moving to Uklad — the card, the price list and requests work on their own. There will be no “Uklad” badge and no client account, but sellers will find you like everyone else.",
    ),
  },
];

const T = {
  eyebrow: c("Вопросы", "Questions"),
  title: c("Коротко о честном", "Short answers to the hard ones"),
  lead: c(
    "То, что спрашивают до того, как отдать чужим людям весь свой товар.",
    "What people ask before handing all of their goods to strangers.",
  ),
};

/**
 * Аккордеон на grid-template-rows: 0fr → 1fr. Это единственный способ плавно
 * раскрыть блок неизвестной высоты без измерения через JS — max-height с
 * запасом всегда даёт либо рывок в конце, либо обрезанный текст.
 */
export function Faq() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-28">
      <SectionHead eyebrow={t(T.eyebrow)} title={t(T.title)} lead={t(T.lead)} />

      <div className="mt-12 flex flex-col gap-2">
        {QA.map((item, i) => {
          const on = open === i;
          return (
            <Reveal key={item.q.ru} delay={i * 60}>
              <div
                className={cn(
                  "r-window overflow-hidden border transition-colors duration-300",
                  on ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card",
                )}
              >
                <button
                  onClick={() => setOpen(on ? null : i)}
                  aria-expanded={on}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left"
                >
                  <span className="flex-1 font-display text-[15px] font-medium tracking-tight sm:text-base">
                    {t(item.q)}
                  </span>
                  <Plus
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                      on && "rotate-45 text-primary",
                    )}
                  />
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: on ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {t(item.a, item.vars)}
                    </p>
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
