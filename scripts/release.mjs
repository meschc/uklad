/**
 * Версия продукта и записи истории изменений — без правок в PR.
 *
 * Каждый PR с заметной снаружи правкой кладёт ОДИН новый файл в `changes/`
 * (имя — любое уникальное, например `2026-11-21-bank-po-bik.md`). Версия не
 * хранится числом: это база из `package.json` плюс число файлов в `changes/`.
 * Влили PR с записью — версия выросла на единицу сама, и двум PR нечего делить:
 * разные файлы не конфликтуют. Тот же счёт делает кабинет при сборке
 * (`src/lib/version.ts`), поэтому staging и демо показывают версию сразу.
 *
 *   node scripts/release.mjs version            — текущая версия
 *   node scripts/release.mjs notes <от> <до>    — текст записей, добавленных
 *                                                между двумя коммитами
 *   node scripts/release.mjs check <база>       — проверка PR против базы:
 *     версию в package.json не трогали, в CHANGELOG.md не появилось новых
 *     разделов `## [`, записи из changes/ не удаляли, каждая запись по форме.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const DIR = "changes";
/** Заголовки разделов Keep a Changelog, которыми может начинаться запись. */
const SECTIONS = ["Добавлено", "Изменено", "Исправлено", "Убрано", "Безопасность"];

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

/** Файлы записей; README папки — описание формата, а не запись. */
export function entryFiles(names) {
  return names.filter((n) => n.endsWith(".md") && n !== "README.md").sort();
}

/** База `0.9.14` + 3 записи → `0.9.17`. */
export function versionFrom(base, count) {
  const [major, minor, patch] = base.split(".").map(Number);
  return `${major}.${minor}.${patch + count}`;
}

/** Что не так с записью; пустой список — запись годится. */
export function entryProblems(text) {
  const problems = [];
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return ["пустая запись"];
  const first = lines[0].match(/^### (.+)$/);
  if (!first || !SECTIONS.includes(first[1].trim())) {
    problems.push(`первая строка — «### ${SECTIONS.join(" | ")}»`);
  }
  for (const l of lines) {
    const h = l.match(/^#{1,6} (.+)$/);
    if (h && !(l.startsWith("### ") && SECTIONS.includes(h[1].trim()))) {
      problems.push(`лишний заголовок «${l}»: в записи только «### Раздел»`);
    }
  }
  if (!lines.some((l) => l.startsWith("- "))) problems.push("нет ни одного пункта «- …»");
  return problems;
}

function baseVersion(ref) {
  const raw = ref ? git("show", `${ref}:package.json`) : readFileSync("package.json", "utf8");
  return JSON.parse(raw).version;
}

function currentVersion() {
  return versionFrom(baseVersion(), entryFiles(readdirSync(DIR)).length);
}

/** Записи, добавленные между коммитами, сведённые по разделам. */
function notes(from, to) {
  const added = git("diff", "--name-only", "--diff-filter=A", from, to, "--", `${DIR}/`)
    .split("\n")
    .map((p) => p.replace(`${DIR}/`, ""));
  const bySection = new Map();
  for (const name of entryFiles(added)) {
    let section = null;
    for (const line of git("show", `${to}:${DIR}/${name}`).split("\n")) {
      const h = line.match(/^### (.+)$/);
      if (h) section = h[1].trim();
      else if (section && line.trim() !== "") {
        bySection.set(section, [...(bySection.get(section) ?? []), line]);
      }
    }
  }
  return SECTIONS.filter((s) => bySection.has(s))
    .map((s) => `### ${s}\n\n${bySection.get(s).join("\n")}\n`)
    .join("\n");
}

function check(base) {
  const errors = [];
  if (baseVersion(base) !== baseVersion()) {
    errors.push(
      "package.json: версию в PR не меняют — она считается сама (CLAUDE.md, «Версия продукта»).",
    );
  }
  const changelog = git("diff", base, "--", "CHANGELOG.md");
  if (changelog.split("\n").some((l) => l.startsWith("+## ["))) {
    errors.push(
      `CHANGELOG.md: новый раздел версии в PR не пишут — запись кладут файлом в ${DIR}/.`,
    );
  }
  const removed = git("diff", "--name-only", "--diff-filter=DR", base, "--", `${DIR}/`).trim();
  if (removed)
    errors.push(
      `${DIR}/: записи не удаляют и не переименовывают (на них стоит счёт версии): ${removed}`,
    );
  for (const name of entryFiles(readdirSync(DIR))) {
    for (const p of entryProblems(readFileSync(`${DIR}/${name}`, "utf8"))) {
      errors.push(`${DIR}/${name}: ${p}`);
    }
  }
  for (const e of errors) console.error(`::error::${e}`);
  if (errors.length) process.exit(1);
  console.log(`Версия после вливания: ${currentVersion()}`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "version") console.log(currentVersion());
else if (cmd === "notes") process.stdout.write(notes(a, b));
else if (cmd === "check") check(a);
else if (cmd !== undefined) {
  console.error("Команды: version | notes <от> <до> | check <база>");
  process.exit(2);
}
