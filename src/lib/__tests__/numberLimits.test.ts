import { describe, expect, it } from "vitest";
import { digitsFor, LIMITS, overLimit, withinLimit } from "../numberLimits";
import { formatPhone, PHONE_MAX_LENGTH } from "../phone";

/**
 * Пределы чисел (Кирилл 12 ноя: «уже не в первый раз»): 34223413242134 камер
 * и бесконечный телефон не должны набираться ни в одном поле.
 */
describe("пределы чисел", () => {
  it("прижимает набранное сверх предела к границе", () => {
    expect(overLimit("34223413242134", "0", String(LIMITS.small.max))).toBe("9999");
    expect(overLimit("-5", "0", "100")).toBe("0");
  });

  it("не трогает значение в пределе и недонабранный год", () => {
    expect(overLimit("12", "0", "9999")).toBeNull();
    // «1» по пути к «1987» меньше 1900, но это ещё не ошибка.
    expect(overLimit("1", "1900", String(LIMITS.year.max))).toBeNull();
    expect(overLimit("", "0", "10")).toBeNull();
  });

  it("год постройки не бывает в будущем", () => {
    expect(withinLimit(LIMITS.year.max + 1, "year")).toBeUndefined();
    expect(withinLimit(1987, "year")).toBe(1987);
  });

  it("знает длину предела для текстовых полей", () => {
    expect(digitsFor("small")).toBe(4);
    expect(digitsFor("count")).toBe(5);
  });
});

describe("телефон", () => {
  it("не растёт бесконечно", () => {
    const long = formatPhone("1".repeat(40));
    expect(long.replace(/\D/g, "").length).toBeLessThanOrEqual(15);
    expect(long.length).toBeLessThanOrEqual(PHONE_MAX_LENGTH);
  });

  it("российский номер форматирует как раньше", () => {
    expect(formatPhone("89001234567")).toBe("+7 900 123-45-67");
  });
});
