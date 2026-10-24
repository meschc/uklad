import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Reveal } from "../Reveal";
import { PLANS, monthlyFor, type PayPeriod, type Plan } from "../../data/plans";
import { money } from "../../data/warehouses";
import { ru, useT, type Copy } from "../../lib/copy";
import { AsciiField } from "./AsciiField";
import { PriceSheet } from "./PriceWhy";
import { TariffCalc } from "./TariffCalc";
import { CompareTable } from "./CompareTable";
import { ALL_PLANS, COMPARE } from "./tariffsData";

const T = {
  title: ru("Тарифы"),
  lead: ru(
    "Три готовых тарифа или гибкий, собранный под ваш склад. Оплата помесячно, на полгода или на год, цена фиксируется на оплаченный срок.",
  ),
  period: ru("Срок оплаты"),
  perMonth: ru("₽ в месяц"),
  optimal: ru("Оптимальный"),
  choose: ru("Подключить склад"),
  allPlans: ru("Во всех тарифах"),
  why: ru("Из чего складывается цена"),
  totalNote: ru("{sum} ₽ за {term}"),
  half: ru("полгода"),
  year: ru("год"),
  saving: ru(", выгода {sum} ₽"),
  monthNote: ru("оплата каждый месяц"),
  customTitle: ru("Нужны отдельные условия?"),
  customBody: ru(
    "Больше трёх складов, своя схема оплаты или нестандартные процессы: обсудим и предложим тариф.",
  ),
  customCta: ru("Связаться с нами"),
};

const PERIODS: { id: PayPeriod; label: Copy }[] = [
  { id: "year", label: ru("На год") },
  { id: "half", label: ru("На полгода") },
  { id: "month", label: ru("На месяц") },
];

/** Порядок от дорогого к дешёвому: дорогая карточка задаёт ориентир. */
const ORDER = ["operator", "warehouse", "start"];

/** Три главных лимита на карточке: остальное — в таблице. */
const CARD_LIMITS = [COMPARE[0].rows[1], COMPARE[2].rows[0], COMPARE[1].rows[0]];

/**
 * Тарифы с переключателем срока оплаты: год, полгода, месяц слева направо, у
 * каждого срока своя иконка. Цена месяца — из `data/plans`, за полгода и год
 * считается скидкой (20 окт). На карточке три главных лимита, таблица
 * свёрнута до шести строк и раскрывается целиком по кнопке.
 */
