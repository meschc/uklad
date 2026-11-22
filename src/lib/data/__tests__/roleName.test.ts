import { describe, expect, it } from "vitest";
import { roleNameOk } from "../teamRepository";

// Кирилл 22.11: «в роли почему-то можно ввести числа, а так не должно быть».
describe("название роли", () => {
  it("слова, дефис, косая черта и скобки — можно", () => {
    for (const name of ["Кладовщик / оператор", "Старший смены", "Мастер (ночь)", "Pick-lead"])
      expect(roleNameOk(name), name).toBe(true);
  });
  it("цифры, значки и пустое — нельзя", () => {
    for (const name of ["Роль 1", "123", "Склад№", "  ", "---"])
      expect(roleNameOk(name), name).toBe(false);
  });
});
