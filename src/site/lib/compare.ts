import type { Warehouse } from "../data/warehouses";
import { monthlyPerPlace } from "../data/warehouses";
import { c, type Copy } from "./copy";
import { estimateMonth, fitsVolume, isVolumeSet, type SellerVolume } from "./estimate";

/**
 * Сравнение отмеченных складов.
 *
 * Витрина доводит селлера до короткого списка, а дальше он остаётся с ним один
 * на один: склады открываются по одному в соседних вкладках, и переключаться
 * между ними приходится глазами и памятью. Четыре цены, минимум, свободные
 * места, срок ответа — это тридцать чисел на четыре склада, и держать их в
 * голове человек не обязан.
 *
 * Поэтому здесь только то, что можно поставить в одну строку и честно назвать
 * лучшим: числа с понятным направлением. Площадки, схемы работы и отметка
 * проверки в строки не превращаются — «Wildberries лучше, чем Ozon» неверно, и
 * их показывает сама таблица, без победителей.
 */

/**
 * Сколько складов сравниваем разом.
 *
 * Четыре — не круглое число, а ширина экрана: пятая колонка на ноутбуке
 * складывается в 120 пикселей, и таблица перестаёт читаться ровно там, где
 * начинает быть нужна.
 */
export const COMPARE_LIMIT = 4;

/**
 * Отметить или снять склад.
 *
 * Порядок — порядок отметки, а не выдачи: колонки не должны переставляться,
 * когда человек по ходу дела меняет сортировку списка.
 *
 * На пределе новый склад не добавляется, и это осознанно. Вытеснять самый
 * старый было бы «умнее», но человек отметил его сам — и обнаружил бы пропажу
 * уже в таблице, где на неё не за что списать. Кнопка в таком случае гаснет и
 * объясняется словами.
 */
export function toggleCompare(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter((x) => x !== id);
  if (selected.length >= COMPARE_LIMIT) return selected;
  return [...selected, id];
}

/** Отмеченные склады в порядке отметки; неизвестные идентификаторы отбрасываются. */
export function comparedWarehouses(list: Warehouse[], selected: string[]): Warehouse[] {
  const byId = new Map(list.map((w) => [w.id, w]));
  return selected.map((id) => byId.get(id)).filter((w): w is Warehouse => w !== undefined);
}

/** Куда смотреть в строке: меньше — лучше, или больше — лучше. */
export type Direction = "less" | "more";

export interface CompareRow {
  key: string;
  /**
   * Подпись строки — парой языков, как весь текст витрины. Строка сравнения
   * попадает человеку на глаза дословно, а значит переводится наравне с
   * вёрсткой; хранить здесь готовую русскую фразу значило бы, что английская
   * витрина показывает таблицу по-русски.
   */
  label: Copy;
  /** Единица измерения для подписи; у рейтинга её нет. */
  unit?: Copy;
  /** Значения по складам в том же порядке. `null` — сравнивать нечего. */
  values: (number | null)[];
  direction: Direction;
  /** Дробных знаков при выводе. */
  digits?: number;
}

/**
 * Строки сравнения по отмеченным складам.
 *
 * Первой идёт та, ради которой всё затевалось, — месяц под объём селлера.
 * Пока объём не задан, строки нет вовсе: «0 ₽» читается как «бесплатно», а
 * значит здесь «неизвестно». Дальше — прайс построчно, потому что из него
 * этот месяц и складывается, и потом условия работы.
 */
export function compareRows(list: Warehouse[], volume: SellerVolume): CompareRow[] {
  const rows: CompareRow[] = [];

  if (isVolumeSet(volume)) {
    rows.push({
      key: "month",
      label: c("Месяц под ваш объём", "A month at your volume"),
      unit: c("₽", "₽"),
      direction: "less",
      // Склад, который такой объём не возьмёт, цены не показывает: сумма,
      // которой не будет, — худший советчик из возможных.
      values: list.map((w) => (fitsVolume(w, volume) ? estimateMonth(w, volume).total : null)),
    });
  }

  rows.push(
    {
      key: "storage",
      label: c("Хранение", "Storage"),
      unit: c("₽ / место в сутки", "₽ / slot a day"),
      direction: "less",
      values: list.map((w) => w.price.storage),
    },
    {
      key: "storage-month",
      label: c("Одно место в месяц", "One slot a month"),
      unit: c("₽", "₽"),
      direction: "less",
      values: list.map((w) => monthlyPerPlace(w)),
    },
    {
      key: "receiving",
      label: c("Приёмка", "Intake"),
      unit: c("₽ / короб", "₽ / box"),
      direction: "less",
      values: list.map((w) => w.price.receiving),
    },
    {
      key: "picking",
      label: c("Сборка", "Picking"),
      unit: c("₽ / заказ", "₽ / order"),
      direction: "less",
      values: list.map((w) => w.price.picking),
    },
    {
      key: "marking",
      label: c("Маркировка", "Labelling"),
      unit: c("₽ / единица", "₽ / item"),
      direction: "less",
      values: list.map((w) => w.price.marking),
    },
    {
      key: "min",
      label: c("Минимальный объём", "Minimum volume"),
      unit: c("мест", "slots"),
      direction: "less",
      values: list.map((w) => w.minPlaces),
    },
    {
      key: "free",
      label: c("Свободно", "Free"),
      unit: c("мест", "slots"),
      direction: "more",
      values: list.map((w) => w.cellsFree),
    },
    {
      key: "response",
      label: c("Средний ответ", "Average reply"),
      unit: c("ч", "h"),
      direction: "less",
      values: list.map((w) => w.responseHours),
    },
    {
      key: "rating",
      label: c("Оценка по отзывам", "Rating from reviews"),
      direction: "more",
      digits: 1,
      // `null` у склада, о котором отзывов нет, — и это не то же самое, что
      // низкая оценка. Строка сравнения покажет прочерк, а победителем в ней
      // станет тот, у кого оценка есть: сравнивать можно только сравнимое.
      values: list.map((w) => w.reputation.rating),
    },
    {
      key: "reviews",
      label: c("Отзывов", "Reviews"),
      unit: c("шт.", "pcs"),
      direction: "more",
      // Число отзывов идёт отдельной строкой, а не подписью к оценке: 5,0 по
      // одному отзыву и 4,7 по двадцати — разные утверждения, и выбирающему
      // между двумя складами это важнее самой десятой балла.
      values: list.map((w) => w.reputation.reviews),
    },
  );

  return rows;
}

/**
 * Кто в строке лучше — по её направлению.
 *
 * При равенстве возвращаются все: выбрать одного из двух одинаковых значит
 * подсказать то, чего в данных нет. Единственный склад в сравнении победителей
 * не даёт вовсе — сравнивать не с чем.
 *
 * А вот единственная заполненная клетка среди нескольких складов победителем
 * считается: если объём готов взять только один из отмеченных, это и есть
 * ответ строки, а не отсутствие ответа.
 */
export function bestIndexes(row: CompareRow): number[] {
  if (row.values.length < 2) return [];

  const filled = row.values
    .map((value, i) => ({ value, i }))
    .filter((v): v is { value: number; i: number } => v.value !== null);
  if (filled.length === 0) return [];

  const best =
    row.direction === "less"
      ? Math.min(...filled.map((v) => v.value))
      : Math.max(...filled.map((v) => v.value));

  return filled.filter((v) => v.value === best).map((v) => v.i);
}
