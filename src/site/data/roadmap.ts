import { c, type Copy } from "../lib/copy";

/**
 * Модель дорожной карты: стадии, направления, вехи и журнал выпусков.
 *
 * Сами пункты лежат отдельно (`data/roadmapItems.ts`): их полсотни, и они
 * меняются каждую неделю, а этот файл — раз в квартал. В одном файле правка
 * содержания каждый раз задевала бы описание модели.
 *
 * Роадмап — обещание наружу, поэтому у пункта нет ни одной выдуманной цифры.
 * Ни счётчика голосов (сложить их негде — витрина статическая, и отметки живут
 * в браузере того, кто их поставил, см. `lib/roadmapVotes`), ни даты выхода у
 * каждой строки (её неоткуда взять точнее, чем «в таком-то выпуске»). Когда что
 * вышло — отвечает журнал ниже, и его даты сверены с `CHANGELOG.md`.
 */

/** Стадия работы. Порядок ключей = порядок колонок на доске. */
export type Status = "idea" | "planned" | "progress" | "done";

/** Направление работы — по нему отбирают доску. */
export type Track = "plan" | "fulfillment" | "integrations" | "platform" | "market";

export interface RoadmapItem {
  id: string;
  title: Copy;
  /** Одна фраза о том, что человек получит. Не «что мы сделаем». */
  summary: Copy;
  status: Status;
  track: Track;
  /** Веха, к которой относится пункт (`Milestone.id`). */
  milestone: string;
  /**
   * Ориентир по кварталу, «2026-Q4». Есть только у запланированного и того,
   * что пишется: у готового срок уже не ориентир, а у идеи его нет вовсе —
   * проставленный «на всякий случай» квартал у идеи читается как обещание.
   */
  quarter?: string;
  /**
   * Выпуск, в котором вышел пункт (`Release.version`). Есть только у готового,
   * и не у всего готового: работающее, но ещё не выпущенное, живёт без версии
   * — ровно как раздел «Не выпущено» в `CHANGELOG.md`.
   */
  version?: string;
}

/** Крупный этап: несколько пунктов, которые имеют смысл только вместе. */
export interface Milestone {
  id: string;
  title: Copy;
  /** Зачем этап нужен клиенту — одной фразой. */
  goal: Copy;
  /** Ориентир завершения, «2026-Q4». У завершённого — пусто. */
  target?: string;
}

/** Запись в журнале обновлений. */
export interface Release {
  version: string;
  /** Дата выпуска, ISO. */
  date: string;
  title: Copy;
  /** Что вошло — короткими строками, как человек увидит это в продукте. */
  highlights: Copy[];
}

/** Подписи стадий. Порядок ключей = порядок колонок на доске. */
export const STATUS_LABELS: Record<Status, Copy> = {
  done: c("Готово", "Done"),
  progress: c("В работе", "In progress"),
  planned: c("Запланировано", "Planned"),
  idea: c("Идеи", "Ideas"),
};

/** Пояснение к колонке: что стадия означает на практике. */
export const STATUS_HINTS: Record<Status, Copy> = {
  done: c("Работает в продукте", "Works in the product"),
  progress: c("Делается прямо сейчас", "Being built right now"),
  planned: c("Решено делать, ждёт очереди", "Decided, waiting its turn"),
  idea: c("Обсуждаем, сроков нет", "Under discussion, no dates"),
};

/** Порядок колонок на доске — от сделанного к необязательному. */
export const STATUS_ORDER: readonly Status[] = ["done", "progress", "planned", "idea"];

export const TRACK_LABELS: Record<Track, Copy> = {
  plan: c("План склада", "Floor plan"),
  fulfillment: c("Смена", "The shift"),
  integrations: c("Обмен", "Exchange"),
  platform: c("Платформа", "Platform"),
  market: c("Витрина", "The site"),
};

export const MILESTONES: readonly Milestone[] = [
  {
    id: "browser",
    title: c("Склад в браузере", "The warehouse in a browser"),
    goal: c(
      "Нарисовать план, разложить товар и провести смену целиком — без установки и без сервера",
      "Draw the plan, put the stock away and run a whole shift — with no install and no server",
    ),
  },
  {
    id: "launch",
    title: c("Витрина и запуск", "The site and the launch"),
    goal: c(
      "Склад находят снаружи: каталог в поиске, заявка без звонка, документы на месте",
      "Warehouses get found from outside: in search, a request with no call, the paperwork in place",
    ),
    target: "2026-Q4",
  },
  {
    id: "server",
    title: c("Данные на сервере", "Data on a server"),
    goal: c(
      "Один склад — несколько людей: общая база, вход по паролю, права по роли",
      "One warehouse, several people: a shared database, a password, rights by role",
    ),
    target: "2027-Q1",
  },
  {
    id: "floor",
    title: c("Смена в руках", "The shift in hand"),
    goal: c(
      "Сборщик работает с телефона в проходе, а не с ноутбука в кабинете",
      "The picker works from a phone in the aisle, not a laptop in the office",
    ),
    target: "2027-Q1",
  },
  {
    id: "exchange",
    title: c("Обмен с площадками", "Exchange with the platforms"),
    goal: c(
      "Заказы и остатки ходят между Укладом, маркетплейсами и учётной системой сами",
      "Orders and stock move between Uklad, the marketplaces and the accounting system on their own",
    ),
    target: "2027-Q2",
  },
  {
    id: "service",
    title: c("Склад как услуга", "The warehouse as a service"),
    goal: c(
      "Считать хранение и показывать клиенту его товар и его счёт",
      "Bill for storage and show the client their own stock and their own invoice",
    ),
    target: "2027-Q3",
  },
];

/**
 * Журнал выпусков.
 *
 * Сверен с `CHANGELOG.md` и повторяет его: выпуск здесь появляется только
 * после того, как появился там. Версии продуктовые — они нумеруют то, что
 * человек увидел в интерфейсе, и с версиями пакетов не совпадают.
 *
 * Выпуск пока один, и это правда: всё, что сделано после него, лежит в
 * «Не выпущено» и на доске показано готовым, но без версии.
 */
export const RELEASES: readonly Release[] = [
  {
    version: "0.1.0",
    date: "2026-09-02",
    title: c("Прототип склада", "The warehouse prototype"),
    highlights: [
      c(
        "Редактор плана мезонина: секции с настоящими габаритами, ярусами и ячейками",
        "The mezzanine plan editor: sections with real dimensions, tiers and cells",
      ),
      c(
        "Смена целиком — приёмка, задания, сборка, отгрузка",
        "A whole shift — intake, tasks, picking and shipping",
      ),
      c(
        "Печать ярлыков и складских документов в рабочем виде",
        "Labels and warehouse documents printed the way they get signed",
      ),
      c(
        "Кабинет продавца, чат со складом и аналитика смены",
        "The seller's account, a chat with the warehouse and shift analytics",
      ),
    ],
  },
];

/** Выпуски по версии — чтобы карточка нашла свой, не перебирая список. */
export const RELEASE_BY_VERSION: Record<string, Release> = Object.fromEntries(
  RELEASES.map((release) => [release.version, release]),
);
