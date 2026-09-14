import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "vitest";
import { translateNoscript } from "../noscript";

/**
 * Перевод блока «здесь нужен JavaScript».
 *
 * Проверять его больше нечем: блок показывается только при выключенных
 * скриптах, а Playwright их выполняет — сквозной тест смотрел бы на пустое
 * место. Поэтому здесь же и главная страховка: настоящий `index.html`
 * переводится целиком, без единого русского слова на выходе.
 */

/** Шаблон, с которым работает предрендер, — настоящий, а не выдуманный. */
const INDEX = readFileSync(join(process.cwd(), "index.html"), "utf8");

/** Блок из разметки страницы — то, что видит человек без скриптов. */
function noscript(html: string): string {
  return /<noscript>[\s\S]*?<\/noscript>/.exec(html)![0];
}

describe("translateNoscript", () => {
  test("русскую страницу не трогает ни на знак", () => {
    // Arrange + Act
    const out = translateNoscript(INDEX, "ru");

    // Assert
    expect(out).toBe(INDEX);
  });

  test("на английской странице в блоке не остаётся кириллицы", () => {
    // Arrange + Act
    const out = noscript(translateNoscript(INDEX, "en"));

    // Assert — самый честный вид проверки: правку русского текста в разметке
    // без правки перевода этот тест поймает, а перечисление фраз — нет.
    expect(out).not.toMatch(/[А-Яа-яЁё]/);
  });

  test("остальная страница остаётся как была", () => {
    // Arrange + Act
    const out = translateNoscript(INDEX, "en");

    // Assert — за пределами блока правок нет: шапку и метатеги правит
    // предрендер, и лезть в них отсюда нечего.
    expect(out.replace(noscript(out), "")).toBe(INDEX.replace(noscript(INDEX), ""));
  });

  test("ссылка на почту внутри абзаца уцелела", () => {
    // Arrange + Act
    const out = noscript(translateNoscript(INDEX, "en"));

    // Assert — без скриптов это единственный способ с нами связаться.
    expect(out).toContain('<a href="mailto:');
  });

  test("перенос строки посреди фразы совпадению не мешает", () => {
    // Arrange — так абзацы и разложены в разметке после Prettier: перенос
    // встаёт там, где кончилась строка, а не там, где кончилась мысль.
    const html = noscript(INDEX).replace("проще написать:", "проще\n          написать:");

    // Act
    const out = translateNoscript(html, "en");

    // Assert
    expect(out).toContain("Easier to write:");
  });

  test("пропавшая фраза роняет сборку, а не уезжает в прод", () => {
    // Arrange — текст в разметке поправили, перевод забыли.
    const html = "<noscript><h1>Нужен JavaScript</h1></noscript>";

    // Act + Assert
    expect(() => translateNoscript(html, "en")).toThrow(/нет фразы/);
  });

  test("страница без блока — тоже поломка сборки", () => {
    // Arrange
    const html = '<html><body><div id="root"></div></body></html>';

    // Act + Assert
    expect(() => translateNoscript(html, "en")).toThrow(/нет блока/);
  });
});
