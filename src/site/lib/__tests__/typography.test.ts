/* eslint-disable no-irregular-whitespace --
 * Тест на неразрывные пробелы — единственное место, где сам символ обязан
 * стоять в исходнике: иначе проверять нечего. См. ту же оговорку в
 * `src/site/lib/typography.ts`.
 */
import { describe, expect, test } from "vitest";
import { glueShortWords } from "../typography";
import { LEGAL_DOCS } from "../../data/legal";
import { WAREHOUSES } from "../../data/warehouses";
import { PLANS } from "../../data/plans";

/**
 * Правило висячих предлогов проверяем на двух уровнях.
 *
 * Сначала на выдуманных строках — там видно, что именно функция считает
 * коротким словом, и заодно зафиксированы случаи, в которых склеивать нельзя.
 * Потом — на настоящих текстах витрины: правило не должно спотыкаться о кавычки,
 * скобки, тире и сокращения, которые в реальных абзацах встречаются вперемешку.
 */

/**
 * Неразрывный пробел (U+00A0) — символом, а не escape-последовательностью:
 * подстановка в шаблон читается лучше, чем ` ` посреди строки. В исходнике
 * он выглядит как обычный пробел, поэтому если его случайно затрут, проверки
 * начнут падать все разом — молча сломаться здесь нельзя.
 */
const NBSP = " ";

describe("Неразрывные пробелы", () => {
  test("однобуквенный предлог не остаётся в конце строки", () => {
    expect(glueShortWords("товар в ячейке")).toBe(`товар в${NBSP}ячейке`);
    expect(glueShortWords("отгрузка с утра")).toBe(`отгрузка с${NBSP}утра`);
  });

  test("двух- и трёхбуквенные предлоги и союзы тоже склеиваются", () => {
    expect(glueShortWords("акт по приёмке")).toBe(`акт по${NBSP}приёмке`);
    expect(glueShortWords("склад для селлера")).toBe(`склад для${NBSP}селлера`);
    expect(glueShortWords("это не ошибка")).toBe(`это не${NBSP}ошибка`);
  });

  test("подряд идущие короткие слова склеиваются каждое", () => {
    expect(glueShortWords("и не в срок")).toBe(`и${NBSP}не${NBSP}в${NBSP}срок`);
  });

  test("короткое слово в конце строки склеивать не с чем", () => {
    expect(glueShortWords("остаток и")).toBe("остаток и");
  });

  test("кавычки и скобки перед предлогом не мешают", () => {
    expect(glueShortWords("«в ячейке»")).toBe(`«в${NBSP}ячейке»`);
    expect(glueShortWords("(на складе)")).toBe(`(на${NBSP}складе)`);
  });

  test("число не отрывается от того, что считает", () => {
    expect(glueShortWords("63 склада")).toBe(`63${NBSP}склада`);
    expect(glueShortWords("42 300 ₽")).toBe(`42${NBSP}300${NBSP}₽`);
  });

  test("тире не начинает строку", () => {
    expect(glueShortWords("склад — это просто")).toBe(`склад${NBSP}— это просто`);
  });

  test("длинные слова остаются как были", () => {
    expect(glueShortWords("приёмка сегодня утром")).toBe("приёмка сегодня утром");
  });

  test("сокращения и аббревиатуры за собой ничего не тянут", () => {
    // «шт» и «WB» короткие, но это не предлоги: склеивать их не за что.
    expect(glueShortWords("420 шт товара")).toBe(`420${NBSP}шт товара`);
    expect(glueShortWords("WB Коледино")).toBe("WB Коледино");
  });

  test("переносы строк и двойные пробелы не трогаем", () => {
    // Их браузер схлопывает сам, а неразрывный пробел на их месте склеил бы
    // строки, которые в разметке специально разнесены.
    expect(glueShortWords("товар в\n  ячейке")).toBe("товар в\n  ячейке");
    expect(glueShortWords("товар в  ячейке")).toBe("товар в  ячейке");
  });

  test("повторный проход ничего не меняет", () => {
    // Наблюдатель за DOM запускает функцию много раз подряд на одном тексте.
    const once = glueShortWords("склад с товаром на 63 площадки");
    expect(glueShortWords(once)).toBe(once);
  });
});

/** Все строки из объекта данных, включая вложенные массивы и записи. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (value && typeof value === "object") {
    Object.values(value).forEach((v) => collectStrings(v, out));
  }
  return out;
}

const COPY = [
  ...collectStrings(LEGAL_DOCS),
  ...collectStrings(WAREHOUSES),
  ...collectStrings(PLANS),
].filter((s) => s.includes(" "));

/** Однобуквенный предлог, за которым остался обычный пробел. */
const HANGING = /(^|[\s(«"„])[вксоуаи] /i;

describe("Тексты витрины", () => {
  test("есть что проверять", () => {
    expect(COPY.length).toBeGreaterThan(100);
  });

  test("после обработки однобуквенных предлогов на весу не остаётся", () => {
    const broken = COPY.map(glueShortWords).filter((s) => HANGING.test(s));
    expect(broken).toEqual([]);
  });
});
