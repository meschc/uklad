import { describe, expect, test } from "vitest";
import { formatPrice, parsePrice } from "@/lib/priceText";

/** Кирилл 22.11: тысячи пробелом, два знака после запятой, не больше 99 999,99. */
describe("Цена услуги", () => {
  test("тысячи через пробел, копейки через запятую, не больше двух знаков", () => {
    expect(formatPrice("12500")).toBe("12 500");
    expect(formatPrice("1500.555")).toBe("1 500,55");
    expect(formatPrice("abc9,9")).toBe("9,9");
    expect(formatPrice(",5")).toBe("0,5");
  });
  test("больше пяти цифр не набрать, разбор возвращает число или пусто", () => {
    expect(formatPrice("10000000")).toBe("10 000");
    expect(parsePrice("99 999,99")).toBe(99999.99);
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("0")).toBe(0);
  });
});
