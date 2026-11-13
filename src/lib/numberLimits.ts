/**
 * Пределы чисел — одни на весь Уклад.
 *
 * Кирилл (12 ноя 2026, «уже не в первый раз»): в «Камер видеонаблюдения»
 * вводилось 34223413242134, в заявке — 2231242314234 паллето-мест, номер
 * телефона набирался бесконечно. Поле без предела принимает любую опечатку,
 * а дальше она расползается по отчётам, счетам и плану.
 *
 * Правило в три слоя:
 * 1. Здесь — именованные пределы по смыслу поля. Поле берёт предел отсюда, а не
 *    пишет свою цифру: «штук до 99 999» должно значить одно и то же на приёмке
 *    и в заявке. Телефон — в `lib/phone` (`PHONE_MAX_LENGTH`).
 * 2. Линтер (`eslint.config.js`) не пропускает числовое поле без `max` или
 *    `maxLength` и телефон без `maxLength`. Забыть предел в новом поле нельзя.
 * 3. `installNumberLimits()` — страховка в браузере: `max` у `type="number"`
 *    браузер проверяет только при отправке формы, а набирать даёт что угодно.
 *    Слушатель на документе прижимает набранное к пределу сразу, во всех полях.
 */

export interface Range {
  min: number;
  max: number;
}

export const LIMITS = {
  /** Штуки: товар в приёмке, в задании, в заявке, места хранения. */
  count: { min: 0, max: 99_999 },
  /** Небольшие счётчики объекта: доки, ворота, камеры, места на площадке. */
  small: { min: 0, max: 9_999 },
  /** Год: постройки, основания компании. */
  year: { min: 1900, max: new Date().getFullYear() },
  /** Площадь, м². */
  area: { min: 0, max: 1_000_000 },
  /** Размер в миллиметрах или сантиметрах: ярлык, габарит товара, рампа. */
  size: { min: 0, max: 10_000 },
  /** Размеры плана в метрах, высота. */
  meters: { min: 0, max: 1_000 },
  /** Вес и нагрузка, кг. */
  kg: { min: 0, max: 100_000 },
  /** Деньги, ₽ за единицу. */
  money: { min: 0, max: 10_000_000 },
  /** Проценты и коэффициенты в процентах. */
  percent: { min: 0, max: 100 },
  /** Минуты (перерывы, нормы). */
  minutes: { min: 0, max: 24 * 60 },
} as const satisfies Record<string, Range>;

export type LimitName = keyof typeof LIMITS;

/** Сколько знаков вмещает предел — `maxLength` для текстовых числовых полей. */
export function digitsFor(name: LimitName): number {
  return String(LIMITS[name].max).length;
}

/** Число в пределе или `undefined`, если вне его. Пустое — не ноль. */
export function withinLimit(value: number | undefined, name: LimitName): number | undefined {
  if (value === undefined || Number.isNaN(value)) return undefined;
  const { min, max } = LIMITS[name];
  return value < min || value > max ? undefined : value;
}

/**
 * Прижать набранное к пределу поля. Возвращает новое значение или `null`,
 * если поле в пределе. Отдельно от слушателя, чтобы проверять без DOM.
 */
export function overLimit(raw: string, min: string, max: string): string | null {
  if (raw === "" || max === "") return null;
  const n = Number(raw);
  if (Number.isNaN(n)) return null;
  if (n > Number(max)) return max;
  // Нижний предел — только для отрицательных: «1» на пути к «1987» в поле
  // года не трогаем, а минус в счётчике штук — всегда опечатка.
  const lo = min === "" ? -Infinity : Number(min);
  if (n < 0 && n < lo) return min;
  return null;
}

// Присвоение через родной сеттер, а не `input.value = …`: так React замечает
// правку и вызывает onChange — состояние экрана не расходится с полем.
function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

let installed = false;

/** Подключить страховку пределов на весь документ. Повторный вызов ничего не делает. */
export function installNumberLimits(doc: Document = document): void {
  if (installed) return;
  installed = true;
  doc.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "number") return;
      const next = overLimit(el.value, el.min, el.max);
      if (next !== null) setNativeValue(el, next);
    },
    { capture: true },
  );
}
