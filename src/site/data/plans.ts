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

/** Единица, за которую берётся цена дополнения. */
export type ExtraUnit = "warehouse" | "month";

export interface SellerExtra {
  id: string;
  title: Copy;
  /** Цена в рублях. Валюта одна: витрина работает по РФ. */
  price: number;
  unit: ExtraUnit;
  /** На какой срок открывается разовый доступ. Для помесячных — не нужен. */
  access?: Copy;
  /** Что именно открывается — фактом, а не обещанием. */
  what: Copy;
  /** Зачем это селлеру: какой вопрос закрывает. */
  why: Copy;
  /**
   * Что человек увидит на экране сразу после оплаты.
   *
   * Отдельное поле, а не приписка к `what`: `what` описывает функцию, а перед
   * оплатой спрашивают другое — «я нажму кнопку и что, собственно, увижу».
   * Пока на этот вопрос отвечает воображение, оно отвечает либо слишком щедро,
   * либо «наверное, ничего», и оба ответа плохи.
   */
  firstScreen: Copy;
  /** Главное дополнение — то, ради которого страницу и открывают. */
  featured?: boolean;
}

/**
 * Что селлеру доступно бесплатно и без ограничений по времени.
 *
 * Список нужен рядом с ценами, а не абзацем ниже: без него платные дополнения
 * читаются как «сервис платный», хотя платного в нём — пять пунктов из
 * двадцати.
 */
export const SELLER_FREE: Copy[] = [
  c(
    "Каталог целиком: фильтры по городу, площадкам, услугам и режиму хранения",
    "The whole catalogue: filters by city, marketplace, service and storage mode",
  ),
  c(
    "Карта со всеми складами и подбором по расстоянию",
    "A map of every warehouse, with search by distance",
  ),
  c(
    "Карточка склада: цены, услуги, схемы (FBO, FBS, DBS), температура, рейтинг",
    "Warehouse card: prices, services, models (FBO, FBS, DBS), temperature, rating",
  ),
  c(
    "Заявки складам — без комиссии и платы за отклик",
    "Requests to warehouses — no commission, no pay-per-reply",
  ),
  c(
    "Кабинет: остатки, статусы приёмки и отгрузки, чат со складом",
    "An account: stock, intake and shipping statuses, chat with the warehouse",
  ),
];

/**
 * Платные дополнения для селлера.
 *
 * Разовые покупки привязаны к складу, а не к аккаунту: селлер выбирает между
 * двумя-тремя площадками, а не подписывается на каталог. Помесячные — там, где
 * данные меняются каждый день и разовый доступ бессмысленен.
 */
export const SELLER_EXTRAS: SellerExtra[] = [
  {
    id: "plan",
    title: c("План склада", "Floor plan"),
    price: 490,
    unit: "warehouse",
    access: c("доступ 30 дней", "30 days of access"),
    featured: true,
    what: c(
      "План этажа глазами склада: стеллажи, проходы, ярусы, занятые и свободные ячейки.",
      "The floor as the warehouse sees it: racks, aisles, tiers, cells taken and free.",
    ),
    why: c(
      "Понять, куда встанет товар и сколько там места на самом деле, — до первой коробки.",
      "See where your goods will stand and how much room there really is — before the first box.",
    ),
    firstScreen: c(
      "Сразу после оплаты открывается план этажа этого склада: стеллажи и ярусы, свободные ячейки подсвечены. Оттуда же уходит заявка складу.",
      "Right after payment you land on that warehouse's floor plan: racks and tiers, with free cells highlighted. A request to the warehouse goes from the same screen.",
    ),
  },
  {
    id: "stock",
    title: c("Свои остатки по ячейкам", "Your stock by cell"),
    price: 890,
    unit: "month",
    what: c(
      "Ваши позиции на плане: где что лежит, что приняли, что собрали, что уехало.",
      "Your items on the plan: what sits where, what came in, was picked and shipped.",
    ),
    why: c(
      "Заменяет переписку «посмотрите остатки». Работает, когда товар уже на складе.",
      "Replaces the “could you check my stock” messages. Works once the goods are in.",
    ),
    firstScreen: c(
      "Сразу после оплаты — тот же план, но с вашими позициями в ячейках и историей движений по каждой. Пока товар на склад не приехал, план откроется пустым.",
      "Right after payment — the same plan, but with your items in the cells and a movement history for each. Until your goods arrive, the plan opens empty.",
    ),
  },
  {
    id: "calc",
    title: c("Расчёт хранения", "Storage estimate"),
    price: 290,
    unit: "warehouse",
    access: c("доступ 30 дней", "30 days of access"),
    what: c(
      "Месяц по вашим габаритам, объёму и оборачиваемости — по сетке конкретного склада.",
      "A month priced on your dimensions, volume and turnover — on that warehouse's own rates.",
    ),
    why: c(
      "«От 35 ₽ за место» — не цена. Цена выходит, когда подставили ваш габарит и упаковку.",
      "“From 35 ₽ a slot” is not a price. A price appears once your goods go into it.",
    ),
    firstScreen: c(
      "Сразу после оплаты — форма с уже подставленной сеткой этого склада: вводите габарит, объём и оборачиваемость и получаете месяц в рублях, разложенный по строкам прайса.",
      "Right after payment — a form already loaded with that warehouse's rate card: enter dimensions, volume and turnover and get a month in roubles, broken down line by line.",
    ),
  },
  {
    id: "compare",
    title: c("Сравнение складов", "Side-by-side comparison"),
    price: 590,
    unit: "month",
    what: c(
      "До десяти складов в одной таблице: цены, услуги, свободные места, сроки приёмки. Выгрузка в XLSX.",
      "Up to ten warehouses in one table: prices, services, free slots, intake times. XLSX export.",
    ),
    why: c(
      "Чтобы выбор был на одном экране, а не в пяти вкладках и заметке в телефоне.",
      "So the choice fits one screen instead of five tabs and a note on your phone.",
    ),
    firstScreen: c(
      "Сразу после оплаты — таблица со складами, которые вы отметили в каталоге; остальные добавляются в неё прямо из выдачи. Кнопка выгрузки в XLSX — над таблицей.",
      "Right after payment — a table of the warehouses you marked in the catalogue; the rest are added straight from the results. The XLSX export button sits above the table.",
    ),
  },
  {
    id: "check",
    title: c("Проверка оператора", "Operator check"),
    price: 390,
    unit: "warehouse",
    access: c("доступ 30 дней", "30 days of access"),
    what: c(
      "Реквизиты из госреестров, срок работы, история заявок и отказов на витрине.",
      "State-register details, years in business, request and refusal history here.",
    ),
    why: c(
      "Товар уезжает к компании, которую вы видели только карточкой. Это способ посмотреть заранее.",
      "Your goods go to a company you have only seen as a card. This is a look at it first.",
    ),
    firstScreen: c(
      "Сразу после оплаты — отчёт по компании склада на дату проверки: реквизиты из госреестров, срок работы, сколько заявок на Укладе принято и сколько отклонено. Отчёт сохраняется в PDF.",
      "Right after payment — a report on the warehouse's company as of the check date: state-register details, years in business, how many requests on Uklad were accepted and how many declined. The report saves to PDF.",
    ),
  },
];

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

