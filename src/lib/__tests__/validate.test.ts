import { describe, expect, it } from "vitest";
import cases from "./validate.cases.json";
import {
  checkEmail,
  checkInn,
  checkKpp,
  checkOgrn,
  checkPerson,
  checkPersonName,
  checkPhone,
  checkTitle,
  checkUrl,
} from "../validate";

describe("почта", () => {
  it.each(cases.email.ok)("годится: %s", (v) => expect(checkEmail(v)).toBeNull());
  it.each(cases.email.bad)("не годится: %s", (v) => expect(checkEmail(v)).toBe("valid.email"));
  it("пусто — не ошибка: обязательность решает форма", () => expect(checkEmail("  ")).toBeNull());
});

describe("имя", () => {
  it.each(["Игорь Панов", "Анна-Мария Ли", "O'Neil", "Д. А. Смирнова", "Jean Dupont"])("%s", (v) =>
    expect(checkPersonName(v)).toBeNull(),
  );
  it("цифры в имени", () =>
    expect(checkPersonName("Игорь Панов123123123")).toBe("valid.nameDigits"));
  it("знаки вместо букв", () => {
    expect(checkPersonName("@@@")).toBe("valid.name");
    expect(checkPersonName("И")).toBe("valid.name");
  });
});

describe("должность и названия", () => {
  it.each(["Управляющий", "Кладовщик 2 смены", "ООО «Ромашка Трейд»", "Склад № 3", "1С-админ"])(
    "%s",
    (v) => expect(checkTitle(v)).toBeNull(),
  );
  it("номер-простыня", () =>
    expect(checkTitle("Управляющий 123123123123")).toBe("valid.titleDigits"));
  it("без букв", () => expect(checkTitle("123")).toBe("valid.title"));
  it("длина", () => expect(checkTitle("а".repeat(61))).toBe("valid.tooLong"));
});

describe("телефон", () => {
  it.each([
    "+7 495 123-45-67",
    "8 900 000-00-00",
    "79001234567",
    "+49 30 1234567",
    "+1 212 555 0100",
  ])("%s", (v) => expect(checkPhone(v)).toBeNull());
  it.each(["123123124123542", "+7 123 456-78-90", "7900123", "+0123456789", "тел. 123"])(
    "не годится: %s",
    (v) => expect(checkPhone(v)).toBe("valid.phone"),
  );
});

describe("реквизиты", () => {
  it("ИНН с контрольной суммой", () => {
    expect(checkInn("7707083893")).toBeNull();
    expect(checkInn("7707083894")).toBe("valid.inn");
    expect(checkInn("500100732259")).toBeNull();
  });
  it("КПП", () => {
    expect(checkKpp("773601001")).toBeNull();
    expect(checkKpp("7736AB001")).toBeNull();
    expect(checkKpp("77360100")).toBe("valid.kpp");
  });
  it("ОГРН и ОГРНИП", () => {
    expect(checkOgrn("1027700132195")).toBeNull();
    expect(checkOgrn("1027700132196")).toBe("valid.ogrn");
    expect(checkOgrn("304500116000157")).toBeNull();
    expect(checkOgrn("123")).toBe("valid.ogrn");
  });
});

describe("ссылка", () => {
  it("годится", () => {
    expect(checkUrl("https://u-klad.ru/a.png")).toBeNull();
    expect(checkUrl("data:image/png;base64,AAA")).toBeNull();
  });
  it("не годится", () => {
    expect(checkUrl("javascript:alert(1)")).toBe("valid.url");
    expect(checkUrl("https://localhost/x")).toBe("valid.url");
    expect(checkUrl("просто текст")).toBe("valid.url");
  });
});

it("карточка человека — ошибки по полям, как на скриншоте Кирилла", () => {
  expect(
    checkPerson({
      name: "Игорь Панов123123123",
      role: "Управляющий 123123123123",
      phone: "123123124123542",
      email: "12kirk2005@gmail.com32r23sfddsfsaфыавфыа",
    }),
  ).toEqual({
    name: "valid.nameDigits",
    role: "valid.titleDigits",
    phone: "valid.phone",
    email: "valid.email",
  });
  expect(checkPerson({ name: "Игорь Панов", role: "Управляющий" })).toEqual({});
});
