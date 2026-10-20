import { ru, type Copy } from "../../lib/copy";

/**
 * Данные блока «Тарифы» лендинга для складов (Кирилл, 20 окт): таблица
 * отличий по группам, разбивка цены, сравнение с рынком и калькулятор своего
 * тарифа. Цены готовых тарифов — в `data/plans`.
 */

export const YES = "✓";
export const NO = "—";

/** Колонки таблицы — в порядке карточек: Оператор, Склад, Старт. */
export type Row = { label: Copy; cells: (Copy | string)[] };
export type Group = { title: Copy; rows: Row[] };

export const COMPARE: Group[] = [
  {
    title: ru("Склад"),
    rows: [
      { label: ru("Склады"), cells: [ru("до 3"), "1", "1"] },
      {
        label: ru("Позиции номенклатуры"),
        cells: [ru("без ограничений"), ru("до 30 000"), ru("до 5 000")],
      },
      { label: ru("План склада и адресное хранение"), cells: [YES, YES, YES] },
      { label: ru("Приёмка, сборка и отгрузка со сканером"), cells: [YES, YES, YES] },
      { label: ru("Ярлыки и складские документы"), cells: [YES, YES, YES] },
      { label: ru("Импорт остатков из Excel"), cells: [YES, YES, YES] },
      { label: ru("Импорт поставок из Excel"), cells: [YES, YES, NO] },
      { label: ru("Кроссдокинг и наборы"), cells: [YES, YES, NO] },
      { label: ru("Тепловая карта склада"), cells: [YES, YES, NO] },
      {
        label: ru("Аналитика"),
        cells: [ru("полная"), ru("полная"), ru("основные показатели")],
      },
    ],
  },
  {
    title: ru("Селлеры"),
    rows: [
      {
        label: ru("Кабинеты селлеров"),
        cells: [ru("без ограничений"), ru("до 30"), ru("до 5")],
      },
      { label: ru("Заявки и поставки от селлера"), cells: [YES, YES, YES] },
      { label: ru("Чат с селлером"), cells: [YES, YES, YES] },
      { label: ru("Карточка склада на витрине Уклада"), cells: [YES, YES, NO] },
      { label: ru("Учёт по клиентам: остатки, отгрузки, биллинг"), cells: [YES, NO, NO] },
    ],
  },
  {
    title: ru("Сотрудники"),
    rows: [
      { label: ru("Сотрудники"), cells: [ru("до 50"), ru("до 15"), ru("до 5")] },
      { label: ru("Задачи и нагрузка по фактам работы"), cells: [YES, YES, YES] },
      { label: ru("Роли и права"), cells: [YES, YES, NO] },
    ],
  },
  {
    title: ru("Поддержка"),
    rows: [
      { label: ru("Чат в рабочие дни"), cells: [YES, YES, YES] },
      { label: ru("Перенос данных с нашей помощью"), cells: [YES, YES, NO] },
      { label: ru("Персональный менеджер"), cells: [YES, NO, NO] },
    ],
  },
];

/** Свёрнутая таблица: главные лимиты, по одному-два из каждой группы. */
export const SHORT_COMPARE: Row[] = [
  COMPARE[0].rows[0],
  COMPARE[0].rows[1],
  COMPARE[2].rows[0],
  COMPARE[1].rows[0],
  COMPARE[0].rows[7],
  COMPARE[1].rows[4],
];

/** То, что входит в любой тариф, — над карточками. */
export const ALL_PLANS: Copy[] = [
  ru("Три системы в одной: склад, селлеры, сотрудники"),
  ru("Подключение в день заявки, бесплатно"),
  ru("Новые функции по запросам складов"),
  ru("Данные на серверах в российском дата-центре"),
  ru("Поддержка в чате в рабочие дни"),
];

/**
 * Из чего складывается цена тарифа «Склад», ₽ в месяц. Сумма частей обязана
 * сходиться с ценой тарифа за месяц — это проверяет тест.
 */
export const BREAKDOWN: { title: Copy; body: Copy; price: number; market: Copy }[] = [
  {
    title: ru("Учёт склада"),
    body: ru("Адресное хранение, план склада, приёмка, сборка, отгрузка, ярлыки, документы"),
    price: 5400,
    market: ru("от 20 000 ₽"),
  },
  {
    title: ru("Кабинет селлера"),
    body: ru("Селлер сам видит остатки, отправляет заявки и поставки, пишет в чат"),
    price: 2500,
    market: ru("в старших тарифах"),
  },
  {
    title: ru("Управление сотрудниками"),
    body: ru("Роли, задачи и нагрузка по фактам работы"),
    price: 2000,
    market: ru("от 3 000 ₽"),
  },
];

