import type { Milestone, RoadmapItem, Release, Status, Track } from "./types";

/**
 * Содержимое публичного роадмапа.
 *
 * Единственный источник правды для витрины: борд, дашборд и журнал читают
 * этот файл, а не собирают свои списки. База хранится статикой намеренно —
 * роадмап меняется раз в неделю руками, и ради него не нужен ни бэкенд, ни
 * админка; правка = коммит, а история правок = история git.
 *
 * Голоса здесь — накопленный итог. Голос посетителя прибавляется к нему в
 * браузере (`lib/votes.ts`), поэтому числа в файле не трогаем при каждом
 * клике: страница статическая, а не форма обратной связи.
 */

/** Подписи стадий. Порядок ключей = порядок колонок на борде. */
export const STATUS_LABELS: Record<Status, string> = {
  idea: "Идея",
  planned: "Запланировано",
  progress: "В работе",
  done: "Готово",
};

/** Пояснение к колонке: что стадия означает на практике. */
export const STATUS_HINTS: Record<Status, string> = {
  idea: "Обсуждаем. Сроков нет, голоса решают порядок",
  planned: "Решено делать, ждёт очереди",
  progress: "Пишется прямо сейчас",
  done: "Работает в продукте",
};

export const TRACK_LABELS: Record<Track, string> = {
  plan: "План склада",
  fulfillment: "Смена",
  integrations: "Обмен",
  platform: "Платформа",
};

export const MILESTONES: Milestone[] = [
  {
    id: "browser",
    title: "Склад в браузере",
    goal: "Нарисовать план, разложить товар и провести смену целиком — без установки и без сервера",
    target: "2026-Q3",
  },
  {
    id: "server",
    title: "Данные на сервере",
    goal: "Один склад — несколько людей: общая база, вход по паролю, права по роли",
    target: "2026-Q4",
  },
  {
    id: "floor",
    title: "Смена в руках",
    goal: "Сборщик работает с телефона в проходе, а не с ноутбука в кабинете",
    target: "2027-Q1",
  },
  {
    id: "exchange",
    title: "Обмен с площадками",
    goal: "Заказы и остатки ходят между Укладом, маркетплейсами и учётной системой сами",
    target: "2027-Q2",
  },
  {
    id: "service",
    title: "Склад как услуга",
    goal: "Считать хранение и показывать клиенту его товар и его счёт",
    target: "2027-Q3",
  },
];

