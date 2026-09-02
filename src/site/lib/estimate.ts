import { monthlyPerPlace, type Warehouse } from "../data/warehouses";

/**
 * Сколько стоит месяц на этом складе — под объём конкретного селлера.
 *
 * Это то, ради чего витрина вообще имеет смысл. Прайсы фулфилмента
 * несопоставимы по своей природе: один склад дешевле по хранению и дороже по
 * сборке, другой наоборот, и «дешёвого склада» вообще не существует — есть
 * склад, дешёвый для конкретного оборота. Пока селлер не может посчитать себя,
 * четыре числа в карточке остаются четырьмя числами, и выбирают по рейтингу,
 * то есть наугад.
 *
 * Считается нарочито просто — умножением по прайсу, без коэффициентов,
 * которых мы не знаем: сезонности, габаритов, режима хранения, возвратов. Это
 * оценка, с которой идут в разговор со складом, и на витрине она так и
 * называется. Врать точностью хуже, чем не считать вовсе.
 */

/** Что селлер знает про свой оборот. Всё — за месяц, кроме мест хранения. */
export interface SellerVolume {
  /** Мест хранения, которые занимает товар. */
  places: number;
  /** Коробов приёмки в месяц. */
  boxes: number;
  /** Заказов на сборку в месяц. */
  orders: number;
  /** Единиц маркировки в месяц; 0 — маркировка не нужна. */
  marking: number;
}

export const EMPTY_VOLUME: SellerVolume = { places: 0, boxes: 0, orders: 0, marking: 0 };

/**
 * Потолок на поле ввода. Не «столько не бывает», а защита от опечатки: лишний
 * ноль в поле сборки превращает оценку в миллиарды, и человек верит не себе, а
 * экрану.
 */
const MAX_VALUE = 1_000_000;

/** Дней в месяце для хранения — та же величина, что в `monthlyPerPlace`. */
const one = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_VALUE);
};

/**
 * Приведение ввода к числам, с которыми можно считать.
 *
 * Граница системы: дальше отсюда не должно уходить ни отрицательных значений,
 * ни `NaN` из пустого поля, ни дробных мест хранения.
 */
export function normalizeVolume(v: SellerVolume): SellerVolume {
  return {
    places: one(v.places),
    boxes: one(v.boxes),
    orders: one(v.orders),
    marking: one(v.marking),
  };
}

/**
 * Задан ли объём. Пока не задан — расчёта не показываем: «0 ₽ в месяц» человек
 * читает как «бесплатно», а означает это «неизвестно».
 */
export function isVolumeSet(v: SellerVolume): boolean {
  return v.places > 0 || v.boxes > 0 || v.orders > 0 || v.marking > 0;
}

/** Месяц по строкам прайса и итог. Разбивка нужна: по ней видно, за что платят. */
export interface Estimate {
  storage: number;
  receiving: number;
  picking: number;
  marking: number;
  total: number;
}

export function estimateMonth(w: Warehouse, volume: SellerVolume): Estimate {
  const v = normalizeVolume(volume);
  const storage = v.places * monthlyPerPlace(w);
  const receiving = v.boxes * w.price.receiving;
  const picking = v.orders * w.price.picking;
  const marking = v.marking * w.price.marking;
  return {
    storage,
    receiving,
    picking,
    marking,
    total: storage + receiving + picking + marking,
  };
}

/**
 * Возьмёт ли склад такой объём.
 *
 * Два разных отказа, и оба лучше узнать до заявки: склад работает от
 * какого-то минимума (мелкому селлеру там не рады) или у него просто не
 * осталось свободных мест. Склады, которые не подходят, из списка не
 * выбрасываются — вместо этого карточка говорит, почему: пропавший из выдачи
 * склад читается как ошибка витрины, а не как ответ на вопрос.
 */
export function fitsVolume(w: Warehouse, volume: SellerVolume): boolean {
  const places = normalizeVolume(volume).places;
  if (places === 0) return true;
  if (places > w.cellsFree) return false;
  return places >= w.minPlaces;
}
