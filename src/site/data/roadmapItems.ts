import { c } from "../lib/copy";
import type { RoadmapItem } from "./roadmap";

/**
 * Содержимое дорожной карты.
 *
 * Единственный источник правды: и сводка, и доска, и журнал читают этот
 * список, а не собирают свои. Хранится статикой намеренно — роадмап правят
 * руками раз в неделю, и ради него не нужны ни база, ни админка: правка это
 * коммит, а история правок это история git.
 *
 * Готовым здесь считается то, что действительно открывается в демо. Проверять
 * это глазами по экранам — единственный способ: автоматически «работает» от
 * «написано» не отличить, а роадмап, который называет готовым недоделанное,
 * вреднее отсутствующего.
 */
export const ROADMAP_ITEMS: readonly RoadmapItem[] = [
  // ——— Готово и выпущено: прототип 0.1.0 ———
  {
    id: "plan-editor",
    title: c("Редактор плана мезонина", "The mezzanine plan editor"),
    summary: c(
      "Секции стеллажей расставляются мышью: у каждой настоящие габариты, ярусы и число ячеек",
      "Racking sections are placed by mouse, each with real dimensions, tiers and a cell count",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "addressing",
    title: c("Адресация и автонумерация", "Addressing and auto-numbering"),
    summary: c(
      "Ряды определяются по плану сами, а адрес ячейки печатается тем же форматом, каким показан на экране",
      "Rows are derived from the plan itself, and a cell address prints in the same format it is shown in",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "placement",
    title: c("Подбор места по габаритам", "Placement by dimensions"),
    summary: c(
      "Уклад предлагает ячейку, в которую коробка действительно влезет, а не ближайшую свободную",
      "Uklad suggests a cell the box will actually fit into, not the nearest empty one",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "heatmap",
    title: c("Тепловая карта занятости", "The occupancy heatmap"),
    summary: c(
      "Видно сверху, где склад забит, а где пусто — отдельным окном на второй монитор",
      "A view from above of what is full and what is empty — in its own window for a second screen",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "linked-floors",
    title: c("Связанные этажи", "Linked floors"),
    summary: c(
      "Одинаковые этажи не рисуются заново: копия зеркалит источник и правится вместе с ним",
      "Identical floors are not drawn twice: a copy mirrors its source and changes with it",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "pick-priority",
    title: c("Приоритет отбора на полке", "Pick priority on the shelf"),
    summary: c(
      "Ходовое лежит ближе к проходу, запас выше; полку можно закрыть от автоподбора, не убирая товар",
      "Fast movers sit by the aisle and the backup above; a shelf can be hidden from auto-pick without emptying it",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "view-3d",
    title: c("Объёмный вид плана", "The 3D view of the plan"),
    summary: c(
      "Мезонин в объёме — чтобы показать склад клиенту, а не объяснять его словами",
      "The mezzanine in three dimensions — to show a client the warehouse instead of describing it",
    ),
    status: "done",
    track: "plan",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "receiving",
    title: c("Приёмка от тары", "Intake by container"),
    summary: c(
      "Паллета → открыть тару → товар → закрыть и поставить на место. Сканер печатает код, камера не нужна",
      "Pallet → open the container → items → close it and put it away. The scanner types the code; no camera needed",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "tasks",
    title: c("Задания: список и календарь", "Tasks: a list and a calendar"),
    summary: c(
      "Что приедет и что уедет — списком на сегодня и календарём на месяц вперёд",
      "What arrives and what leaves — as today's list and as a month-ahead calendar",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "picking",
    title: c("Сборка заявок и наборы", "Picking and kits"),
    summary: c(
      "Лист сборки по ячейкам в порядке обхода; набор собирается из компонентов отдельной подзадачей",
      "A pick list by cell in walking order; a kit is assembled from its parts as its own subtask",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "shipping",
    title: c("Отгрузка рейсами", "Shipping by run"),
    summary: c(
      "«Собрана» и «отгружена» — разные статусы: снятое с полок уезжает машиной с номером и ответственным",
      "«Picked» and «shipped» are different states: what left the shelves leaves on a van with a number and a name",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "crossdock",
    title: c("Кроссдокинг и бронь под поставку", "Cross-docking and booking against a supply"),
    summary: c(
      "Товара ещё нет: заявка бронирует строку будущей поставки, а транзит уходит с приёмки мимо полки",
      "The goods are not here yet: a request books a line of a future supply, and transit leaves intake without ever hitting a shelf",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "labels",
    title: c("Ярлыки и конструктор наклеек", "Labels and the label designer"),
    summary: c(
      "Ярлыки ячеек, полок и тары со штрихкодом: размер печати и набор реквизитов настраиваются под свой принтер",
      "Cell, shelf and container labels with a barcode: the print size and the fields are set up for your own printer",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "documents",
    title: c("Складские документы", "Warehouse documents"),
    summary: c(
      "Лист сборки, накладная на отгрузку и лист приёмки — на бумагу в том виде, в каком их подписывают",
      "The pick list, the shipping note and the intake sheet — on paper the way they get signed",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "lookup",
    title: c("Экран «Что это?»", "The «What is this?» screen"),
    summary: c(
      "Любой код со склада — товар, тара, паллета или ячейка — разбирается одним сканированием",
      "Any code in the warehouse — an item, a container, a pallet or a cell — resolves in one scan",
    ),
    status: "done",
    track: "fulfillment",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "roles",
    title: c("Две роли: склад и продавец", "Two roles: warehouse and seller"),
    summary: c(
      "Продавец видит тот же склад на чтение, заводит заявки и сам говорит, что везёт на приёмку",
      "The seller sees the same warehouse read-only, files requests and states what they are bringing in",
    ),
    status: "done",
    track: "platform",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "chat",
    title: c("Чат склада и продавца", "The warehouse-to-seller chat"),
    summary: c(
      "Вопрос по заявке задаётся там же, где заявка, — а не в почте, где его потом не найти",
      "A question about a request is asked where the request is, not in an inbox where it gets lost",
    ),
    status: "done",
    track: "platform",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "spec",
    title: c("Паспорт склада", "The warehouse profile"),
    summary: c(
      "Режим работы, заезд, температура, пожарная категория и оснащение — один экран на обе роли",
      "Hours, access, temperature, fire category and equipment — one screen for both roles",
    ),
    status: "done",
    track: "platform",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "staff",
    title: c("Персонал и нагрузка по фактам", "Staff and workload from facts"),
    summary: c(
      "Приёмки, принятые единицы и отгрузки берутся из операций, а не из ощущений бригадира",
      "Intakes, units accepted and shipments come from the operations, not the foreman's impression",
    ),
    status: "done",
    track: "platform",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "analytics",
    title: c("Аналитика смены", "Shift analytics"),
    summary: c(
      "Сколько прошло через склад за неделю и где смена встала — графиком, а не выгрузкой",
      "How much went through the warehouse this week and where the shift stalled — as a chart, not an export",
    ),
    status: "done",
    track: "platform",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "import",
    title: c("Импорт номенклатуры", "Catalogue import"),
    summary: c(
      "Товары заезжают файлом xlsx или csv — колонки сопоставляются на месте",
      "Items arrive as an xlsx or csv file, with the columns mapped on the spot",
    ),
    status: "done",
    track: "platform",
    milestone: "browser",
    version: "0.1.0",
  },
  {
    id: "integrations-catalog",
    title: c("Каталог систем для обмена", "The catalogue of systems to exchange with"),
    summary: c(
      "Маркетплейсы, учёт, доставка и госсистемы: по каждой известно, какой нужен доступ и какие поля",
      "Marketplaces, accounting, delivery and state systems: for each one, what access and which fields it needs",
    ),
    status: "done",
    track: "integrations",
    milestone: "browser",
    version: "0.1.0",
  },

  // ——— Готово, но ещё не выпущено: раздел «Не выпущено» в CHANGELOG.md ———
  {
    id: "market",
    title: c("Витрина складов", "The warehouse catalogue"),
    summary: c(
      "Каталог с отбором и картой, карточка склада с ценами и расчётом хранения, заявка без комиссии",
      "A catalogue with filters and a map, a warehouse page with prices and a storage estimate, a request with no commission",
    ),
    status: "done",
    track: "market",
    milestone: "launch",
  },
  {
    id: "legal",
    title: c("Правовая часть сайта", "The legal side of the site"),
    summary: c(
      "Политика обработки персональных данных, соглашение, оферта, согласия под формами и выбор cookie",
      "The personal data policy, the terms, the offer, the consents under the forms and the cookie choice",
    ),
    status: "done",
    track: "market",
    milestone: "launch",
  },
  {
    id: "prerender",
    title: c("Пререндер и карта сайта", "Prerendering and the sitemap"),
    summary: c(
      "Каждая страница лежит готовым файлом: поисковик и человек без скриптов видят текст, а не пустой контейнер",
      "Every page is a ready-made file: a crawler and a visitor without scripts see the text, not an empty container",
    ),
    status: "done",
    track: "market",
    milestone: "launch",
  },
  {
    id: "en",
    title: c("Английская версия витрины", "The English version of the site"),
    summary: c(
      "Второй язык со своими адресами и hreflang. Правовые документы остаются русскими: силу имеет русский текст",
      "A second language with its own addresses and hreflang. The legal documents stay Russian: the Russian text is the binding one",
    ),
    status: "done",
    track: "market",
    milestone: "launch",
  },
  {
    id: "data-layer",
    title: c("Слой репозиториев под сервер", "A repository layer ready for a server"),
    summary: c(
      "Экраны уже ходят за данными через репозитории: когда появится база, меняется репозиторий, а не экраны",
      "Screens already fetch through repositories: when a database arrives, the repository changes, not the screens",
    ),
    status: "done",
    track: "platform",
    milestone: "launch",
  },
  {
    id: "design-tokens",
    title: c("Дизайн-система и токены", "The design system and its tokens"),
    summary: c(
      "Палитра описана один раз: код и Figma берут цвета из одного файла и не расходятся на первой же правке",
      "The palette is defined once: the code and Figma read colours from one file and cannot drift apart",
    ),
    status: "done",
    track: "platform",
    milestone: "launch",
  },

  // ——— В работе ———
  {
    id: "domain",
    title: c("Запуск на домене", "Going live on the domain"),
    summary: c(
      "Сайт переезжает с ноутбука на u-klad.ru: хостинг, почта на домене и приём заявок на российском сервере",
      "The site moves from a laptop to u-klad.ru: hosting, mail on the domain and request handling on a Russian server",
    ),
    status: "progress",
    track: "market",
    milestone: "launch",
    quarter: "2026-Q4",
  },

  // ——— Запланировано ———
  {
    id: "database",
    title: c("База и вход по паролю", "A database and a password login"),
    summary: c(
      "Данные переезжают из браузера на сервер: склад открывается с любого устройства и не пропадает вместе с кэшем",
      "Data moves out of the browser onto a server: the warehouse opens on any device and does not vanish with the cache",
    ),
    status: "planned",
    track: "platform",
    milestone: "server",
    quarter: "2026-Q4",
  },
  {
    id: "rights",
    title: c("Аккаунты и права", "Accounts and rights"),
    summary: c(
      "Кладовщик, бригадир, владелец и продавец видят разное и правят разное",
      "The storekeeper, the foreman, the owner and the seller each see and edit something different",
    ),
    status: "planned",
    track: "platform",
    milestone: "server",
    quarter: "2027-Q1",
  },
  {
    id: "marketplaces",
    title: c("Обмен с Ozon и Wildberries", "Exchange with Ozon and Wildberries"),
    summary: c(
      "Первый настоящий обмен: заказы приезжают в заявки, остатки уходят на площадку",
      "The first real exchange: orders arrive as requests, stock goes out to the platform",
    ),
    status: "planned",
    track: "integrations",
    milestone: "exchange",
    quarter: "2027-Q1",
  },
  {
    id: "mobile-picker",
    title: c("Терминал сборщика", "The picker's terminal"),
    summary: c(
      "Телефон вместо ТСД: задание, сканирование и подтверждение прямо в проходе",
      "A phone instead of a handheld: the task, the scan and the confirmation right there in the aisle",
    ),
    status: "planned",
    track: "fulfillment",
    milestone: "floor",
    quarter: "2027-Q1",
  },
  {
    id: "pick-route",
    title: c("Маршрут сборки по плану", "A pick route from the plan"),
    summary: c(
      "Порядок обхода считается по настоящей геометрии склада, а не по номеру ячейки",
      "The walking order is computed from the real geometry of the warehouse, not from cell numbers",
    ),
    status: "planned",
    track: "plan",
    milestone: "floor",
    quarter: "2027-Q1",
  },
  {
    id: "inventory",
    title: c("Инвентаризация", "Stocktaking"),
    summary: c(
      "Пересчёт по ячейкам со сверкой факта с учётом и актом расхождений",
      "A recount by cell, reconciled against the books, with a discrepancy report",
    ),
    status: "planned",
    track: "fulfillment",
    milestone: "floor",
    quarter: "2027-Q2",
  },
  {
    id: "accounting",
    title: c("1С и МойСклад", "1C and MoySklad"),
    summary: c(
      "Номенклатура и остатки не набиваются дважды",
      "The catalogue and the stock are not typed in twice",
    ),
    status: "planned",
    track: "integrations",
    milestone: "exchange",
    quarter: "2027-Q2",
  },
  {
    id: "delivery",
    title: c("Доставка: СДЭК и Почта России", "Delivery: CDEK and Russian Post"),
    summary: c(
      "Наклейка перевозчика печатается из Уклада, а трек возвращается в заявку",
      "The carrier's label prints from Uklad, and the tracking number comes back into the request",
    ),
    status: "planned",
    track: "integrations",
    milestone: "exchange",
    quarter: "2027-Q2",
  },
  {
    id: "reports",
    title: c("Отчёты и выгрузки", "Reports and exports"),
    summary: c(
      "Оборачиваемость, загрузка ячеек и выработка смены — в файл, а не только на экран",
      "Turnover, cell utilisation and shift output — into a file, not only onto the screen",
    ),
    status: "planned",
    track: "platform",
    milestone: "exchange",
    quarter: "2027-Q2",
  },

  // ——— Идеи: сроков нет намеренно ———
  {
    id: "billing",
    title: c("Счёт за хранение", "A storage invoice"),
    summary: c(
      "Ставка за ячейку уже есть в карточке склада — остаётся посчитать месяц и выставить счёт",
      "The per-cell rate is already on the warehouse page — what is left is to total the month and bill it",
    ),
    status: "idea",
    track: "platform",
    milestone: "service",
  },
  {
    id: "client-cabinet",
    title: c("Кабинет клиента склада", "An account for the warehouse's client"),
    summary: c(
      "Отдельный вход для того, чей товар лежит: свой остаток, свои заявки, свой счёт",
      "A separate login for whoever owns the stock: their balance, their requests, their invoice",
    ),
    status: "idea",
    track: "platform",
    milestone: "service",
  },
  {
    id: "api",
    title: c("Открытый API", "A public API"),
    summary: c(
      "Чтобы соседняя система забирала остатки и ставила задания без нас",
      "So a neighbouring system can read stock and create tasks without us",
    ),
    status: "idea",
    track: "integrations",
    milestone: "service",
  },
  {
    id: "markirovka",
    title: c("Честный знак по-настоящему", "Chestny Znak for real"),
    summary: c(
      "Сейчас коды маркировки в демо ненастоящие. Нужен живой обмен с ГИС МТ",
      "The marking codes in the demo are not real. What is needed is a live exchange with the state system",
    ),
    status: "idea",
    track: "integrations",
    milestone: "exchange",
  },
  {
    id: "edo",
    title: c("ЭДО накладных", "Electronic waybills"),
    summary: c(
      "Накладная уходит контрагенту подписанной — без печати и курьера",
      "The waybill goes to the counterparty signed — no printing, no courier",
    ),
    status: "idea",
    track: "integrations",
    milestone: "exchange",
  },
  {
    id: "voice",
    title: c("Голосовой набор", "Voice picking"),
    summary: c(
      "Руки заняты коробкой: сборка подтверждается голосом, а не тапом",
      "Hands are busy holding a box: a pick is confirmed by voice, not by a tap",
    ),
    status: "idea",
    track: "fulfillment",
    milestone: "floor",
  },
];
