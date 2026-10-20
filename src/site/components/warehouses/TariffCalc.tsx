import { useState } from "react";
import { PLANS, monthlyFor, type PayPeriod } from "../../data/plans";
import { money } from "../../data/warehouses";
import { ru, useT } from "../../lib/copy";
import { Reveal } from "../Reveal";
import { calcMonthly, fittingPlan, type CalcInput } from "./tariffsData";

const T = {
  title: ru("Свой тариф"),
  lead: ru("Соберите тариф под свой склад: укажите, сколько нужно, и цена посчитается сразу."),
  warehouses: ru("Склады"),
  skus: ru("Позиции номенклатуры"),
  staff: ru("Сотрудники"),
  sellers: ru("Кабинеты селлеров"),
  billing: ru("Учёт по клиентам: остатки, отгрузки, биллинг"),
  perMonth: ru("₽ в месяц"),
  cheaper: ru("Тариф «{plan}» с такими лимитами дешевле на {sum} ₽ в месяц"),
  choose: ru("Подключить склад"),
};

type Field = {
  key: "warehouses" | "skus" | "staff" | "sellers";
  min: number;
  max: number;
  step: number;
};

const FIELDS: Field[] = [
  { key: "warehouses", min: 1, max: 10, step: 1 },
  { key: "skus", min: 1000, max: 100000, step: 1000 },
  { key: "staff", min: 1, max: 100, step: 1 },
  { key: "sellers", min: 0, max: 200, step: 5 },
];

/**
 * Калькулятор — отдельный, четвёртый тариф (Кирилл, 20 окт). Скидки за срок
 * те же, что у готовых тарифов. Если набранное помещается в готовый тариф и
 * тот дешевле, подсказываем его.
 */
export function TariffCalc({ period }: { period: PayPeriod }) {
  const t = useT();
  const [v, setV] = useState<CalcInput>({
    warehouses: 1,
    skus: 10000,
    staff: 10,
    sellers: 15,
    billing: false,
  });
  const price = monthlyFor(calcMonthly(v), period);
  const fit = fittingPlan(v);
  const fitPlan = fit ? PLANS.find((p) => p.id === fit) : undefined;
  const fitPrice = fitPlan ? monthlyFor(fitPlan.monthly, period) : 0;

  return (
    <Reveal
      as="article"
      className="mt-4 grid grid-cols-1 gap-8 rounded-[22px] p-7 shadow-[inset_0_0_0_1px_var(--wh-line)] lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12"
    >
      <div className="flex flex-col gap-4">
        <h3 className="text-[22px] font-medium">{t(T.title)}</h3>
        <p className="wh-muted text-[15px]">{t(T.lead)}</p>
        <p className="text-[44px] font-light tracking-[-0.04em] tabular-nums">
          {money(price)}{" "}
          <span className="wh-muted text-[15px] tracking-normal">{t(T.perMonth)}</span>
        </p>
        {fitPlan && fitPrice < price && (
          <p className="text-[13px] text-[var(--wh-blue)]">
            {t(T.cheaper, { plan: t(fitPlan.title), sum: money(price - fitPrice) })}
          </p>
        )}
        <a href="#connect" className="wh-btn wh-btn--soft mt-auto w-full">
          {t(T.choose)}
        </a>
      </div>

      <div className="flex flex-col gap-6">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between gap-4 text-[15px]">
              <span className="wh-muted">{t(T[f.key])}</span>
              <span className="font-medium tabular-nums">{money(v[f.key])}</span>
            </span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={v[f.key]}
              aria-label={t(T[f.key])}
              onChange={(e) => setV({ ...v, [f.key]: Number(e.target.value) })}
              className="w-full accent-[var(--wh-blue)]"
            />
          </div>
        ))}
        <label className="flex items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={v.billing}
            onChange={(e) => setV({ ...v, billing: e.target.checked })}
            className="size-4 accent-[var(--wh-blue)]"
          />
          {t(T.billing)}
        </label>
      </div>
    </Reveal>
  );
}
