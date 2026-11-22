import { describe, expect, it } from "vitest";
import { roleForPosition, suggestRoleId } from "../positionRole";

describe("роль по должности", () => {
  it("узнаёт должности справочника и введённые руками", () => {
    expect(roleForPosition("Старший смены")).toBe("Старший смены");
    expect(roleForPosition("старший кладовщик")).toBe("Старший смены");
    expect(roleForPosition("Начальник смены")).toBe("Старший смены");
    expect(roleForPosition("Управляющий складом")).toBe("Начальник склада");
    expect(roleForPosition("Старший участка")).toBe("Старший участка");
    expect(roleForPosition("Оператор приёмки")).toBe("Кладовщик / оператор");
    expect(roleForPosition("Комплектовщик")).toBe("Кладовщик / оператор");
    expect(roleForPosition("Упаковщик")).toBe("Кладовщик / оператор");
    expect(roleForPosition("Кладовщик")).toBe("Кладовщик / оператор");
    expect(roleForPosition("Бухгалтер")).toBeNull();
    expect(roleForPosition("")).toBeNull();
  });

  it("предлагает только стандартную роль компании", () => {
    const roles = [
      { id: "own", name: "Старший смены", builtIn: false },
      { id: "std", name: "Старший смены", builtIn: true },
    ];
    expect(suggestRoleId("Старший смены", roles)).toBe("std");
    expect(suggestRoleId("Старший смены", roles.slice(0, 1))).toBeNull();
  });
});
