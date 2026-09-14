import { describe, expect, test } from "vitest";
import { detectLang, splitLangPath } from "../lang";
import { c, fill, pick } from "../copy";

describe("Языковой префикс пути", () => {
  test("английская версия отдаёт язык и остаток пути", () => {
    expect(splitLangPath("/en/market/")).toEqual({ lang: "en", path: "market/" });
    expect(splitLangPath("/en/")).toEqual({ lang: "en", path: "" });
    expect(splitLangPath("/en")).toEqual({ lang: "en", path: "" });
  });

  test("русская версия языка в адресе не несёт", () => {
    expect(splitLangPath("/market/")).toEqual({ lang: null, path: "market/" });
    expect(splitLangPath("/")).toEqual({ lang: null, path: "" });
  });

  test("раздел, начинающийся на те же буквы, префиксом не считается", () => {
    // «/enterprise/» — не английская версия, и срезать у него три буквы
    // значило бы увести человека на несуществующий раздел «terprise».
    expect(splitLangPath("/enterprise/")).toEqual({ lang: null, path: "enterprise/" });
  });
});

describe("Определение языка витрины", () => {
  test("префикс пути важнее всего остального", () => {
    // Адрес сильнее памяти браузера: `/en/market/` из чужой ссылки обязан
    // открыться по-английски у человека, который однажды нажал «RU».
    expect(detectLang("/en/market/", "", "ru", ["ru-RU"])).toBe("en");
    expect(detectLang("/en/", "?lang=ru", "ru", ["ru-RU"])).toBe("en");
  });

  test("русский путь — это выбор, а не его отсутствие", () => {
    // Внутренние страницы русские по адресу, и сохранённый «en» их не
    // перекрашивает: иначе один и тот же адрес показывал бы разный текст.
    expect(detectLang("/market/", "", "en", ["en-US"])).toBe("ru");
  });

  test("параметр адреса важнее сохранённого выбора", () => {
    // Старые ссылки с `?lang=` разошлись до перехода на пути — они должны
    // открываться теми же, какими их видел отправитель.
    expect(detectLang("/", "?lang=en", "ru", ["ru-RU"])).toBe("en");
    expect(detectLang("/", "?lang=ru", "en", ["en-US"])).toBe("ru");
  });

  test("сохранённый выбор важнее языка браузера", () => {
    expect(detectLang("/", "", "en", ["ru-RU"])).toBe("en");
    expect(detectLang("/", "", "ru", ["en-US"])).toBe("ru");
  });

  test("незнакомое значение параметра игнорируется", () => {
    // `?lang=de` не должен уводить страницу в пустой словарь.
    expect(detectLang("/", "?lang=de", null, ["ru-RU"])).toBe("ru");
    expect(detectLang("/", "?lang=", "en", [])).toBe("en");
  });

  test("любой английский диалект — английский", () => {
    expect(detectLang("/", "", null, ["en-GB", "ru"])).toBe("en");
    expect(detectLang("/", "", null, ["en"])).toBe("en");
  });

  test("язык, которого у нас нет, пропускается", () => {
    // Немецкий мы не поддерживаем, поэтому смотрим дальше по списку — там
    // человек уже сам расставил запасные варианты по убыванию удобства.
    expect(detectLang("/", "", null, ["de-DE", "ru-RU"])).toBe("ru");
    expect(detectLang("/", "", null, ["be-BY", "en-US"])).toBe("en");
    // А если запасных нет — русский: витрина про российский рынок.
    expect(detectLang("/", "", null, ["kk-KZ"])).toBe("ru");
  });

  test("без единой подсказки — русский", () => {
    expect(detectLang("/", "", null, [])).toBe("ru");
  });
});

describe("Двуязычные строки", () => {
  test("выбирается строка своего языка", () => {
    const copy = c("Склады", "Warehouses");
    expect(pick("ru", copy)).toBe("Склады");
    expect(pick("en", copy)).toBe("Warehouses");
  });

  test("подстановка заменяет все вхождения", () => {
    expect(fill("{n} из {n}", { n: 5 })).toBe("5 из 5");
    expect(fill("{city}: {n}", { city: "Москва", n: 12 })).toBe("Москва: 12");
  });

  test("строка без подстановок не портится фигурными скобками", () => {
    expect(fill("Ставка {x} ₽", {})).toBe("Ставка {x} ₽");
    expect(fill("Ставка ₽")).toBe("Ставка ₽");
  });
});
