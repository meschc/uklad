import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { SectionHead } from "../SectionHead";
import { useScrollProgress } from "../../lib/useScrollProgress";
import { c, useT } from "../../lib/copy";

const STEPS = [
  {
    n: "01",
    title: c("Выбираете склад", "You pick a warehouse"),
    body: c(
      "Город, схема работы, площадки, услуги, потолок цены — витрина сразу показывает, сколько складов подходит. Прайс у всех по одним строкам, оплата по факту месяца, без депозита.",
      "City, fulfilment scheme, marketplaces, services, a price ceiling — the listing shows at once how many warehouses fit. Every price list has the same lines, and everyone bills by the month, no deposit.",
    ),
  },
  {
    n: "02",
    title: c("Склад подтверждает и вы подписываете", "The warehouse confirms, you sign"),
    body: c(
      "Склад отвечает, сможет ли принять товар, и присылает условия под ваш груз. Договор и прайс подписываются электронно, из кабинета.",
      "The warehouse answers whether it can take the goods and sends terms for your cargo. The contract and the price list are signed electronically, from your account.",
    ),
  },
  {
    n: "03",
    title: c("Отправляете товар, склад принимает", "You ship, the warehouse receives"),
    body: c(
      "Вы называете дату, склад бронирует окно приёмки. Считают по строкам: что приехало, что не сошлось с накладной, что в брак. Отчёт приходит сам.",
      "You name the date, the warehouse books an intake slot. Counting goes line by line: what arrived, what did not match the waybill, what went to defects. The report arrives on its own.",
    ),
  },
  {
    n: "04",
    title: c("Создаёте заявку на отправку", "You create a shipment request"),
    body: c(
      "Партия на маркетплейс или заказ одному покупателю — заявка одна. Склад собирает, маркирует и отгружает, вы видите шаг сборки.",
      "A batch for a marketplace or a single customer order — the request is the same. The warehouse picks, labels and ships, and you see which step picking is on.",
    ),
  },
  {
    n: "05",
    title: c("Следите за статусом", "You watch the status"),
    body: c(
      "Остатки, занятое место, начисленная стоимость, статусы приёмки и отправки — из той же WMS, где работает кладовщик. Не выгрузка на вчера, а сейчас.",
      "Stock, space taken, charges accrued, intake and shipping statuses — from the same WMS the storekeeper works in. Not yesterday’s export, but now.",
    ),
  },
];

const T = {
  eyebrow: c("Путь товара", "The path of the goods"),
  title: c(
    "От «нужен склад» до товара у покупателя",
    "From “we need a warehouse” to goods at the buyer",
  ),
  // Подводка не пересказывает шаги: под ней они и написаны, пятью абзацами.
  // Раньше стояло ровно то же самое, что в первом экране, — и человек читал
  // одно предложение дважды за минуту.
  lead: c(
    "Пять шагов внутри системы — от фильтра на витрине до отчёта об отгрузке.",
    "Five steps inside the system — from a filter on the listing to the shipping report.",
  ),
};

/**
 * Путь товара. Линия слева заполняется по мере прокрутки — не ради эффекта:
 * она показывает, что шаги идут по порядку и что их конечное число, то есть
 * отвечает на вопрос «а долго ли это» ещё до чтения.
 *
 * Подложки под секцией нет. Была: подкрашенная панель `ink`, поверх неё
 * сетка-миллиметровка с маской, а поверх — рельс со шкалой. Сетка осталась
 * (она тут по делу — это чертёж), но лежит прямо на фоне страницы: слой
 * вместо трёх.
 */
