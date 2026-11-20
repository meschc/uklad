/**
 * Устройство таблицы текстов — одно на выгрузку и на применение правок:
 * колонки, листы и что в таблицу не попадает.
 */

/** Колонки листа. Применение ищет их по названию, а не по номеру. */
export const HEAD = ["Раздел", "Сейчас", "Новый текст", "Комментарий", "English", "Новый English", "Где", "ID"];

/** Листы и какие строки на них. */
export const SHEETS = [
  ["Кабинет", (r) => r.sheet === "cabinet" || (r.sheet === "raw" && !r.file.startsWith("src/site/"))],
  ["Сайт", (r) => r.sheet === "site" || (r.sheet === "raw" && r.file.startsWith("src/site/"))],
];

/**
 * Русский текст в коде, который не интерфейс: каталог образцов товаров,
 * словари типографики, раскладка клавиатуры, распознавание колонок импорта
 * (строчные «артикул», «шк»), журнал разработчика `[uklad] …`. Правка таких
 * строк ломает поведение, а не формулировку, — в таблицу их не выносим.
 */
const NOISE_FILES = [
  /^src\/lib\/catalog\.ts$/,
  /^src\/site\/lib\/typography\.ts$/,
  /^src\/lib\/emailTyping\.ts$/,
  /^src\/components\/chat\/chatFormat\.ts$/,
  /^src\/lib\/chat\.ts$/,
  /^src\/site\/data\/cities\.ts$/,
  /^src\/site\/lib\/suggestPath\.ts$/,
  /^src\/lib\/silentPrint\.ts$/,
];

export function isNoise(r) {
  if (r.sheet !== "raw") return false;
  if (NOISE_FILES.some((re) => re.test(r.file))) return true;
  const s = r.ru.text.trim();
  if (/^\[[\w-]+\]/.test(s)) return true; // журнал разработчика
  // Строчное слово в логике (не в компоненте) — ключ распознавания, а не подпись.
  if (!r.file.includes("/components/") && s === s.toLowerCase() && s.length <= 24) return true;
  return false;
}
