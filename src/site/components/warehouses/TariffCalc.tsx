import { useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLANS, monthlyFor, type PayPeriod } from "../../data/plans";
import { money } from "../../data/warehouses";
import { ru, useT, type Copy } from "../../lib/copy";
import { Reveal } from "../Reveal";
import { CALC, calcLines, calcMonthly, fittingPlan, type CalcInput } from "./tariffsData";

const T = {
  title: ru("Свой тариф"),
  lead: ru("Гибкий тариф: платите только за склады, позиции и сотрудников, которые нужны."),
  from: ru("от {sum} ₽ в месяц"),
  open: ru("Собрать тариф"),
  close: ru("Свернуть"),
  included: ru("В основе {n}"),
  less: ru("Меньше: {what}"),
  more: ru("Больше: {what}"),
  billing: ru("Учёт по клиентам: остатки, отгрузки, биллинг"),
  billingHint: ru("Раздельные остатки и счета для каждого селлера"),
  total: ru("Итого"),
  perMonth: ru("₽ в месяц"),
  monthNote: ru("при оплате помесячно"),
  periodNote: ru("при оплате за {term}"),
  half: ru("полгода"),
  year: ru("год"),
  cheaper: ru("С такими лимитами тариф «{plan}» дешевле на {sum} ₽ в месяц"),
  bigger: ru("Больше {n} складов — напишите нам, предложим отдельные условия"),
  choose: ru("Подключить склад"),
};

type Key = "warehouses" | "skus" | "staff" | "sellers";

/**
 * Поля калькулятора. Минимум равен основе, шаг — ступени цены: число на
 * экране всегда то, за которое склад платит, а не произвольное из ползунка.
 */
const FIELDS: { key: Key; label: Copy; unit: Copy; base: number; step: number; max: number }[] = [
  { key: "warehouses", label: ru("Склады"), unit: ru("склад"), base: 1, step: 1, max: 10 },
  {
    key: "skus",
    label: ru("Позиции номенклатуры"),
    unit: ru("позиций"),
    base: CALC.baseSkus,
    step: CALC.perSkus.step,
    max: 200000,
  },
  {
    key: "staff",
    label: ru("Сотрудники"),
    unit: ru("сотрудников"),
    base: CALC.baseStaff,
    step: CALC.perStaff.step,
    max: 200,
  },
  {
    key: "sellers",
    label: ru("Кабинеты селлеров"),
    unit: ru("кабинетов"),
    base: CALC.baseSellers,
    step: CALC.perSellers.step,
    max: 505,
  },
];

const START: CalcInput = { warehouses: 1, skus: 10000, staff: 10, sellers: 15, billing: false };

/**
 * «Свой тариф» — свёрнутая карточка под готовыми тарифами (Кирилл, 20 окт).
 * Раскрывается в калькулятор: слева поля со степперами, справа итог по
 * строкам. Если набранное помещается в готовый тариф и тот дешевле — говорим.
 */
