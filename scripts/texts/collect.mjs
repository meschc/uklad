/**
 * Сбор всех текстов интерфейса из исходников — общая часть выгрузки
 * (`export.mjs`) и применения правок (`apply.mjs`).
 *
 * Читаем исходники компилятором TypeScript, а не регулярками: так строка в
 * комментарии не попадёт в таблицу, а позиция литерала известна точно — по
 * ней правка и возвращается в файл.
 *
 * Виды текстов:
 *  - `dict`   — словарь кабинета `src/lib/i18n/*.ts` (`ru` и `en`, ключ → строка);
 *  - `copy`   — пары сайта `c("рус", "eng")` и `ru("рус")` (`src/site`);
 *  - `plural` — формы числа `t.plural(n, ["ячейка", …], ["cell", …])`;
 *  - `raw` / `jsx` / `template` — русский текст, зашитый в код мимо словаря.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CYR = /[А-Яа-яЁё]/;

/** Человеческие названия файлов словаря — колонка «Раздел». */
const DICT_SECTIONS = {
  common: "Общее",
  editor: "План склада",
  goods: "Номенклатура",
  warehouse: "Склад",
  fulfillment: "Фулфилмент",
  orders: "Заказы",
  documents: "Документы",
  subscription: "Тариф и оплата",
  workstation: "Рабочее место",
  operations: "Операции",
  support: "Поддержка",
  journal: "Журнал",
};

/**
 * Не интерфейс: тесты, посев демо (выдуманные товары и люди), сам словарь и
 * помощник пар сайта — их русский текст в таблицу правки не идёт.
 */
const SKIP = [
  /__tests__\//,
  /\.test\.tsx?$/,
  /^src\/lib\/i18n\//,
  /^src\/lib\/store\/seed/,
  /^src\/site\/lib\/copy\.ts$/,
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

function parse(abs) {
  const text = fs.readFileSync(abs, "utf8");
  const kind = abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind);
}

const isStr = (n) => !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));

/** Литерал и его место в файле: по `start`/`end` правка ложится обратно. */
function lit(sf, node) {
  const start = node.getStart(sf);
  return {
    text: node.text,
    start,
    end: node.getEnd(),
    line: sf.getLineAndCharacterOfPosition(start).line + 1,
    quote: ts.isNoSubstitutionTemplateLiteral(node) ? "`" : sf.text[start],
  };
}

/** Ближайший заголовок-комментарий `// Таблица товаров` над свойством словаря. */
function headingOf(sf, prop) {
  const ranges = ts.getLeadingCommentRanges(sf.text, prop.getFullStart()) ?? [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    if (r.kind !== ts.SyntaxKind.SingleLineCommentTrivia) continue;
    const s = sf.text.slice(r.pos + 2, r.end).trim();
    if (s && s.length <= 60) return s;
  }
  return null;
}

function dictObject(sf, name) {
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== name || !d.initializer) continue;
      let init = d.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      if (ts.isObjectLiteralExpression(init)) return init;
    }
  }
  return null;
}

function propName(p) {
  if (!ts.isPropertyAssignment(p)) return null;
  const n = p.name;
  return ts.isStringLiteral(n) || ts.isIdentifier(n) ? n.text : null;
}

/** Словарь кабинета: одна строка на ключ, русский и английский рядом. */
function collectDict(rows, skipped) {
  const dir = path.join(ROOT, "src/lib/i18n");
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".ts") || name === "index.ts") continue;
    const rel = `src/lib/i18n/${name}`;
    const sf = parse(path.join(dir, name));
    const ru = dictObject(sf, "ru");
    const en = dictObject(sf, "en");
    if (!ru) continue;
    const enMap = new Map();
    for (const p of en?.properties ?? []) {
      const k = propName(p);
      if (k && isStr(p.initializer)) enMap.set(k, lit(sf, p.initializer));
    }
    const base = DICT_SECTIONS[name.replace(/\.ts$/, "")] ?? name;
    let heading = null;
    for (const p of ru.properties) {
      const k = propName(p);
      if (!k) continue;
      heading = headingOf(sf, p) ?? heading;
      if (!isStr(p.initializer)) {
        skipped.push(`${rel}: ключ ${k} — не простая строка`);
        continue;
      }
      rows.push({
        sheet: "cabinet",
        kind: "dict",
        id: k,
        file: rel,
        section: heading ? `${base} · ${heading}` : base,
        ru: lit(sf, p.initializer),
        en: enMap.get(k) ?? null,
      });
    }
  }
}

