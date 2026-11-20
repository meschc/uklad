/**
 * Применение правок из таблицы текстов (`export.mjs`) обратно в код.
 *
 *   npm run texts:apply -- ~/Downloads/uklad-texts.xlsx
 *   npm run texts:apply -- файл.xlsx --dry   → только отчёт, файлы не трогаем
 *
 * Берутся строки, где заполнен «Новый текст» или «Новый English». Сверка с
 * кодом и подстановками — в `patch.mjs`. Комментарии без нового текста
 * выводятся списком — их разбирает сессия.
 */
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { SHEETS } from "./sheet.mjs";
import { applyEdits } from "./patch.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Укажите файл: npm run texts:apply -- путь/к/uklad-texts.xlsx");
  process.exit(1);
}

// `XLSX.read` по байтам, а не `readFile`: сборке xlsx для ESM файловая система не подключена.
const book = XLSX.read(fs.readFileSync(path.resolve(file)));
const items = [];
const comments = [];
for (const [name] of SHEETS) {
  const ws = book.Sheets[name];
  if (!ws) continue;
  for (const x of XLSX.utils.sheet_to_json(ws, { defval: "" })) {
    const note = String(x["Комментарий"]).trim();
    if (note) comments.push(`${x["ID"]} «${x["Сейчас"]}»: ${note}`);
    items.push({
      id: x["ID"],
      now: x["Сейчас"],
      en: x["English"],
      nextRu: x["Новый текст"],
      nextEn: x["Новый English"],
    });
  }
}

const { applied, files, problems, enStale } = applyEdits(items, { dry });
const report = (title, list) =>
  list.length && console.log(`\n${title} (${list.length}):\n  ${list.join("\n  ")}`);
console.log(
  `${dry ? "Проверка без записи" : "Применено"}: ${applied} правок в ${files.length} файлах.`,
);
report("Не применено", problems);
report("Русский поменялся, английский — нет (проверить перевод)", enStale);
report("Комментарии", comments);
if (problems.length) process.exitCode = 2;
