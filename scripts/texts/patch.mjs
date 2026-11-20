/**
 * Перенос правок текстов в исходники — общий для таблицы (`apply.mjs`) и
 * страницы правки (`editor.mjs`).
 *
 * Правка — `{ id, now, en, nextRu, nextEn }`: что было по-русски и
 * по-английски, когда человек открыл строку, и что он написал. Каждая
 * сверяется с кодом: если строку за это время поменяли, правка пропускается.
 * Подстановки `{n}` и `${…}` обязаны остаться теми же.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, collect, placeholders } from "./collect.mjs";

const norm = (s) =>
  String(s ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
const same = (a, b) => norm(a) === norm(b);

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

/** Готовый литерал для строки кода или причина, почему правку не взять. */
function literalFor(row, target, now, next) {
  if (!target) return { why: "в коде нет пары" };
  if (!same(target.text, now)) return { why: `в коде уже другой текст («${target.text}»)` };
  if (placeholders(now) !== placeholders(next)) {
    return { why: `подстановки {…} должны остаться теми же («${next}»)` };
  }
  const fileText = fs.readFileSync(path.join(ROOT, row.file), "utf8");
  if (row.kind === "jsx") {
    if (/[{}<>]/.test(next)) return { why: "в этом тексте нельзя { } < >" };
    const raw = fileText.slice(target.start, target.end);
    return { text: raw.replace(raw.trim(), next) };
  }
  if (row.kind === "template") {
    const subs = (s) => (s.match(/\$\{[^}]*\}/g) ?? []).join("|");
    if (subs(now) !== subs(next)) return { why: "${…} должны остаться прежними" };
    if (next.includes("`")) return { why: "в этом тексте нельзя обратную кавычку" };
    return { text: `\`${next}\`` };
  }
  const text = encode(target, next, fileText);
  return text == null ? { why: "не удалось записать литерал" } : { text };
}

function writeEdits(edits) {
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
  execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...touched], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

/**
 * Применить правки. `dry` — только проверить. Отчёт:
 * `{ applied, files, problems, enStale }`, файлы — пути от корня репо.
 */
export function applyEdits(items, { dry = false } = {}) {
  const { rows } = collect();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const edits = new Map(); // файл → [{ start, end, text }]
  const problems = [];
  const enStale = [];
  let applied = 0;

  /** По ID, а если код сдвинулся — по тексту в том же файле. */
  const locate = (id, now) => {
    const hit = byId.get(id);
    if (hit && same(hit.ru.text, now)) return hit;
    const fileOf = hit?.file ?? id.split("#")[0];
    const found = rows.filter((r) => r.file === fileOf && same(r.ru.text, now));
    return found.length === 1 ? found[0] : (hit ?? null);
  };

  const plan = (row, target, now, next, label) => {
    const lit = literalFor(row, target, now, next);
    if (lit.why) return problems.push(`${row.id}: ${label} — ${lit.why}`);
    const list = edits.get(row.file) ?? [];
    list.push({ start: target.start, end: target.end, text: lit.text });
    edits.set(row.file, list);
    applied++;
  };

  for (const it of items) {
    const nextRu = norm(it.nextRu);
    const nextEn = norm(it.nextEn);
    if (!nextRu && !nextEn) continue;
    const row = locate(String(it.id).trim(), it.now);
    if (!row) {
      problems.push(`${it.id}: строка не найдена в коде`);
      continue;
    }
    if (nextRu && !same(nextRu, row.ru.text)) plan(row, row.ru, it.now, nextRu, "русский");
    if (nextEn && !same(nextEn, row.en?.text)) plan(row, row.en, it.en, nextEn, "английский");
    else if (nextRu && !nextEn && row.en) {
      enStale.push(`${row.id}: «${nextRu}» — en: «${row.en.text}»`);
    }
  }

  if (!dry && edits.size) writeEdits(edits);
  return { applied, files: [...edits.keys()], problems, enStale };
}