/** Скидка при оплате за год — 20 %, два месяца в подарок. */
export const YEARLY_DISCOUNT = 0.2;

/**
 * Тарифы склада. Бесплатного тарифа здесь нет намеренно: две недели на пробу
 * система даёт всем, а «бесплатный тариф» у учётной системы означает склад,
 * который однажды упрётся в лимит посреди смены.
 */
export const PLANS: Plan[] = [
  {
    id: "warehouse",
    title: c("Склад", "Warehouse"),
    who: c(
      "Одному складу с собственным товаром или парой клиентов",
      "One warehouse with its own goods or a couple of clients",
    ),
    monthly: 7900,
    featured: true,
    cta: c("Начать 14 дней бесплатно", "Start 14 days free"),
    firstScreen: c(
      "И на пробных двух неделях, и после оплаты первый экран один: мастер склада — назвать склад, разметить стеллажи (можно взять готовую схему) и залить остатки из XLSX. Принимать поставки можно в тот же день; карточка на витрине появляется после проверки данных.",
      "The first screen is the same on the two-week trial and after payment: the warehouse wizard — name the warehouse, lay out the racks (a ready-made layout will do) and import stock from XLSX. You can take deliveries the same day; the catalogue card appears once the data is verified.",
    ),
    features: [
      c("1 склад, до 5 000 позиций номенклатуры", "1 warehouse, up to 5,000 SKUs"),
      c("До 5 пользователей с разными ролями", "Up to 5 users with separate roles"),
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
    monthly: 19900,
    cta: c("Обсудить внедрение", "Discuss a rollout"),
    firstScreen: c(
      "Тариф включается не кнопкой, а после разговора и договора: к первому входу склады, клиенты и роли уже заведены, а остатки перенесены из вашей выгрузки. Первый экран — рабочий день смены, а не пустая система, которую ещё предстоит наполнить.",
      "This plan is not switched on by a button but after a conversation and a contract: by your first login the warehouses, clients and roles are already set up and stock has been migrated from your export. The first screen is a working shift, not an empty system waiting to be filled.",
    ),
    features: [
      c("Неограниченная номенклатура, несколько складов", "Unlimited SKUs, several warehouses"),
      c(
        "До 20 пользователей, права настраиваются по операциям",
        "Up to 20 users, permissions set per operation",
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

/** Стоимость года со скидкой, округлённая до сотен рублей. */
export function yearlyPrice(plan: Plan): number {
  return Math.round((plan.monthly * 12 * (1 - YEARLY_DISCOUNT)) / 100) * 100;
}

/**
 * Подпись под ценой дополнения: «за склад · доступ 30 дней» или «в месяц».
 *
 * Возвращает пару языков, а не готовую строку: подпись собирается из двух
 * кусков, и склеивать их придётся в любом случае — лучше здесь, рядом с
 * данными, чем в вёрстке, где эта сборка повторится на каждой карточке.
 */
export function extraUnitLabel(extra: SellerExtra): Copy {
  if (extra.unit === "month") return c("в месяц", "a month");
  if (!extra.access) return c("за склад", "per warehouse");
  return {
    ru: `за склад · ${extra.access.ru}`,
    en: `per warehouse · ${extra.access.en}`,
  };
}
