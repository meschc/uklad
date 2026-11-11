import { OFFER, PLAN_LIMITS, monthsRu, upTo } from "./offer";
/**
 * Что на витрине стоит денег, а что нет.
 *
 * Страница с ценами — часть оферты: по ст. 10 закона «О защите прав
 * потребителей» цена должна быть в рублях и доступна до заключения договора, а
 * оферта на неё прямо ссылается. Поэтому цены живут данными, а не строками в
 * вёрстке: иначе рано или поздно в оферте будет одна цифра, а на странице —
 * другая.
 *
 * Денег здесь просят у двоих и за разное.
 *
 * Селлер не платит за то, ради чего пришёл: искать склад, сравнивать и слать
 * заявки — бесплатно и без комиссии. Комиссия с заявки превратила бы витрину в
 * аукцион позиций, где наверху не лучший склад, а тот, кто больше занёс.
 * Платит селлер только за «взгляд внутрь» — за план склада, свободные места,
 * свои остатки по ячейкам. Это ровно то, чего нет ни у одного каталога
 * складов, и ровно то, без чего витриной можно пользоваться.
 *
 * Склад платит подпиской — за учётную систему, в которой работает смена.
 *
 * Разделение не косметическое: пока платный доступ висит на дополнениях, а не
 * на заявках, у витрины нет причины подкручивать выдачу.
 */

import { c, type Copy } from "../lib/copy";

export interface Plan {
  id: string;
  title: Copy;
  /** Кому тариф адресован — одной строкой. */
  who: Copy;
  /** Рублей в месяц при помесячной оплате. */
  monthly: number;
  /** Что входит. Первый пункт — главное ограничение тарифа. */
  features: Copy[];
  /**
   * С чего начинается работа в тарифе — тем же честным фактом, что и у
   * дополнений. Учётную систему покупают не за список галочек, а за то, что
   * смена в понедельник выйдет и будет в чём работать.
   */
  firstScreen: Copy;
  /** Выделенный тариф в сетке. */
  featured?: boolean;
  /** Подпись на кнопке. */
  cta: Copy;
}

/** Скидка при оплате за год — 25 %, за полгода — 15 % (Кирилл, 20 окт). */
const YEARLY_DISCOUNT = 0.25;
const HALF_DISCOUNT = 0.15;

/**
 * Тарифы склада. Бесплатного тарифа здесь нет намеренно: бесплатный период
 * (`OFFER.freeMonths`) система даёт всем, а «бесплатный тариф» у учётной системы означает склад,
 * который однажды упрётся в лимит посреди смены.
 */
