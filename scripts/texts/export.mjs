/**
 * Выгрузка всех текстов кабинета и сайта в одну таблицу Excel — чтобы
 * формулировки правил человек, а не сессия Claude по одной строке.
 *
 *   npm run texts:export                → texts/uklad-texts.xlsx
 *   npm run texts:export -- путь.xlsx   → в указанный файл
 *
 * В таблице колонка «Новый текст» пустая: её заполняют, файл возвращают, и
 * `npm run texts:apply -- файл.xlsx` переносит правки в код (см. apply.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { ROOT, collect } from "./collect.mjs";
import { HEAD, SHEETS, isNoise } from "./sheet.mjs";

const out = path.resolve(process.argv[2] ?? path.join(ROOT, "texts/uklad-texts.xlsx"));
const { rows, skipped } = collect();

const WHERE = {
  dict: "словарь",
  copy: "словарь",
  plural: "формы числа",
  raw: "в коде",
  jsx: "в коде",
  template: "в коде, с подстановкой",
};

function toRow(r) {
  const en = r.en?.text ?? (r.ruOnly ? "(только по-русски)" : "");
  return [r.section, r.ru.text, "", "", en, "", WHERE[r.kind], r.id];
}

const book = XLSX.utils.book_new();
const counts = {};
for (const [name, pick] of SHEETS) {
  const list = rows.filter((r) => pick(r) && !isNoise(r));
  // Порядок: раздел, затем как в файле — соседние подписи экрана рядом.
  list.sort(
    (a, b) =>
      a.section.localeCompare(b.section, "ru") || a.file.localeCompare(b.file) || a.ru.start - b.ru.start,
  );
  counts[name] = {
    total: list.length,
    raw: list.filter((r) => WHERE[r.kind].startsWith("в коде")).length,
  };
  const ws = XLSX.utils.aoa_to_sheet([HEAD, ...list.map(toRow)]);
  ws["!cols"] = [34, 60, 60, 30, 45, 30, 14, 28].map((wch) => ({ wch }));
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: list.length, c: HEAD.length - 1 } }),
  };
  XLSX.utils.book_append_sheet(book, ws, name);
}

const date = new Date().toISOString().slice(0, 10);
const help = [
  ["Как править тексты Уклада"],
  [`Выгружено ${date} из main. Кабинет: ${counts["Кабинет"].total} строк, сайт: ${counts["Сайт"].total}.`],
  [""],
  ["1. Ищите текст фильтром по колонке «Раздел» или поиском (Cmd+F)."],
  ["2. Новую формулировку пишите в «Новый текст». Пустая ячейка — строка остаётся как есть."],
  ["3. Не знаете, как сказать лучше, — напишите мысль в «Комментарий», без нового текста."],
  ["4. {n}, {name} и ${…} — сюда программа подставит число или название. Оставьте их в новом тексте."],
  ["5. «Формы числа» — три формы одного слова: 1 ячейка, 2 ячейки, 5 ячеек. Правьте все три вместе."],
  ["6. English можно не трогать: где русский поменялся, а английский нет, сессия поправит перевод сама."],
  ["7. Колонки «Где» и «ID» не меняйте — по ним правка находит своё место в коде."],
  ["8. Сохраните файл (xlsx) и пришлите его в тред. Одна сессия перенесёт все правки одним PR."],
  [""],
  ["«в коде» — текст лежит прямо в компоненте, мимо словаря. Править его можно так же."],
];
const hs = XLSX.utils.aoa_to_sheet(help);
hs["!cols"] = [{ wch: 110 }];
XLSX.utils.book_append_sheet(book, hs, "Как править");
book.SheetNames.unshift(book.SheetNames.pop()); // инструкция — первым листом

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }));

console.log(`Тексты выгружены: ${path.relative(process.cwd(), out) || out}`);
for (const [name, c] of Object.entries(counts)) {
  const share = c.total ? Math.round((100 * (c.total - c.raw)) / c.total) : 100;
  console.log(`  ${name}: ${c.total} строк, в словаре ${share}%, в коде ${c.raw}`);
}
if (skipped.length) console.log(`Пропущено (не простая строка): ${skipped.length}\n  ${skipped.join("\n  ")}`);