/** Сравнение с типами решений, без названий компаний: Уклад, облачная, коробочная. */
export const MARKET: Row[] = [
  {
    label: ru("Цена в месяц"),
    cells: [ru("9 900 ₽"), ru("20 000–70 000 ₽"), ru("лицензия от 1,5 млн ₽")],
  },
  {
    label: ru("Подключение"),
    cells: [ru("в тот же день, бесплатно"), ru("недели, часто платно"), ru("месяцы")],
  },
  { label: ru("Кабинет селлера"), cells: [YES, ru("в старших тарифах"), ru("отдельный проект")] },
  { label: ru("План склада на экране"), cells: [YES, ru("редко"), YES] },
  {
    label: ru("Новые функции по запросу склада"),
    cells: [ru("бесплатно"), ru("платная доработка"), ru("платная доработка")],
  },
];

/**
 * Калькулятор своего тарифа. Основа равна «Старту», каждая ступень сверх неё —
 * доплата. Готовые тарифы задуманы выгоднее собранного: калькулятор нужен
 * складам, которые в них не помещаются.
 */
export const CALC = {
  base: 4900,
  baseSkus: 5000,
  baseStaff: 5,
  baseSellers: 5,
  perWarehouse: 4900,
  perSkus: { step: 5000, price: 900 },
  perStaff: { step: 5, price: 1500 },
  perSellers: { step: 10, price: 1500 },
  clientBilling: 4900,
};

export interface CalcInput {
  warehouses: number;
  skus: number;
  staff: number;
  sellers: number;
  billing: boolean;
}

const steps = (value: number, base: number, step: number) =>
  Math.max(0, Math.ceil((value - base) / step));

/** Цена собранного тарифа за месяц при помесячной оплате. */
export function calcMonthly(v: CalcInput): number {
  return calcLines(v).reduce((s, l) => s + l.price, 0);
}

/** Строки итога калькулятора: основа и каждая доплата, только ненулевые. */
export function calcLines(v: CalcInput): { label: Copy; count?: number; price: number }[] {
  const lines = [
    { label: ru("Основа: 1 склад, 5 000 позиций, 5 сотрудников, 5 селлеров"), price: CALC.base },
    {
      label: ru("Ещё склады: {n}"),
      count: Math.max(0, v.warehouses - 1),
      price: Math.max(0, v.warehouses - 1) * CALC.perWarehouse,
    },
    {
      label: ru("Ещё позиции: {n}"),
      count: Math.max(0, v.skus - CALC.baseSkus),
      price: steps(v.skus, CALC.baseSkus, CALC.perSkus.step) * CALC.perSkus.price,
    },
    {
      label: ru("Ещё сотрудники: {n}"),
      count: Math.max(0, v.staff - CALC.baseStaff),
      price: steps(v.staff, CALC.baseStaff, CALC.perStaff.step) * CALC.perStaff.price,
    },
    {
      label: ru("Ещё кабинеты селлеров: {n}"),
      count: Math.max(0, v.sellers - CALC.baseSellers),
      price: steps(v.sellers, CALC.baseSellers, CALC.perSellers.step) * CALC.perSellers.price,
    },
    { label: ru("Учёт по клиентам"), price: v.billing ? CALC.clientBilling : 0 },
  ];
  return lines.filter((l, i) => i === 0 || l.price > 0);
}

/** Лимиты готовых тарифов — для подсказки «готовый выгоднее». */
export const LIMITS: Record<string, CalcInput> = {
  start: { warehouses: 1, skus: 5000, staff: 5, sellers: 5, billing: false },
  warehouse: { warehouses: 1, skus: 30000, staff: 15, sellers: 30, billing: false },
  operator: { warehouses: 3, skus: Infinity, staff: 50, sellers: Infinity, billing: true },
};

/** Самый дешёвый готовый тариф, в который помещается набранное, или null. */
export function fittingPlan(v: CalcInput): string | null {
  for (const id of ["start", "warehouse", "operator"]) {
    const l = LIMITS[id];
    if (
      v.warehouses <= l.warehouses &&
      v.skus <= l.skus &&
      v.staff <= l.staff &&
      v.sellers <= l.sellers &&
      (!v.billing || l.billing)
    )
      return id;
  }
  return null;
}