export const ITEMS: RoadmapItem[] = [
  // ——— Готово: то, что работает в прототипе ———
  {
    id: "plan-editor",
    title: "Редактор плана мезонина",
    summary:
      "Секции стеллажей расставляются мышью: у каждой реальные габариты, ярусы и число ячеек",
    status: "done",
    track: "plan",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 64,
    shippedAt: "2026-07-21",
    version: "0.1.0",
  },
  {
    id: "addressing",
    title: "Адресация и автонумерация",
    summary:
      "Ряды определяются по плану сами, адрес ячейки печатается тем же форматом, что показан на экране",
    status: "done",
    track: "plan",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 41,
    shippedAt: "2026-07-21",
    version: "0.1.0",
  },
  {
    id: "placement",
    title: "Подбор места по габаритам",
    summary:
      "Уклад предлагает ячейку, в которую коробка действительно влезет, а не ближайшую свободную",
    status: "done",
    track: "plan",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 88,
    shippedAt: "2026-07-21",
    version: "0.1.0",
  },
  {
    id: "heatmap",
    title: "Тепловая карта занятости",
    summary: "Видно сверху, где склад забит, а где пусто — отдельным окном на второй монитор",
    status: "done",
    track: "plan",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 57,
    shippedAt: "2026-07-21",
    version: "0.1.0",
  },
  {
    id: "linked-floors",
    title: "Связанные этажи",
    summary: "Одинаковые этажи не рисуются заново: копия зеркалит источник и правится вместе с ним",
    status: "done",
    track: "plan",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 23,
    shippedAt: "2026-08-26",
    version: "0.2.0",
  },
  {
    id: "pick-priority",
    title: "Приоритет отбора на полке",
    summary:
      "Ходовое лежит ближе к проходу, запас выше; полку можно закрыть от автоподбора, не убирая товар",
    status: "done",
    track: "plan",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 35,
    shippedAt: "2026-08-26",
    version: "0.2.0",
  },
  {
    id: "receiving",
    title: "Приёмка от тары",
    summary:
      "Паллета → открыть тару → товар → закрыть и поставить на место. Сканер печатает код, камера не нужна",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 92,
    shippedAt: "2026-08-26",
    version: "0.2.0",
  },
  {
    id: "tasks",
    title: "Задания: список и календарь",
    summary: "Что приедет и что уедет — списком на сегодня и календарём на месяц вперёд",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 44,
    shippedAt: "2026-08-26",
    version: "0.2.0",
  },
  {
    id: "picking",
    title: "Сборка заявок и наборы",
    summary:
      "Лист сборки по ячейкам в порядке обхода; набор собирается из компонентов одной подзадачей",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 76,
    shippedAt: "2026-08-26",
    version: "0.2.0",
  },
  {
    id: "shipping",
    title: "Отгрузка рейсами",
    summary:
      "«Собрана» и «отгружена» — разные статусы: снятое с полок уезжает машиной с номером и ответственным",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 68,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "crossdock",
    title: "Кроссдокинг и бронь под поставку",
    summary:
      "Товар, которого ещё нет: заявка бронирует строку будущей поставки, а транзит уходит с приёмки мимо полки",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 51,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "labels",
    title: "Ярлыки и конструктор наклеек",
    summary:
      "Ярлыки ячеек, полок и тары со штрихкодом: размер печати и набор реквизитов настраиваются под свой принтер",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 47,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "documents",
    title: "Складские документы",
    summary:
      "Лист сборки, накладная на отгрузку, лист приёмки — на бумагу в том виде, в каком их подписывают",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 39,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "lookup",
    title: "Экран «Что это?»",
    summary: "Любой код со склада — товар, тара, паллета или ячейка — разбирается одним сканированием",
    status: "done",
    track: "fulfillment",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 29,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "roles",
    title: "Две роли: склад и продавец",
    summary:
      "Продавец видит тот же склад на чтение, заводит заявки и сам говорит, что везёт на приёмку",
    status: "done",
    track: "platform",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 62,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "spec",
    title: "Паспорт склада",
    summary:
      "Режим работы, заезд, температура, пожарная категория и оснащение — один экран на обе роли",
    status: "done",
    track: "platform",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 26,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "staff",
    title: "Персонал и нагрузка по фактам",
    summary:
      "Приёмки, принятые единицы и отгрузки берутся из операций, а не из ощущений бригадира",
    status: "done",
    track: "platform",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 33,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },
  {
    id: "import",
    title: "Импорт номенклатуры",
    summary: "Товары заезжают файлом xlsx или csv — колонки сопоставляются на месте",
    status: "done",
    track: "platform",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 54,
    shippedAt: "2026-08-26",
    version: "0.2.0",
  },
  {
    id: "integrations-catalog",
    title: "Каталог систем для обмена",
    summary:
      "21 система — маркетплейсы, учёт, доставка, госсистемы: по каждой известно, какой API и какие поля нужны",
    status: "done",
    track: "integrations",
    quarter: "2026-Q3",
    milestone: "browser",
    votes: 31,
    shippedAt: "2026-09-12",
    version: "0.3.0",
  },

  // ——— В работе ———
  {
    id: "data-layer",
    title: "Слой репозиториев под сервер",
    summary:
      "Экраны уже ходят за данными через репозитории. Когда появится база, меняется репозиторий, а не экраны",
    status: "progress",
    track: "platform",
    quarter: "2026-Q4",
    milestone: "server",
    votes: 18,
  },
  {
    id: "design-system",
    title: "Дизайн-система и токены",
    summary: "Палитра и компоненты описаны один раз: код, Figma и эта витрина берут цвета из одного файла",
    status: "progress",
    track: "platform",
    quarter: "2026-Q4",
    milestone: "server",
    votes: 21,
  },
  {
    id: "marketplaces",
    title: "Обмен с Ozon и Wildberries",
    summary: "Первый настоящий обмен: заказы приезжают в заявки, остатки уходят на площадку",
    status: "progress",
    track: "integrations",
    quarter: "2026-Q4",
    milestone: "exchange",
    votes: 134,
  },
  {
    id: "view-3d",
    title: "3D-вид плана",
    summary: "Мезонин в объёме — чтобы показать склад клиенту, а не объяснять его словами",
    status: "progress",
    track: "plan",
    quarter: "2027-Q1",
    milestone: "floor",
    votes: 43,
  },

  // ——— Запланировано ———
  {
    id: "supabase",
    title: "База и вход по паролю",
    summary:
      "Данные переезжают из браузера на сервер: склад открывается с любого устройства и не чистится вместе с кэшем",
    status: "planned",
    track: "platform",
    quarter: "2026-Q4",
    milestone: "server",
    votes: 147,
  },
  {
    id: "rights",
    title: "Аккаунты и права",
    summary: "Кладовщик, бригадир, владелец и продавец видят разное и правят разное",
    status: "planned",
    track: "platform",
    quarter: "2026-Q4",
    milestone: "server",
    votes: 96,
  },
  {
    id: "mobile-picker",
    title: "Терминал сборщика",
    summary: "Телефон вместо ТСД: задание, сканирование и подтверждение прямо в проходе",
    status: "planned",
    track: "fulfillment",
    quarter: "2027-Q1",
    milestone: "floor",
    votes: 121,
  },
  {
    id: "pick-route",
    title: "Маршрут сборки по плану",
    summary: "Порядок обхода считается по реальной геометрии склада, а не по номеру ячейки",
    status: "planned",
    track: "plan",
    quarter: "2027-Q1",
    milestone: "floor",
    votes: 73,
  },
  {
    id: "inventory",
    title: "Инвентаризация",
    summary: "Пересчёт по ячейкам со сверкой факт/учёт и актом расхождений",
    status: "planned",
    track: "fulfillment",
    quarter: "2027-Q1",
    milestone: "floor",
    votes: 85,
  },
  {
    id: "accounting",
    title: "1С и МойСклад",
    summary: "Номенклатура и остатки не набиваются дважды",
    status: "planned",
    track: "integrations",
    quarter: "2027-Q2",
    milestone: "exchange",
    votes: 112,
  },
  {
    id: "delivery",
    title: "Доставка: СДЭК и Почта",
    summary: "Наклейка перевозчика печатается из Уклада, трек возвращается в заявку",
    status: "planned",
    track: "integrations",
    quarter: "2027-Q2",
    milestone: "exchange",
    votes: 78,
  },
  {
    id: "reports",
    title: "Отчёты и выгрузки",
    summary: "Оборачиваемость, загрузка ячеек и выработка смены — в файл, а не только на экран",
    status: "planned",
    track: "platform",
    quarter: "2027-Q2",
    milestone: "exchange",
    votes: 58,
  },

  // ——— Идеи ———
  {
    id: "billing",
    title: "Счёт за хранение",
    summary: "Ставка за ячейку уже есть в карточке склада — остаётся посчитать месяц и выставить счёт",
    status: "idea",
    track: "platform",
    quarter: "2027-Q3",
    milestone: "service",
    votes: 64,
  },
  {
    id: "client-cabinet",
    title: "Кабинет клиента",
    summary: "Отдельный вход для того, чей товар лежит: свой остаток, свои заявки, свой счёт",
    status: "idea",
    track: "platform",
    quarter: "2027-Q3",
    milestone: "service",
    votes: 49,
  },
  {
    id: "api",
    title: "Открытый API",
    summary: "Чтобы соседняя система забирала остатки и ставила задания без нас",
    status: "idea",
    track: "integrations",
    quarter: "2027-Q3",
    milestone: "service",
    votes: 37,
  },
  {
    id: "markirovka",
    title: "Честный знак по-настоящему",
    summary: "Сейчас коды маркировки — мок. Нужен реальный обмен с ГИС МТ",
    status: "idea",
    track: "integrations",
    quarter: "2027-Q3",
    milestone: "exchange",
    votes: 44,
  },
  {
    id: "voice",
    title: "Голосовой набор",
    summary: "Руки заняты коробкой: сборка подтверждается голосом, а не тапом",
    status: "idea",
    track: "fulfillment",
    quarter: "2027-Q3",
    milestone: "floor",
    votes: 19,
  },
  {
    id: "edo",
    title: "ЭДО накладных",
    summary: "Накладная уходит контрагенту подписанной, без печати и курьера",
    status: "idea",
    track: "integrations",
    quarter: "2027-Q3",
    milestone: "exchange",
    votes: 28,
  },
];

