import { describe, expect, it } from "vitest";
import { fixEmailLayout, suggestEmailDomains } from "../emailTyping";

describe("раскладка в поле почты", () => {
  it("русская раскладка переводится по клавишам, кавычка становится @", () => {
    expect(fixEmailLayout("лшк")).toBe("kir");
    expect(fixEmailLayout('лшк"нфтвуч')).toBe("kir@yandex");
    expect(fixEmailLayout("Лшк")).toBe("Kir");
    expect(fixEmailLayout("kirюru")).toBe("kir.ru");
  });

  it("латиница не трогается", () => {
    expect(fixEmailLayout("kir@yandex.ru")).toBe("kir@yandex.ru");
    // Буквы уже латиница, а «@» набран в русской раскладке — это кавычка.
    expect(fixEmailLayout('kir"')).toBe("kir@");
    expect(fixEmailLayout('a@b"c')).toBe('a@b"c');
  });
});

describe("подсказки домена", () => {
  it("после @ — популярные сервисы, по набранному началу", () => {
    expect(suggestEmailDomains("kir@")).toEqual(["kir@yandex.ru", "kir@mail.ru", "kir@gmail.com"]);
    expect(suggestEmailDomains("kir@g")).toEqual(["kir@gmail.com"]);
    expect(suggestEmailDomains("kir@ya")).toEqual(["kir@yandex.ru", "kir@ya.ru"]);
  });

  it("без @, без имени, с готовым доменом или незнакомым — пусто", () => {
    expect(suggestEmailDomains("kir")).toEqual([]);
    expect(suggestEmailDomains("@ya")).toEqual([]);
    expect(suggestEmailDomains("kir@gmail.com")).toEqual([]);
    expect(suggestEmailDomains("kir@sklad.ru")).toEqual([]);
  });
});
