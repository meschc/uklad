import { useState } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { PLANS, type Plan } from "../../data/plans";
import { money } from "../../data/warehouses";
import { ru, useT, type Copy } from "../../lib/copy";

const T = {
  title: ru("Тарифы"),
  lead: ru("Оплата помесячно, на полгода или на год. Цена фиксируется на оплаченный срок."),
  period: ru("Срок оплаты"),
  perMonth: ru("₽ в месяц"),
  optimal: ru("Оптимальный"),
  choose: ru("Подключить склад"),
  /** Цены на год и на месяц Кирилл ещё не назвал (19 окт). */
  noPrice: ru("[цена]"),
  halfNote: ru("{sum} ₽ за полгода"),
  yearNote: ru("[сумма за год]"),
  monthNote: ru("оплата каждый месяц"),
  startWho: ru("[Описание тарифа «Старт»]"),
  compareHead: ru("Что входит"),
  customTitle: ru("Нужны отдельные условия?"),
  customBody: ru(
    "Несколько складов, своя схема оплаты или нестандартные процессы: обсудим и предложим тариф.",
  ),
  customCta: ru("Связаться с нами"),
};

type Period = "year" | "half" | "month";

const PERIODS: { id: Period; label: Copy }[] = [
  { id: "year", label: ru("На год") },
  { id: "half", label: ru("На полгода") },
  { id: "month", label: ru("На месяц") },
];

/** Порядок от дорогого к дешёвому: дорогая карточка задаёт ориентир. */
const ORDER = ["operator", "warehouse", "start"];

const YES = "✓";
const NO = "—";

/** Строки сравнения: Оператор, Склад, Старт — в порядке карточек. */
const COMPARE: { label: Copy; cells: (Copy | string)[] }[] = [
  { label: ru("Склады"), cells: [ru("несколько"), ru("1"), ru("1")] },
  {
    label: ru("Позиции номенклатуры"),
    cells: [ru("без ограничений"), ru("до 5 000"), ru("до 1 000")],
  },
  { label: ru("Пользователи"), cells: [ru("до 20"), ru("до 5"), ru("до 2")] },
  { label: ru("Роли сотрудников"), cells: [YES, YES, NO] },
  { label: ru("Импорт остатков из XLSX"), cells: [YES, YES, YES] },
  { label: ru("Импорт поставок из XLSX"), cells: [YES, YES, NO] },
  { label: ru("Учёт по клиентам: остатки, отгрузки, биллинг"), cells: [YES, NO, NO] },
];

/**
 * Тарифы с переключателем срока оплаты (19 окт): год, полгода, месяц слева
 * направо, у каждого срока своя иконка. Цены за полгода — из `data/plans`,
 * как и на странице цен; за год и за месяц пока заглушки.
 */
