/**
 * Применение правок из таблицы текстов (`export.mjs`) обратно в код.
 *
 *   npm run texts:apply -- ~/Downloads/uklad-texts.xlsx
 *   npm run texts:apply -- файл.xlsx --dry   → только отчёт, файлы не трогаем
 *
 * Берутся строки, где заполнен «Новый текст» или «Новый English». Каждая
 * правка сверяется: текст «Сейчас» в таблице должен совпадать с кодом, иначе
 * строку за это время уже поменяли — такая правка пропускается и попадает в
 * отчёт. Подстановки `{n}` и `${…}` обязаны остаться теми же. Комментарии без
 * нового текста выводятся списком — их разбирает сессия.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import XLSX from "xlsx";
import { ROOT, collect, placeholders } from "./collect.mjs";
import { SHEETS } from "./sheet.mjs";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Укажите файл: npm run texts:apply -- путь/к/uklad-texts.xlsx");
  process.exit(1);
}

// `XLSX.read` по байтам, а не `readFile`: сборке xlsx для ESM файловая система не подключена.
const book = XLSX.read(fs.readFileSync(path.resolve(file)));
const { rows } = collect();
const byId = new Map(rows.map((r) => [r.id, r]));

const edits = new Map(); // файл → [{ start, end, text }]
const problems = [];
const comments = [];
const enStale = [];
let applied = 0;

const norm = (s) => String(s ?? "").replace(/\r\n/g, "\n");
const same = (a, b) => norm(a).trim() === norm(b).trim();

/** Литерал в исходном виде — тем же типом кавычек, что был в коде. */
function encode(target, text, fileText) {
  const keepNbsp = fileText.slice(target.start, target.end).includes("\\u00a0");
  const nb = (s) => (keepNbsp ? s.replace(/\u00a0/g, "\\u00a0") : s);
  const body = JSON.stringify(text).slice(1, -1);
  if (target.quote === '"') return nb(`"${body}"`);
  if (target.quote === "'") return nb(`'${body.replace(/\\"/g, '"').replace(/'/g, "\\'")}'`);
  if (target.quote === "`") {
    return nb(`\`${text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``);
  }
  return null;
}

/** Правка одного литерала: проверки и место в очереди файла. */
function plan(row, target, now, next, label) {
  const skip = (why) => problems.push(`${row.id}: ${label} — ${why}`);
  if (!target) return skip("в коде нет пары, правка не применена");
  if (!same(target.text, now)) return skip(`в коде уже другой текст («${target.text}»), пропущено`);
  if (placeholders(now) !== placeholders(next))
    return skip(`подстановки {…} не совпадают («${next}»), пропущено`);
  const fileText = fs.readFileSync(path.join(ROOT, row.file), "utf8");
  let out;
  if (row.kind === "jsx") {
    if (/[{}<>]/.test(next)) return skip("в этом тексте нельзя { } < >");
    const raw = fileText.slice(target.start, target.end);
    out = raw.replace(raw.trim(), next);
  } else if (row.kind === "template") {
    const subs = (s) => (s.match(/\$\{[^}]*\}/g) ?? []).join("|");
    if (subs(now) !== subs(next)) return skip("${…} должны остаться прежними, пропущено");
    if (next.includes("`")) return skip("в этом тексте нельзя обратную кавычку");
    out = `\`${next}\``;
  } else {
    out = encode(target, next, fileText);
  }
  if (out == null) return skip("не удалось записать литерал");
  const list = edits.get(row.file) ?? [];
  list.push({ start: target.start, end: target.end, text: out });
  edits.set(row.file, list);
  applied++;
}

/** Строка таблицы → строка кода: по ID, а если код сдвинулся — по тексту в том же файле. */
function locate(id, now) {
  const hit = byId.get(id);
  if (hit && same(hit.ru.text, now)) return hit;
  const fileOf = hit?.file ?? id.split("#")[0];
  const found = rows.filter((r) => r.file === fileOf && same(r.ru.text, now));
  return found.length === 1 ? found[0] : (hit ?? null);
}

for (const [name] of SHEETS) {
  const ws = book.Sheets[name];
  if (!ws) continue;
  for (const x of XLSX.utils.sheet_to_json(ws, { defval: "" })) {
    const id = String(x["ID"]).trim();
    const nextRu = norm(x["Новый текст"]).trim();
    const nextEn = norm(x["Новый English"]).trim();
    const note = norm(x["Комментарий"]).trim();
    if (note) comments.push(`${id} «${x["Сейчас"]}»: ${note}${nextRu ? ` → «${nextRu}»` : ""}`);
    if (!nextRu && !nextEn) continue;
    const row = locate(id, x["Сейчас"]);
    if (!row) {
      problems.push(`${id}: строка не найдена в коде — пропущено`);
      continue;
    }
    if (nextRu && !same(nextRu, row.ru.text)) plan(row, row.ru, x["Сейчас"], nextRu, "русский");
    if (nextEn) plan(row, row.en, x["English"], nextEn, "английский");
    else if (nextRu && row.en) enStale.push(`${row.id}: «${nextRu}» — en: «${row.en.text}»`);
  }
}

if (!dry) {
  const touched = [];
  for (const [rel, list] of edits) {
    const abs = path.join(ROOT, rel);
    let text = fs.readFileSync(abs, "utf8");
    // С конца файла к началу — позиции ещё не тронутых правок не сдвигаются.
    for (const e of list.sort((a, b) => b.start - a.start)) {
      text = text.slice(0, e.start) + e.text + text.slice(e.end);
    }
    fs.writeFileSync(abs, text);
    touched.push(abs);
  }
  if (touched.length) {
    execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...touched], {
      stdio: "inherit",
    });
  }
}

const report = (title, list) =>
  list.length && console.log(`\n${title} (${list.length}):\n  ${list.join("\n  ")}`);
console.log(
  `${dry ? "Проверка без записи" : "Применено"}: ${applied} правок в ${edits.size} файлах.`,
);
report("Не применено", problems);
report("Русский поменялся, английский — нет (проверить перевод)", enStale);
report("Комментарии", comments);
if (problems.length) process.exitCode = 2;