export function TariffCalc({ period }: { period: PayPeriod }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<CalcInput>(START);

  const price = monthlyFor(calcMonthly(v), period);
  const fit = fittingPlan(v);
  const fitPlan = fit ? PLANS.find((p) => p.id === fit) : undefined;
  const fitPrice = fitPlan ? monthlyFor(fitPlan.monthly, period) : 0;
  const maxWh = FIELDS[0].max;

  return (
    <Reveal as="article" className="mt-4 rounded-[22px] shadow-[inset_0_0_0_1px_var(--wh-line)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full flex-col gap-4 p-7 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <span>
          <span className="block text-[22px] font-medium">{t(T.title)}</span>
          <span className="wh-muted mt-1 block text-[15px]">{t(T.lead)}</span>
        </span>
        <span className="flex items-center gap-4">
          <span className="wh-muted text-[15px]">
            {t(T.from, { sum: money(monthlyFor(CALC.base, period)) })}
          </span>
          <span className="wh-btn wh-btn--soft shrink-0">
            {t(open ? T.close : T.open)}
            <ChevronDown
              className={cn("size-4 transition-transform duration-300", open && "rotate-180")}
            />
          </span>
        </span>
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden" {...(open ? {} : { inert: "" })}>
          <div className="grid grid-cols-1 gap-8 border-t border-[var(--wh-line)] p-7 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
            <div className="flex flex-col">
              {FIELDS.map((f) => (
                <Stepper
                  key={f.key}
                  label={t(f.label)}
                  hint={t(T.included, { n: `${money(f.base)} ${t(f.unit)}` })}
                  value={v[f.key]}
                  min={f.base}
                  max={f.max}
                  step={f.step}
                  lessLabel={t(T.less, { what: t(f.label).toLowerCase() })}
                  moreLabel={t(T.more, { what: t(f.label).toLowerCase() })}
                  onChange={(n) => setV({ ...v, [f.key]: n })}
                />
              ))}
              <label
                aria-label={t(T.billing)}
                className="flex cursor-pointer items-center justify-between gap-4 py-4"
              >
                <span>
                  <span className="block text-[17px]">{t(T.billing)}</span>
                  <span className="wh-muted block text-[13px]">{t(T.billingHint)}</span>
                </span>
                <input
                  type="checkbox"
                  checked={v.billing}
                  onChange={(e) => setV({ ...v, billing: e.target.checked })}
                  className="size-5 shrink-0 accent-[var(--wh-blue)]"
                />
              </label>
            </div>

            <div className="flex flex-col gap-4 rounded-[18px] bg-[var(--wh-soft)] p-6">
              <ul className="flex flex-col gap-2 text-[15px]">
                {calcLines(v).map((line) => (
                  <li
                    key={line.label.ru}
                    className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-start gap-x-4"
                  >
                    <span className="wh-muted">
                      {t(line.label, { n: line.count === undefined ? "" : money(line.count) })}
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums">
                      {money(line.price)} ₽
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-[var(--wh-line)] pt-4">
                <p className="wh-muted text-[13px]">{t(T.total)}</p>
                <p className="text-[40px] font-light tracking-[-0.04em] tabular-nums">
                  {money(price)}{" "}
                  <span className="wh-muted text-[15px] tracking-normal">{t(T.perMonth)}</span>
                </p>
                <p className="wh-muted text-[13px]">
                  {period === "month"
                    ? t(T.monthNote)
                    : t(T.periodNote, { term: t(period === "year" ? T.year : T.half) })}
                </p>
              </div>
              {fitPlan && fitPrice < price && (
                <p className="text-[13px] text-[var(--wh-blue)]">
                  {t(T.cheaper, { plan: t(fitPlan.title), sum: money(price - fitPrice) })}
                </p>
              )}
              {v.warehouses >= maxWh && (
                <p className="text-[13px] text-[var(--wh-blue)]">{t(T.bigger, { n: maxWh })}</p>
              )}
              <a href="#connect" className="wh-btn wh-btn--blue mt-auto w-full">
                {t(T.choose)}
              </a>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/**
 * Поле с кнопками «−» и «+» по ступеням цены и с ручным вводом. Введённое
 * число выравнивается до ближайшей ступени вверх и в границы при уходе с поля:
 * пока человек печатает, его не перебивают.
 */
function Stepper(props: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  lessLabel: string;
  moreLabel: string;
  onChange: (n: number) => void;
}) {
  const { label, hint, value, min, max, step, onChange } = props;
  const [draft, setDraft] = useState<string | null>(null);
  const snap = (n: number) =>
    Math.min(max, Math.max(min, min + Math.ceil((n - min) / step) * step));
  const btn =
    "grid size-10 place-items-center rounded-full shadow-[inset_0_0_0_1px_var(--wh-line)] transition-colors hover:bg-[var(--wh-soft)] disabled:opacity-35 disabled:hover:bg-transparent";

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--wh-line)] py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div>
        <p className="text-[17px]">{label}</p>
        <p className="wh-muted text-[13px]">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label={props.lessLabel}
          disabled={value <= min}
          onClick={() => onChange(snap(value - step))}
          className={btn}
        >
          <Minus className="size-4" />
        </button>
        <input
          inputMode="numeric"
          aria-label={label}
          value={draft ?? money(value)}
          onFocus={(e) => {
            setDraft(String(value));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={() => {
            if (draft) onChange(snap(Number(draft)));
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-10 w-[5.5rem] rounded-full bg-transparent text-center text-[17px] tabular-nums shadow-[inset_0_0_0_1px_var(--wh-line)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--wh-blue)]"
        />
        <button
          type="button"
          aria-label={props.moreLabel}
          disabled={value >= max}
          onClick={() => onChange(snap(value + step))}
          className={btn}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}
