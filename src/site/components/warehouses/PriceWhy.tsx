import { cn } from "@/lib/utils";
import { money } from "../../data/warehouses";
import { ru, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";
import { BREAKDOWN, MARKET, NO, YES } from "./tariffsData";

const T = {
  title: ru("Из чего складывается цена"),
  lead: ru(
    "В тариф входят три системы: учёт склада, кабинет для селлеров и управление сотрудниками. По отдельности они стоят от 25 000 ₽ в месяц. В Укладе они работают вместе: селлер отправил заявку, сотрудник получил задание на сборку, остатки обновились.",
  ),
  lead2: ru(
    "Подключение бесплатное: склад загружает товары из Excel и начинает работать в тот же день. Сервер на складе и лицензии не нужны.",
  ),
  example: ru("Пример: тариф «Склад», 9 900 ₽ в месяц"),
  separately: ru("Отдельно на рынке"),
  total: ru("Итого"),
  compareTitle: ru("Уклад и другие решения"),
  head: [ru("Уклад, тариф «Склад»"), ru("Облачная система учёта склада"), ru("Коробочная система")],
  note: ru("Средние данные рынка"),
  noteBody: ru(
    "По открытым тарифам облачных и коробочных систем учёта склада для фулфилмента в России, октябрь 2026 года. Цены отдельных систем могут отличаться.",
  ),
};

/** Обоснование цены и сравнение с типами решений (Кирилл, 20 окт). */
export function PriceWhy() {
  const t = useT();
  return (
    <div className="mt-20 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-20">
      <Reveal className="flex flex-col gap-4">
        <h3 className="wh-h3">{t(T.title)}</h3>
        <p className="wh-muted text-base leading-relaxed">{t(T.lead)}</p>
        <p className="wh-muted text-base leading-relaxed">{t(T.lead2)}</p>
      </Reveal>

      <Reveal className="flex flex-col gap-10">
        <div>
          <div className="flex items-center justify-between gap-4 border-b border-[var(--wh-line)] pb-3 text-[13px]">
            <span className="wh-muted">{t(T.example)}</span>
            <span className="wh-muted flex items-center gap-1.5">
              {t(T.separately)}
              <MarketNote />
            </span>
          </div>
          {BREAKDOWN.map((part) => (
            <div
              key={part.title.ru}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 border-b border-[var(--wh-line)] py-4 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]"
            >
              <div>
                <p className="text-[17px] font-medium">{t(part.title)}</p>
                <p className="wh-muted text-[15px]">{t(part.body)}</p>
              </div>
              <p className="text-[17px] tabular-nums sm:text-right">{money(part.price)} ₽</p>
              <p className="wh-muted col-span-2 text-[15px] sm:col-span-1 sm:text-right">
                {t(part.market)}
              </p>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 py-4 font-medium sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
            <p className="text-[17px]">{t(T.total)}</p>
            <p className="text-[17px] tabular-nums sm:text-right">
              {money(BREAKDOWN.reduce((s, p) => s + p.price, 0))} ₽
            </p>
            <p className="col-span-2 text-[15px] sm:col-span-1 sm:text-right">от 25 000 ₽</p>
          </div>
        </div>

        <div>
          <p className="mb-3 flex items-center gap-1.5 text-lg font-medium">
            {t(T.compareTitle)}
            <MarketNote />
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[15px]">
              <thead>
                <tr className="border-y border-[var(--wh-line)]">
                  <th className="px-4 py-3.5" />
                  {T.head.map((h, i) => (
                    <th
                      key={h.ru}
                      className={cn(
                        "px-4 py-3.5 font-medium",
                        i === 0 && "bg-[var(--wh-soft)] text-[var(--wh-blue)]",
                      )}
                    >
                      {t(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MARKET.map((row) => (
                  <tr key={row.label.ru} className="border-b border-[var(--wh-line)]">
                    <th scope="row" className="wh-muted px-4 py-3.5 font-normal">
                      {t(row.label)}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-4 py-3.5",
                          i === 0 && "bg-[var(--wh-soft)]",
                          cell === YES && "text-[var(--wh-blue)]",
                          cell === NO && "wh-muted",
                        )}
                      >
                        {typeof cell === "string" ? cell : t(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/**
 * Сноска «по средним данным рынка» — значок вопроса с подсказкой. Подсказка
 * открывается и наведением, и фокусом: с телефона до неё дотягиваются тапом.
 */
function MarketNote() {
  const t = useT();
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={t(T.note)}
        className="wh-muted inline-flex size-5 items-center justify-center rounded-full text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--wh-line)] hover:text-[var(--wh-ink)] focus-visible:text-[var(--wh-ink)]"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 w-64 rounded-xl bg-[var(--wh-ink)] px-3.5 py-2.5 text-left text-[13px] font-normal leading-snug text-[var(--wh-ground)] opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        <span className="font-medium">{t(T.note)}.</span> {t(T.noteBody)}
      </span>
    </span>
  );
}