export function Tariffs() {
  const t = useT();
  const [period, setPeriod] = useState<Period>("half");
  const plans = ORDER.map((id) => PLANS.find((p) => p.id === id)).filter((p): p is Plan => !!p);

  const price = (p: Plan) => (period === "half" ? money(p.monthly) : t(T.noPrice));
  const note = (p: Plan) =>
    period === "half"
      ? t(T.halfNote, { sum: money(p.monthly * 6) })
      : t(period === "year" ? T.yearNote : T.monthNote);

  return (
    <section
      id="tariffs"
      className="mx-auto mt-24 max-w-[1280px] scroll-mt-24 px-5 sm:mt-36 sm:px-10"
    >
      <Reveal className="flex flex-col items-center gap-5 text-center">
        <h2 className="wh-h2">{t(T.title)}</h2>
        <p className="wh-muted max-w-[34rem] text-[17px] leading-relaxed">{t(T.lead)}</p>
        <div
          role="radiogroup"
          aria-label={t(T.period)}
          className="inline-flex gap-1 rounded-full p-1 shadow-[inset_0_0_0_1px_var(--wh-line)]"
        >
          {PERIODS.map((p) => {
            const on = p.id === period;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors sm:h-10 sm:gap-2 sm:pl-3.5 sm:pr-[18px] sm:text-sm",
                  on ? "bg-[var(--wh-ink)] text-[var(--wh-ground)]" : "hover:bg-[var(--wh-soft)]",
                )}
              >
                <PeriodIcon id={p.id} />
                {t(p.label)}
              </button>
            );
          })}
        </div>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan, i) => {
          const blue = !!plan.featured;
          return (
            <Reveal
              key={plan.id}
              delay={i * 80}
              as="article"
              className={cn(
                "flex flex-col gap-4 rounded-[22px] p-7",
                blue ? "bg-[var(--wh-blue)] text-white" : "shadow-[inset_0_0_0_1px_var(--wh-line)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[22px] font-medium">{t(plan.title)}</h3>
                {blue && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--wh-blue)]">
                    {t(T.optimal)}
                  </span>
                )}
              </div>
              <p className={cn("flex-1 text-[15px]", blue ? "text-white/80" : "wh-muted")}>
                {plan.id === "start" ? t(T.startWho) : t(plan.who)}
              </p>
              <p className="text-[44px] font-light tracking-[-0.04em]">
                {price(plan)}{" "}
                <span
                  className={cn("text-[15px] tracking-normal", blue ? "text-white/80" : "wh-muted")}
                >
                  {t(T.perMonth)}
                </span>
              </p>
              <p className={cn("text-[13px]", blue ? "text-white/75" : "wh-muted")}>{note(plan)}</p>
              <a
                href="#connect"
                className={cn("wh-btn w-full", blue ? "wh-btn--white" : "wh-btn--soft")}
              >
                {t(T.choose)}
              </a>
            </Reveal>
          );
        })}
      </div>

      {/* Таблица шире телефона: прокручивается внутри себя, страница не едет. */}
      <Reveal className="mt-12 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-[15px]">
          <thead>
            <tr className="border-y border-[var(--wh-line)]">
              <th className="px-4 py-3.5 font-medium">{t(T.compareHead)}</th>
              {plans.map((p) => (
                <th
                  key={p.id}
                  className={cn(
                    "px-4 py-3.5 font-medium",
                    p.featured && "bg-[var(--wh-soft)] text-[var(--wh-blue)]",
                  )}
                >
                  {t(p.title)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((row) => (
              <tr key={row.label.ru} className="border-b border-[var(--wh-line)]">
                <th scope="row" className="wh-muted px-4 py-3.5 font-normal">
                  {t(row.label)}
                </th>
                {row.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(
                      "px-4 py-3.5",
                      plans[i]?.featured && "bg-[var(--wh-soft)]",
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
      </Reveal>

      <Reveal className="mt-8 flex flex-col gap-4 rounded-[22px] px-7 py-6 shadow-[inset_0_0_0_1px_var(--wh-line)] sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div>
          <p className="text-lg font-medium">{t(T.customTitle)}</p>
          <p className="wh-muted mt-1 text-[15px]">{t(T.customBody)}</p>
        </div>
        <a href="#connect" className="wh-btn wh-btn--blue shrink-0">
          {t(T.customCta)}
        </a>
      </Reveal>
    </section>
  );
}

/** Год — полный круг, полгода — половина, месяц — календарь. */
function PeriodIcon({ id }: { id: Period }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {id === "year" && (
        <>
          <circle cx="10" cy="10" r="7.5" />
          <circle cx="10" cy="10" r="3.5" fill="currentColor" />
        </>
      )}
      {id === "half" && (
        <>
          <circle cx="10" cy="10" r="7.5" />
          <path d="M10 2.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" />
        </>
      )}
      {id === "month" && (
        <>
          <rect x="3" y="4" width="14" height="13" rx="3" />
          <path d="M3 8h14M7 2.5v3M13 2.5v3" />
        </>
      )}
    </svg>
  );
}
