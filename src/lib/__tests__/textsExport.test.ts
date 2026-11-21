import { describe, expect, test, vi } from "vitest";

// Как в `i18n.test.ts`: словарь тянет стор, а он здесь не нужен.
vi.mock("../store", () => ({ useEditor: () => "ru" }));

import { messages, type MsgKey } from "../i18n";
import { collect } from "../../../scripts/texts/collect.mjs";

/**
 * Выгрузка текстов для правки (`npm run texts:export`) читает словарь
 * компилятором, а не через сам модуль. Если ключ записан не простой строкой
 * (склейкой, вызовом), выгрузка его молча не увидит, и правка формулировки до
 * него не дойдёт. Этот тест держит выгрузку полной.
 */
describe("выгрузка текстов", () => {
  const { rows, skipped } = collect();
  const dict = new Map(rows.filter((r) => r.kind === "dict").map((r) => [r.id, r]));

  test("каждый ключ словаря кабинета есть в выгрузке с тем же текстом", () => {
    expect(skipped).toEqual([]);
    for (const key of Object.keys(messages.ru) as MsgKey[]) {
      const row = dict.get(key);
      expect(row?.ru.text, key).toBe(messages.ru[key]);
      expect(row?.en?.text, key).toBe(messages.en[key]);
    }
  });

  test("пары сайта c(…) попали в выгрузку", () => {
    expect(rows.filter((r) => r.kind === "copy").length).toBeGreaterThan(500);
  });
});
