/**
 * Тарифы глазами админки: цена по умолчанию, функции и лимиты.
 *
 * Источник правды для витрины — `src/site/data/plans.ts` и таблица отличий в
 * `src/site/components/warehouses/tariffsData.ts`. Сервер их не импортирует
 * (там TypeScript и словарь витрины), поэтому значения повторены здесь, а
 * тест `admin.test.js` сверяет цены с `plans.ts`: разъедутся — упадёт.
 *
 * У аккаунта функции и лимиты можно переопределить поштучно. Пустое
 * переопределение значит «как в тарифе».
 */
/* global module */

const PLANS = {
  start: { title: "Старт", price: 4900 },
  warehouse: { title: "Склад", price: 9900 },
  operator: { title: "Оператор", price: 24900 },
  custom: { title: "Свой тариф", price: null },
  corporate: { title: "Корпоративный", price: null },
};

const PERIODS = { month: "Месяц", half: "Полгода", year: "Год" };

/** Функции, которые отличают тарифы (строки таблицы с «да/нет»). */
const FEATURES = {
  import_supplies: "Импорт поставок из Excel",
  crossdock_kits: "Кроссдокинг и наборы",
  heatmap: "Тепловая карта склада",
  analytics_full: "Полная аналитика",
  showcase_card: "Карточка склада на витрине",
  client_billing: "Учёт по клиентам и биллинг",
  roles: "Роли и права сотрудников",
  weekly_backup: "Копия данных каждую неделю на почту",
  migration_help: "Перенос данных с нашей помощью",
  personal_manager: "Персональный менеджер",
};

const ALL = Object.keys(FEATURES);
const PLAN_FEATURES = {
  start: [],
  warehouse: ALL.filter((f) => !["client_billing", "personal_manager"].includes(f)),
  operator: ALL,
  custom: ALL.filter((f) => f !== "personal_manager"),
  corporate: ALL,
};

const LIMITS = {
  warehouses: "Склады",
  skus: "Позиции номенклатуры",
  staff: "Сотрудники",
  sellers: "Кабинеты селлеров",
};

/** `null` — без ограничений. */
const PLAN_LIMITS = {
  start: { warehouses: 1, skus: 5000, staff: 5, sellers: 5 },
  warehouse: { warehouses: 1, skus: 30000, staff: 15, sellers: 30 },
  operator: { warehouses: 3, skus: null, staff: 50, sellers: null },
  custom: { warehouses: 1, skus: 5000, staff: 5, sellers: 5 },
  corporate: { warehouses: null, skus: null, staff: null, sellers: null },
};

/** Пробный период первым складам — 3 месяца с подключения. */
const TRIAL_MONTHS = 3;

function addMonths(iso, months) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

function parseJson(text) {
  try {
    const v = text ? JSON.parse(text) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Функции аккаунта с учётом переопределений: { ключ: { on, fromPlan, override } }. */
function effectiveFeatures(account) {
  const plan = PLAN_FEATURES[account.tariff] ?? [];
  const over = parseJson(account.features);
  return Object.fromEntries(
    ALL.map((key) => {
      const fromPlan = plan.includes(key);
      const override = typeof over[key] === "boolean" ? over[key] : null;
      return [key, { on: override ?? fromPlan, fromPlan, override }];
    }),
  );
}

function effectiveLimits(account) {
  const plan = PLAN_LIMITS[account.tariff] ?? PLAN_LIMITS.start;
  const over = parseJson(account.limits);
  return Object.fromEntries(
    Object.keys(LIMITS).map((key) => {
      const override = Number.isFinite(over[key]) ? over[key] : null;
      return [key, { value: override ?? plan[key], fromPlan: plan[key], override }];
    }),
  );
}

/**
 * Состояние оплаты одним словом — для списка и фильтров.
 *  archived / blocked — решение админа, важнее денег;
 *  trial — идёт пробный период; paid — оплачено; overdue — срок вышел.
 */
function billingState(account, nowIso) {
  if (account.archived_at) return "archived";
  if (account.status === "blocked") return "blocked";
  if (account.paid_until && account.paid_until > nowIso) return "paid";
  if (account.trial_until && account.trial_until > nowIso) return "trial";
  return "overdue";
}

const STATE_TITLES = {
  trial: "Пробный период",
  paid: "Оплачен",
  overdue: "Не оплачен",
  blocked: "Заблокирован",
  archived: "В архиве",
};

module.exports = {
  PLANS,
  PERIODS,
  FEATURES,
  PLAN_FEATURES,
  LIMITS,
  PLAN_LIMITS,
  TRIAL_MONTHS,
  STATE_TITLES,
  addMonths,
  parseJson,
  effectiveFeatures,
  effectiveLimits,
  billingState,
};
