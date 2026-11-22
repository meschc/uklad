import { describe, expect, test } from "vitest";
import { messages } from "../i18n";

/**
 * Обход столов 15.11: «{name} разрешил» — мужской род про любого человека.
 * Глагол прошедшего времени рядом с именем сотрудника пишет род за него;
 * пишем безлично: «Разрешение: {name}».
 */
describe("Тексты не угадывают род по имени", () => {
  test("нет «{name} разрешил» и «разрешил {name}»", () => {
    const bad = Object.entries(messages.ru).filter(([, v]) =>
      /\{(name|who)\}\s+разрешил|разрешил\s+\{(name|who)\}/.test(v),
    );
    expect(bad.map(([k]) => k)).toEqual([]);
  });
});
