import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { money } from "../../data/warehouses";
import { ru, useT } from "../../lib/copy";
import { useOverlay } from "../../lib/useOverlay";
import { BREAKDOWN, MARKET, NO, YES } from "./tariffsData";

const T = {
  title: ru("Из чего складывается цена"),
  lead: ru(
    "В тариф входят три системы: учёт склада, кабинет для селлеров и управление сотрудниками. По отдельности они стоят от 25 000 ₽ в месяц. В Укладе они работают вместе: селлер отправил заявку, сотрудник получил задание на сборку, остатки обновились.",
  ),
  lead2: ru(
    "Подключение бесплатное: склад загружает товары из Excel и начинает работать в тот же день. Сервер на складе и лицензии не нужны.",
  ),
  example: ru("Тариф «Склад», в месяц"),
  separately: ru("Отдельно на рынке"),
  total: ru("Итого"),
  marketTotal: ru("от 25 000 ₽"),
  ours: ru("В Укладе"),
  close: ru("Закрыть"),
  compareTitle: ru("Уклад и другие решения"),
  head: [ru("Уклад"), ru("Облачная система"), ru("Коробочная система")],
  note: ru("Средние данные рынка"),
  noteBody: ru(
    "По открытым тарифам облачных и коробочных систем учёта склада для фулфилмента в России, октябрь 2026 года. Цены отдельных систем могут отличаться.",
  ),
};

const ROW =
  "grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-start gap-x-4 sm:grid-cols-[minmax(0,1fr)_6.5rem_8rem] sm:gap-x-6";

/**
 * Обоснование цены и сравнение с рынком — в шторке (Кирилл, 20 окт): на
 * странице это было полотном текста. На компьютере шторка выезжает справа, на
 * телефоне — снизу, как системный лист. Закрывается крестиком, фоном и Esc.
 */
export function PriceSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  useOverlay(true, onClose);
  const total = BREAKDOWN.reduce((s, p) => s + p.price, 0);

  return (
    <div className="wh fixed inset-0 z-[90]">
      <div aria-hidden className="absolute inset-0 animate-fade-in bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-sheet-title"
        className="absolute inset-x-0 bottom-0 flex max-h-[90vh] animate-slide-up flex-col rounded-t-[22px] bg-[var(--wh-ground)] text-[var(--wh-ink)] shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(600px,100vw)] sm:animate-slide-in-right sm:rounded-none sm:rounded-l-[22px]"
      >
        <span
          aria-hidden
          className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-[var(--wh-line)] sm:hidden"
        />
        <header className="flex items-center justify-between gap-4 px-6 pb-2 pt-4 sm:px-8 sm:pt-7">
          <h2 id="price-sheet-title" className="wh-h3">
            {t(T.title)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(T.close)}
            className="grid size-9 place-items-center rounded-full transition-colors hover:bg-[var(--wh-soft)]"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 sm:px-8">
          <p className="wh-muted text-base leading-relaxed">{t(T.lead)}</p>
          <p className="wh-muted mt-3 text-base leading-relaxed">{t(T.lead2)}</p>

          {/* Три колонки одной ширины во всех строках: цифры Уклада и рынка
              стоят ровными столбцами (Кирилл, 20 окт). */}
          <div className={cn(ROW, "mt-8 border-b border-[var(--wh-line)] pb-3 text-[13px]")}>
            <span className="wh-muted">{t(T.example)}</span>
            <span className="wh-muted text-right">{t(T.ours)}</span>
            <span className="wh-muted flex items-center justify-end gap-1.5 text-right">
              {t(T.separately)}
              <MarketNote />
            </span>
          </div>
          {BREAKDOWN.map((part) => (
            <div key={part.title.ru} className={cn(ROW, "border-b border-[var(--wh-line)] py-4")}>
              <p className="text-[17px] font-medium">{t(part.title)}</p>
              <p className="whitespace-nowrap text-right text-[17px] tabular-nums sm:row-span-2">
                {money(part.price)} ₽
              </p>
              <p className="wh-muted text-right text-[15px] tabular-nums sm:row-span-2">
                {t(part.market)}
              </p>
              {/* На телефоне описание идёт под строкой во всю ширину, на
                  компьютере — под названием, в первой колонке. */}
              <p className="wh-muted col-span-3 mt-1 text-[15px] sm:col-span-1">{t(part.body)}</p>
            </div>
          ))}
          <div className={cn(ROW, "py-4 font-medium")}>
            <p className="text-[17px]">{t(T.total)}</p>
            <p className="whitespace-nowrap text-right text-[17px] tabular-nums">
              {money(total)} ₽
            </p>
            <p className="whitespace-nowrap text-right text-[15px] tabular-nums">
              {t(T.marketTotal)}
            </p>
          </div>

          <p className="mb-3 mt-8 flex items-center gap-1.5 text-lg font-medium">
            {t(T.compareTitle)}
            <MarketNote />
          </p>
          <div className="flex flex-col">
            {MARKET.map((row) => (
              <div key={row.label.ru} className="border-b border-[var(--wh-line)] py-3.5">
                <p className="wh-muted mb-2 text-[13px]">{t(row.label)}</p>
                <dl className="grid grid-cols-3 gap-3 text-[15px]">
                  {row.cells.map((cell, i) => (
                    <div key={i}>
                      <dt className="wh-muted text-[12px]">{t(T.head[i])}</dt>
                      <dd
                        className={cn(
                          cell === YES && "text-[var(--wh-blue)]",
                          cell === NO && "wh-muted",
                          i === 0 && "font-medium",
                        )}
                      >
                        {typeof cell === "string" ? cell : t(cell)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </div>
      </div>
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
