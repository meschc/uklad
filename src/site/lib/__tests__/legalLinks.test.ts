import { describe, expect, it } from "vitest";
import { splitLinks } from "../legalLinks";

describe("splitLinks", () => {
  it("находит документ в любом падеже", () => {
    const parts = splitLinks("в порядке, установленном Политикой обработки персональных данных.");
    expect(parts).toEqual([
      { text: "в порядке, установленном " },
      { text: "Политикой обработки персональных данных", to: "/legal/privacy" },
      { text: "." },
    ]);
  });

  it("документ не ссылается на себя", () => {
    const text = "Пользовательское соглашение применяется наравне с публичной офертой.";
    const links = splitLinks(text, "/legal/offer").filter((p) => p.to);
    expect(links).toEqual([{ text: "Пользовательское соглашение", to: "/legal/terms" }]);
  });

  it("текст без упоминаний остаётся одним куском", () => {
    expect(splitLinks("Срок хранения — три года.")).toEqual([
      { text: "Срок хранения — три года." },
    ]);
  });

  it("куски склеиваются обратно в исходный текст", () => {
    const text = "См. Политику использования cookie и страницу «Тарифы».";
    expect(
      splitLinks(text)
        .map((p) => p.text)
        .join(""),
    ).toBe(text);
  });
});