export const PLANS: Plan[] = [
  {
    id: "start",
    title: c("Старт", "Start"),
    who: c(
      "Небольшому складу, который переходит с таблиц на систему",
      "A small warehouse moving from spreadsheets to a system",
    ),
    monthly: 4900,
    cta: c(
      `Начать: ${monthsRu(OFFER.freeMonths)} бесплатно`,
      `Start: ${OFFER.freeMonths} month${OFFER.freeMonths === 1 ? "" : "s"} free`,
    ),
    firstScreen: c(
      "Тот же мастер склада, что и в тарифе «Склад»: назвать склад, разметить стеллажи и залить остатки из XLSX. Когда позиций или людей станет больше, тариф меняется без переноса данных.",
      "The same warehouse wizard as on the Warehouse plan: name the warehouse, lay out the racks and import stock from XLSX. When you outgrow the limits, the plan changes with no data migration.",
    ),
    features: [
      c(
        `1 склад, ${upTo(PLAN_LIMITS.start.skus)} позиций номенклатуры`,
        `1 warehouse, up to ${PLAN_LIMITS.start.skus.toLocaleString("en")} SKUs`,
      ),
      c(`До ${PLAN_LIMITS.start.staff} сотрудников`, `Up to ${PLAN_LIMITS.start.staff} staff`),
      c(
        "Печать этикеток и штрихкодов, работа со сканером",
        "Label and barcode printing, scanner support",
      ),
      c("Импорт остатков из XLSX", "Stock import from XLSX"),
      c(
        "Карточка склада на витрине с отметкой «учёт в Укладе»",
        "A catalogue card marked “runs on Uklad”",
      ),
    ],
  },
  {
    id: "warehouse",
    title: c("Склад", "Warehouse"),
    who: c(
      "Одному складу с собственным товаром или парой клиентов",
      "One warehouse with its own goods or a couple of clients",
    ),
    monthly: 9900,
    featured: true,
    cta: c(
      `Начать: ${monthsRu(OFFER.freeMonths)} бесплатно`,
      `Start: ${OFFER.freeMonths} month${OFFER.freeMonths === 1 ? "" : "s"} free`,
    ),
    firstScreen: c(
      "И в бесплатный период, и после оплаты первый экран один: мастер склада — назвать склад, разметить стеллажи (можно взять готовую схему) и залить остатки из XLSX. Принимать поставки можно в тот же день; карточка на витрине появляется после проверки данных.",
      "The first screen is the same in the free period and after payment: the warehouse wizard — name the warehouse, lay out the racks (a ready-made layout will do) and import stock from XLSX. You can take deliveries the same day; the catalogue card appears once the data is verified.",
    ),
    features: [
      c(
        `1 склад, ${upTo(PLAN_LIMITS.warehouse.skus)} позиций номенклатуры`,
        `1 warehouse, up to ${PLAN_LIMITS.warehouse.skus.toLocaleString("en")} SKUs`,
      ),
      c(
        `До ${PLAN_LIMITS.warehouse.staff} сотрудников с разными ролями`,
        `Up to ${PLAN_LIMITS.warehouse.staff} staff with separate roles`,
      ),
      c(
        "Печать этикеток и штрихкодов, работа со сканером",
        "Label and barcode printing, scanner support",
      ),
      c(
        "Инвентаризация и журнал движений с историей правок",
        "Stocktakes and a movement log with an edit history",
      ),
      c("Импорт остатков и поставок из XLSX", "Stock and delivery import from XLSX"),
      c(
        "Карточка склада на витрине с отметкой «учёт в Укладе»",
        "A catalogue card marked “runs on Uklad”",
      ),
    ],
  },
  {
    id: "operator",
    title: c("Оператор", "Operator"),
    who: c(
      "Фулфилмент-оператору, который ведёт склад для десятков селлеров",
      "A fulfilment operator running a warehouse for dozens of sellers",
    ),
    monthly: 24900,
    cta: c("Обсудить внедрение", "Discuss a rollout"),
    firstScreen: c(
      "Тариф включается не кнопкой, а после разговора и договора: к первому входу склады, клиенты и роли уже заведены, а остатки перенесены из вашей выгрузки. Первый экран — рабочий день смены, а не пустая система, которую ещё предстоит наполнить.",
      "This plan is not switched on by a button but after a conversation and a contract: by your first login the warehouses, clients and roles are already set up and stock has been migrated from your export. The first screen is a working shift, not an empty system waiting to be filled.",
    ),
    features: [
      c(
        `Неограниченная номенклатура, до ${PLAN_LIMITS.operator.warehouses} складов`,
        `Unlimited SKUs, up to ${PLAN_LIMITS.operator.warehouses} warehouses`,
      ),
      c(
        `До ${PLAN_LIMITS.operator.staff} сотрудников, права настраиваются по операциям`,
        `Up to ${PLAN_LIMITS.operator.staff} staff, permissions set per operation`,
      ),
      c(
        "Учёт по клиентам: остатки, отгрузки и биллинг раздельно",
        "Per-client accounting: stock, shipments and billing kept apart",
      ),
      c(
        "Тарификация услуг клиентам и выгрузка актов",
        "Client service billing and statement export",
      ),
      c(
        "API и вебхуки для интеграции с личным кабинетом клиента",
        "API and webhooks to plug into a client's own account",
      ),
      c(
        "Приоритетная поддержка, первая реакция за 4 рабочих часа",
        "Priority support, first reply within 4 business hours",
      ),
    ],
  },
];

export type PayPeriod = "year" | "half" | "month";

/** Цена месяца при оплате за срок, до сотен рублей: 9 900 → 8 400 → 7 400. */
export function monthlyFor(monthly: number, period: PayPeriod): number {
  const off = period === "year" ? YEARLY_DISCOUNT : period === "half" ? HALF_DISCOUNT : 0;
  return Math.round((monthly * (1 - off)) / 100) * 100;
}