/** `page` — блок стоит первым на странице /pricing: заголовок главный, отступ меньше. */
export function Tariffs({ page = false }: { page?: boolean }) {
  const t = useT();
  const [period, setPeriod] = useState<PayPeriod>("half");
  const [why, setWhy] = useState(false);
  // Подложка выбранного срока ездит между кнопками (Кирилл 19 окт: «плавно»).
  // Пока её не измерили (предрендер, первый кадр), фон стоит на самой кнопке.
  const group = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const root = group.current;
    if (!root) return;
    const measure = () => {
      const on = root.querySelector<HTMLElement>('[aria-checked="true"]');
      if (on) setPill({ left: on.offsetLeft, width: on.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [period]);
  const plans = ORDER.map((id) => PLANS.find((p) => p.id === id)).filter((p): p is Plan => !!p);

  const price = (p: Plan) => money(monthlyFor(p.monthly, period));
  const note = (p: Plan) => {
    if (period === "month") return t(T.monthNote);
    const months = period === "year" ? 12 : 6;
    const sum = monthlyFor(p.monthly, period) * months;
    return (
      t(T.totalNote, { sum: money(sum), term: t(period === "year" ? T.year : T.half) }) +
      t(T.saving, { sum: money(p.monthly * months - sum) })
    );
  };
  return (
    <section
      id="tariffs"
      className={cn(
        "mx-auto max-w-[1280px] scroll-mt-24 px-5 sm:px-10",
        page ? "mt-12 sm:mt-20" : "mt-24 sm:mt-36",
      )}
    >
      <Reveal className="flex flex-col items-center gap-5 text-center">
        {page ? <h1 className="wh-h1">{t(T.title)}</h1> : <h2 className="wh-h2">{t(T.title)}</h2>}
        <p className="wh-muted max-w-[34rem] text-[17px] leading-relaxed">{t(T.lead)}</p>
        <div
          ref={group}
          role="radiogroup"
          aria-label={t(T.period)}
          className="relative inline-flex gap-1 rounded-full p-1 shadow-[inset_0_0_0_1px_var(--wh-line)]"
        >
          {pill && (
            <span
              aria-hidden
              className="absolute inset-y-1 rounded-full bg-[var(--wh-ink)] transition-[left,width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
              style={{ left: pill.left, width: pill.width }}
            />
          )}
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
                  "relative inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors duration-300 sm:h-10 sm:gap-2 sm:pl-3.5 sm:pr-[18px] sm:text-sm",
                  on
                    ? cn("text-[var(--wh-ground)]", !pill && "bg-[var(--wh-ink)]")
                    : "hover:bg-[var(--wh-soft)]",
                )}
              >
                <PeriodIcon id={p.id} />
                {t(p.label)}
              </button>
            );
          })}
        </div>
      </Reveal>

      <Reveal className="mt-10 flex flex-col items-center gap-3 text-center">
        <p className="wh-muted text-[13px]">{t(T.allPlans)}</p>
        <ul className="flex flex-wrap justify-center gap-2">
          {ALL_PLANS.map((item) => (
            <li
              key={item.ru}
              className="rounded-full px-3.5 py-1.5 text-[14px] shadow-[inset_0_0_0_1px_var(--wh-line)]"
            >
              {t(item)}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setWhy(true)}
          className="mt-2 inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--wh-blue)] hover:underline"
        >
          {t(T.why)}
          <ArrowRight className="size-4" />
        </button>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan, i) => {
          const blue = !!plan.featured;
          return (
            <Reveal
              key={plan.id}
              delay={i * 80}
              as="article"
              className={cn(
                "flex flex-col gap-4 rounded-[22px] p-7",
                blue
                  ? "relative overflow-hidden bg-[var(--wh-blue)] text-white [&>:not(canvas)]:relative"
                  : "shadow-[inset_0_0_0_1px_var(--wh-line)]",
              )}
            >
              {/* Оптимальный тариф живой: тот же склад из знаков, что на первом
                  экране, только тише — цены должны читаться. */}
              {blue && <AsciiField strength={0.45} font={12} />}
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[22px] font-medium">{t(plan.title)}</h3>
                {blue && (
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[var(--wh-blue)]">
                    {t(T.optimal)}
                  </span>
                )}
              </div>
              <p className={cn("flex-1 text-[15px]", blue ? "text-white/80" : "wh-muted")}>
                {t(plan.who)}
              </p>
              <ul className={cn("flex flex-col gap-1 text-[15px]", blue ? "text-white" : "")}>
                {CARD_LIMITS.map((r) => {
                  const cell = r.cells[ORDER.indexOf(plan.id)];
                  return (
                    <li key={r.label.ru} className="flex justify-between gap-3">
                      <span className={blue ? "text-white/75" : "wh-muted"}>{t(r.label)}</span>
                      <span>{typeof cell === "string" ? cell : t(cell)}</span>
                    </li>
                  );
                })}
              </ul>
              <p key={`p-${period}`} className="wh-swap text-[44px] font-light tracking-[-0.04em]">
                {price(plan)}{" "}
                <span
                  className={cn("text-[15px] tracking-normal", blue ? "text-white/80" : "wh-muted")}
                >
                  {t(T.perMonth)}
                </span>
              </p>
              <p
                key={`n-${period}`}
                className={cn("wh-swap text-[13px]", blue ? "text-white/75" : "wh-muted")}
                style={{ animationDelay: "60ms" }}
              >
                {note(plan)}
              </p>
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

      <TariffCalc period={period} />

      <CompareTable plans={plans} />

      <Reveal className="mt-8 flex flex-col gap-4 rounded-[22px] px-7 py-6 shadow-[inset_0_0_0_1px_var(--wh-line)] sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div>
          <p className="text-lg font-medium">{t(T.customTitle)}</p>
          <p className="wh-muted mt-1 text-[15px]">{t(T.customBody)}</p>
        </div>
        <a href="#connect" className="wh-btn wh-btn--blue shrink-0">
          {t(T.customCta)}
        </a>
      </Reveal>

      {why && <PriceSheet onClose={() => setWhy(false)} />}
    </section>
  );
}

/** Год — полный круг, полгода — половина, месяц — календарь. */
function PeriodIcon({ id }: { id: PayPeriod }) {
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
