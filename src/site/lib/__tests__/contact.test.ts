import { describe, expect, it } from "vitest";
import { contactKind, maskContact } from "../contact";

describe("contactKind", () => {
  it.each([
    ["+7 900 123-45-67", "phone"],
    ["89001234567", "phone"],
    ["9001234567", "phone"],
    ["8 (900) 123-45-67", "phone"],
    ["name@mail.ru", "email"],
    ["i.ivanov@sklad.example.com", "email"],
  ])("%s — %s", (v, kind) => {
    expect(contactKind(v)).toBe(kind);
  });

  it.each(["799423щшоуаыфа", "12345", "+1 202 555 0100", "name@mail", "@mail.ru", "имя", ""])(
    "«%s» не принимается",
    (v) => {
      expect(contactKind(v)).toBeNull();
    },
  );
});

describe("maskContact", () => {
  it("приводит телефон к одному виду по ходу ввода", () => {
    expect(maskContact("8900123")).toBe("+7 900 123");
    expect(maskContact("89001234567")).toBe("+7 900 123-45-67");
    expect(maskContact("900")).toBe("+7 900");
  });

  it("почту и текст не трогает", () => {
    expect(maskContact("name@mail.ru")).toBe("name@mail.ru");
    expect(maskContact("799423щшо")).toBe("799423щшо");
  });

  it("стирать маску можно: пустое остаётся пустым", () => {
    expect(maskContact("")).toBe("");
    expect(maskContact("+")).toBe("+");
  });
});