/** Раздел по файлу: `src/site/components/PricingScreen.tsx` → `PricingScreen`. */
function sectionOf(rel) {
  const site = rel.startsWith("src/site/");
  const tail = rel
    .replace(/^src\/(site\/)?/, "")
    .replace(/\.tsx?$/, "")
    .split("/")
    .filter(
      (p) => !(site && (p === "components" || p === "data" || p === "lib")) && p !== "components",
    );
  return tail.join(" / ");
}

/** Не подпись: путь импорта, тип-литерал, сообщение в консоль разработчика. */
function isImportOrType(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p))
    return true;
  const callee = ts.isCallExpression(p) ? p.expression : null;
  return (
    !!callee &&
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "console"
  );
}

/** Все исходники: пары сайта, формы числа и зашитый мимо словаря текст. */
function collectSource(rows) {
  for (const abs of walk(path.join(ROOT, "src")).sort()) {
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    if (SKIP.some((re) => re.test(rel))) continue;
    const site = rel.startsWith("src/site/");
    const sheet = site ? "site" : "cabinet";
    const section = sectionOf(rel);
    const sf = parse(abs);
    const taken = new Set();
    let n = 0;
    const push = (row) => rows.push({ file: rel, ...row, id: `${rel}#${++n}` });
    const visit = (node) => {
      if (
        site &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "c" || node.expression.text === "ru") &&
        isStr(node.arguments[0])
      ) {
        const [a, b] = node.arguments;
        const only = node.expression.text === "ru";
        push({
          sheet,
          kind: "copy",
          section,
          ru: lit(sf, a),
          en: !only && isStr(b) ? lit(sf, b) : null,
          ruOnly: only,
        });
        taken.add(a);
        if (b) taken.add(b);
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "plural"
      ) {
        const [, ruArr, enArr] = node.arguments;
        if (ruArr && ts.isArrayLiteralExpression(ruArr) && ruArr.elements.every(isStr)) {
          const enEls = enArr && ts.isArrayLiteralExpression(enArr) ? enArr.elements : [];
          ruArr.elements.forEach((el, i) => {
            const enEl = i < 2 ? enEls[i] : null;
            push({
              sheet,
              kind: "plural",
              section: `${section} · формы числа`,
              ru: lit(sf, el),
              en: isStr(enEl) ? lit(sf, enEl) : null,
            });
            taken.add(el);
          });
          enEls.forEach((el) => taken.add(el));
        }
      }
      if (!taken.has(node)) {
        if (isStr(node) && CYR.test(node.text) && !isImportOrType(node)) {
          push({ sheet: "raw", kind: "raw", section, ru: lit(sf, node), en: null });
        } else if (ts.isJsxText(node) && CYR.test(node.text) && node.text.trim()) {
          const start = node.getStart(sf);
          const line = sf.getLineAndCharacterOfPosition(start).line + 1;
          push({
            sheet: "raw",
            kind: "jsx",
            section,
            ru: { text: node.text.trim(), start, end: node.getEnd(), line, quote: "" },
            en: null,
          });
        } else if (ts.isTemplateExpression(node) && CYR.test(node.getText(sf))) {
          const l = lit(sf, node);
          push({
            sheet: "raw",
            kind: "template",
            section,
            ru: { ...l, text: node.getText(sf).slice(1, -1) },
            en: null,
            readOnly: true,
          });
          return; // части шаблона уже в этой строке
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

/** Все тексты: `{ rows, skipped }`. `rows[i].ru/en` — литерал с позицией. */
export function collect() {
  const rows = [];
  const skipped = [];
  collectDict(rows, skipped);
  collectSource(rows);
  return { rows, skipped };
}

/** Подстановки `{n}`, `{name}` — в новом тексте их набор должен совпасть. */
export function placeholders(s) {
  return (s.match(/\{[a-zA-Z_]\w*\}/g) ?? []).sort().join(",");
}
