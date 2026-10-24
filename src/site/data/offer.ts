/**
 * Условия Уклада одним местом (Кирилл 23 окт: «в одном месте менять, и везде
 * автоматически менялось»). Цены тарифов — `data/plans`, их лимиты и оффер
 * первым складам — здесь; тексты лендинга, тарифов, подвала и описаний
 * страниц собирают числа отсюда, а не пишут их строкой.
 */

/** Оффер первым складам. */
export const OFFER = {
  /** Месяцев бесплатно, с загрузки первых товаров. */
  freeMonths: 3,
  /** Новых функций под склад за бесплатный период. */
  newFeatures: 4,
  /** Рабочих дней на одну функцию. */
  featureDays: 5,
};

/** Рабочие часы чата по Москве, будни. */
export const CHAT_HOURS = { from: 10, to: 18 };

/** «10…18» — как часы пишутся на всём сайте. */
export const chatHours = `${CHAT_HOURS.from}…${CHAT_HOURS.to}`;

/** Лимиты готовых тарифов; `Infinity` — без ограничений. */
export interface PlanLimits {
  warehouses: number;
  skus: number;
  staff: number;
  sellers: number;
  billing: boolean;
}

export const PLAN_LIMITS: Record<"start" | "warehouse" | "operator", PlanLimits> = {
  start: { warehouses: 1, skus: 5000, staff: 5, sellers: 5, billing: false },
  warehouse: { warehouses: 1, skus: 30000, staff: 15, sellers: 30, billing: false },
  operator: { warehouses: 3, skus: Infinity, staff: 50, sellers: Infinity, billing: true },
};

/** Разряды через неразрывный пробел: 30 000. */
export const num = (n: number) => n.toLocaleString("ru-RU").replace(/\s/g, "\u00a0");

/** «до 30 000» или «без ограничений». */
export function upTo(n: number): string {
  return n === Infinity ? "без ограничений" : `до ${num(n)}`;
}

/** «3 месяца», «5 месяцев», «1 месяц». */
export function monthsRu(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "месяц"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "месяца"
        : "месяцев";
  return `${n}\u00a0${word}`;
}

/** «три месяца» — число словом до шести, дальше цифрой. */
export function monthsWordsRu(n: number): string {
  const words = ["", "один", "два", "три", "четыре", "пять", "шесть"];
  const [, word] = monthsRu(n).split("\u00a0");
  return `${words[n] ?? n} ${word}`;
}

/** «Три месяца бесплатно». */
export function freeMonthsTitle(): string {
  const s = `${monthsWordsRu(OFFER.freeMonths)} бесплатно`;
  return s[0].toUpperCase() + s.slice(1);
}