export function HowItWorks() {
  const t = useT();
  const [ref, progress] = useScrollProgress<HTMLDivElement>();
  const listRef = useRef<HTMLOListElement>(null);
  const rail = useRailSpan(listRef);

  return (
    <section id="how" className="relative overflow-hidden border-y border-border py-24 sm:py-28">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(110%_70%_at_50%_0%,#000,transparent_78%)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead eyebrow={t(T.eyebrow)} title={t(T.title)} lead={t(T.lead)} />

        {/* Колонка уже секции и по центру: заголовок центрован, и если рельс
            прижать к левому краю страницы, правая половина остаётся пустой. */}
        <div ref={ref} className="relative mx-auto mt-16 max-w-3xl pl-12 sm:pl-16">
          {/* Рельс и его заполнение. Заполнение — отдельный слой поверх, чтобы
              не пересчитывать градиент на каждый кадр.

              Сдвиг рельса по горизонтали считается от кружка, а не подбирается
              на глаз: кружок стоит вплотную к левому краю колонки (`-left-12`
              при `pl-12`), поэтому его центр — это половина его же размера. На
              узком экране кружок 32px → центр 16px, с sm он 36px → центр 18px.
              Раньше здесь стояло `sm:left-6` (24px), и линия проходила мимо
              цифр на шесть точек правее.

              По вертикали оба конца стоят на кружках — см. `useRailSpan`. */}
          <div
            className="absolute left-4 w-px bg-border sm:left-[18px]"
            style={{ top: rail.top, height: rail.height }}
          />
          <div
            className="absolute left-4 w-px origin-top bg-primary sm:left-[18px]"
            style={{ top: rail.top, height: rail.height * progress }}
          />

          <ol ref={listRef} className="flex flex-col gap-10 sm:gap-14">
            {STEPS.map((s, i) => {
              // Шаг «зажигается», когда линия дошла до него.
              const active = progress > (i + 0.35) / STEPS.length;
              return (
                <Reveal key={s.n} as="li" delay={i * 70} className="relative">
                  <span
                    className={cn(
                      "absolute -left-12 top-1 flex size-8 items-center justify-center rounded-full border text-[11px] font-bold transition-all duration-500 sm:-left-16 sm:size-9",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {s.n}
                  </span>
                  <h3
                    className={cn(
                      "font-display text-xl font-medium tracking-tight transition-colors duration-500 sm:text-2xl",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {t(s.title)}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                    {t(s.body)}
                  </p>
                </Reveal>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** Отрезок рельса в координатах колонки: где начать и сколько тянуть. */
interface RailSpan {
  top: number;
  height: number;
}

/**
 * Где линия шагов начинается и где кончается.
 *
 * Раньше рельс тянулся от верха колонки до её низа — то есть кончался под
 * последним абзацем, уже за последним кружком. Линия, которая уходит вниз
 * после пятого шага, обещает шестой, а его нет.
 *
 * Оба конца поэтому стоят на кружках, и считаются по самим кружкам, а не
 * двумя подобранными числами: размер кружка меняется с шириной экрана, и
 * подобранные числа разошлись бы с вёрсткой при первой же правке.
 */
function useRailSpan(listRef: RefObject<HTMLOListElement>): RailSpan {
  const [span, setSpan] = useState<RailSpan>({ top: 0, height: 0 });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    /** Центр кружка шага в координатах колонки. */
    const centerOf = (item: Element | undefined): number | null => {
      if (!(item instanceof HTMLElement)) return null;
      // Кружок — первый элемент шага и позиционирован от него же.
      const marker = item.firstElementChild;
      if (!(marker instanceof HTMLElement)) return null;
      return item.offsetTop + marker.offsetTop + marker.offsetHeight / 2;
    };

    const measure = () => {
      const items = Array.from(list.children);
      const first = centerOf(items[0]);
      const last = centerOf(items[items.length - 1]);
      if (first === null || last === null) return;
      setSpan({ top: first, height: Math.max(0, last - first) });
    };

    // Высота шагов меняется не только от ширины окна: пока доезжает шрифт,
    // абзацы переносятся иначе, и отрезок, посчитанный при монтировании,
    // указывает мимо кружка.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [listRef]);

  return span;
}