/**
 * Журнал обновлений. Версии здесь продуктовые: они нумеруют то, что человек
 * увидел в интерфейсе, и не совпадают с версиями пакетов в package.json.
 */
export const RELEASES: Release[] = [
  {
    version: "0.3.0",
    date: "2026-09-12",
    title: "Бумага и роли",
    highlights: [
      "Отгрузка рейсами: собранное уезжает машиной с номером и ответственным",
      "Лист сборки, накладная и лист приёмки печатаются в рабочем виде",
      "Конструктор наклеек: свой размер печати и свой набор реквизитов",
      "Продавец видит склад на чтение и сам заводит заявки",
      "Паспорт склада и каталог из 21 системы для обмена",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-08-26",
    title: "Смена целиком",
    highlights: [
      "Приёмка от тары со сверкой план/факт",
      "Задания списком и календарём",
      "Сборка заявок, наборы из компонентов",
      "Кроссдокинг и бронь под ещё не приехавшую поставку",
      "Импорт номенклатуры из xlsx и csv",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-21",
    title: "План и раскладка",
    highlights: [
      "Редактор плана мезонина с реальными габаритами секций",
      "Автонумерация рядов и единый формат адреса ячейки",
      "Подбор места по габаритам коробки",
      "Тепловая карта занятости отдельным окном",
    ],
  },
];
